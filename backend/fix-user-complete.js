import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  isVerified: Boolean,
  verificationToken: String,
  verificationTokenExpires: Date
});

const User = mongoose.model('User', userSchema);

async function fixUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connecté');

    const email = 'minghofrane3@gmail.com';
    const newPassword = 'admin123';

    // Vérifier si l'utilisateur existe
    let user = await User.findOne({ email });

    if (!user) {
      console.log('❌ Utilisateur non trouvé. Création...');

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user = await User.create({
        name: 'Admin',
        email: email,
        password: hashedPassword,
        role: 'admin',
        isVerified: true
      });

      console.log('✅ Utilisateur créé !');
    } else {
      console.log('✅ Utilisateur trouvé. Mise à jour...');

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      user.password = hashedPassword;
      user.isVerified = true;
      user.role = 'admin';
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;

      await user.save();

      console.log('✅ Utilisateur mis à jour !');
    }

    console.log('\n📋 Informations de connexion :');
    console.log('Email:', email);
    console.log('Password:', newPassword);
    console.log('Role:', user.role);
    console.log('Vérifié:', user.isVerified);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

fixUser();
