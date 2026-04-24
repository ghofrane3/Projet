// backend/scripts/debug-email.js
// Lancer avec : node --experimental-vm-modules scripts/debug-email.js
// OU : node -e "import('./scripts/debug-email.js')"

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';

dotenv.config();

// ── 1. Vérifier les variables d'environnement ────────────────────────────────
console.log('\n📋 ══════════ VARIABLES .env ══════════');
console.log('MONGODB_URI      :', process.env.MONGODB_URI     ? '✅ défini' : '❌ MANQUANT');
console.log('EMAIL_USER       :', process.env.EMAIL_USER      || '❌ MANQUANT');
console.log('EMAIL_PASSWORD   :', process.env.EMAIL_PASSWORD  ? '✅ défini (masqué)' : '❌ MANQUANT');
console.log('FRONTEND_URL     :', process.env.FRONTEND_URL    || 'http://localhost:4200 (défaut)');

// ── 2. Tester la connexion SMTP ──────────────────────────────────────────────
console.log('\n📡 ══════════ TEST SMTP ══════════');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

try {
  await transporter.verify();
  console.log('✅ SMTP OK — connexion Gmail réussie');
} catch (err) {
  console.error('❌ SMTP ÉCHOUÉ :', err.message);
  console.log('\n💡 Solutions possibles :');
  console.log('   1. EMAIL_PASSWORD doit être un "App Password" Gmail (pas votre vrai mot de passe)');
  console.log('   2. Activez "Authentification à 2 facteurs" sur votre compte Google');
  console.log('   3. Créez un App Password sur : https://myaccount.google.com/apppasswords');
  process.exit(1);
}

// ── 3. Vérifier les utilisateurs en base ────────────────────────────────────
console.log('\n🗄️  ══════════ UTILISATEURS EN BASE ══════════');
await mongoose.connect(process.env.MONGODB_URI);
console.log('✅ MongoDB connecté');

// Import dynamique pour éviter les problèmes de chemin
const { default: User } = await import('../models/User.js');

const users = await User.find({}).select('email name firstName lastName _id').limit(10).lean();
if (users.length === 0) {
  console.log('❌ Aucun utilisateur trouvé en base !');
} else {
  console.log(`\nTrouvé ${users.length} utilisateur(s) :`);
  users.forEach((u, i) => {
    const nom = u.firstName || u.name || '(sans nom)';
    console.log(`  [${i + 1}] ID: ${u._id} | email: ${u.email || '❌ PAS D\'EMAIL'} | nom: ${nom}`);
  });
}

// ── 4. Tester l'envoi d'un email réel ───────────────────────────────────────
console.log('\n📧 ══════════ TEST ENVOI EMAIL ══════════');

// Prend le premier utilisateur avec un email
const testUser = users.find(u => u.email);
if (!testUser) {
  console.error('❌ Aucun utilisateur avec un email trouvé en base');
  process.exit(1);
}

console.log(`Envoi d'un email de test à : ${testUser.email}`);

try {
  await transporter.sendMail({
    from: `"Fashion Store TEST" <${process.env.EMAIL_USER}>`,
    to: testUser.email,
    subject: '🧪 Test email Fashion Store — diagnostic',
    html: `
      <div style="font-family:Arial;padding:20px;background:#f4f4f7;">
        <div style="max-width:500px;margin:0 auto;background:white;padding:30px;border-radius:12px;">
          <h2 style="color:#10b981;">✅ Email de test reçu !</h2>
          <p>Bonjour <strong>${testUser.firstName || testUser.name || 'utilisateur'}</strong>,</p>
          <p>Si vous lisez ceci, la configuration email fonctionne correctement.</p>
          <p style="color:#718096;font-size:13px;">
            Envoyé depuis : ${process.env.EMAIL_USER}<br>
            User ID : ${testUser._id}<br>
            Date : ${new Date().toLocaleString('fr-FR')}
          </p>
        </div>
      </div>`,
  });
  console.log(`✅ Email de test envoyé avec succès à ${testUser.email}`);
  console.log('\n🎉 Tout fonctionne ! Vérifiez votre boîte mail (et les spams).');
} catch (err) {
  console.error('❌ Envoi échoué :', err.message);
}

await mongoose.disconnect();
process.exit(0);
