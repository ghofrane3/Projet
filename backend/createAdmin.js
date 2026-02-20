import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const createAdmin = async () => {
  try {
    console.log('🔄 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connecté\n');

    // Données de l'admin
    const adminData = {
      name: 'Admin Principal',
      email: 'admin@example.com',
      password: 'admin123',
      role: 'admin'
    };

    // Vérifier si l'admin existe déjà
    const existingAdmin = await User.findOne({ email: adminData.email });

    if (existingAdmin) {
      console.log('⚠️  Un utilisateur avec cet email existe déjà');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Nom:', existingAdmin.name);
      console.log('🔑 Rôle actuel:', existingAdmin.role);

      // Mettre à jour le rôle en admin si ce n'est pas déjà le cas
      if (existingAdmin.role !== 'admin') {
        console.log('\n🔄 Mise à jour du rôle en "admin"...');
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('✅ Rôle mis à jour avec succès !');
      } else {
        console.log('✅ L\'utilisateur est déjà admin');
      }

      console.log('\n📋 INFORMATIONS DE CONNEXION :');
      console.log('════════════════════════════════');
      console.log('📧 Email   :', adminData.email);
      console.log('🔐 Password:', adminData.password);
      console.log('🌐 URL     : http://localhost:4200/admin/dashboard');
      console.log('════════════════════════════════\n');

      process.exit(0);
    }

    // Hasher le mot de passe
    console.log('🔐 Hashage du mot de passe...');
    const hashedPassword = await bcrypt.hash(adminData.password, 10);

    // Créer l'admin
    console.log('👤 Création de l\'administrateur...');
    const admin = await User.create({
      name: adminData.name,
      email: adminData.email,
      password: hashedPassword,
      role: 'admin'
    });

    console.log('✅ Administrateur créé avec succès !\n');
    console.log('📋 INFORMATIONS DE CONNEXION :');
    console.log('════════════════════════════════');
    console.log('📧 Email   :', admin.email);
    console.log('🔐 Password:', adminData.password);
    console.log('👤 Nom     :', admin.name);
    console.log('🆔 ID      :', admin._id);
    console.log('🔑 Rôle    :', admin.role);
    console.log('🌐 URL     : http://localhost:4200/admin/dashboard');
    console.log('════════════════════════════════\n');

    console.log('💡 INSTRUCTIONS :');
    console.log('1. Allez sur http://localhost:4200/login');
    console.log('2. Connectez-vous avec les identifiants ci-dessus');
    console.log('3. Accédez au dashboard : http://localhost:4200/admin/dashboard\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
};

createAdmin();
