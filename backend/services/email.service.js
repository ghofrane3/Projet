import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Configuration du transporteur email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Vérifier la configuration au démarrage
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Erreur configuration email:', error.message);
    console.log('💡 Vérifiez EMAIL_USER et EMAIL_PASSWORD dans .env');
  } else {
    console.log('✅ Service email prêt');
  }
});

// Template HTML
const baseTemplate = (color, icon, title, content, buttonText, buttonUrl) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f7; padding: 20px; margin: 0; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, ${color[0]}, ${color[1]}); color: white; padding: 40px; text-align: center; }
    .header h1 { font-size: 28px; margin: 10px 0; }
    .icon { font-size: 48px; margin-bottom: 15px; }
    .content { padding: 40px 30px; color: #333; }
    .content h2 { color: #2d3748; font-size: 22px; margin-bottom: 20px; }
    .content p { margin-bottom: 15px; color: #4a5568; font-size: 16px; line-height: 1.6; }
    .button { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, ${color[0]}, ${color[1]}); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
    .info-box { background: #f7fafc; border-left: 4px solid ${color[0]}; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; color: #718096; font-size: 13px; }
    .link { word-break: break-all; color: ${color[0]}; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon">${icon}</div>
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
      ${buttonUrl ? `
        <center><a href="${buttonUrl}" class="button">${buttonText}</a></center>
        <div class="info-box">
          <p><strong>Ou copiez ce lien :</strong></p>
          <p class="link">${buttonUrl}</p>
        </div>
      ` : ''}
    </div>
    <div class="footer">
      <p style="font-weight: bold; font-size: 16px; margin-bottom: 10px;">👕 Fashion Store</p>
      <p>© 2026 Fashion Store - Mode & Vêtements</p>
    </div>
  </div>
</body>
</html>
`;

// EMAIL 1: Vérification
export const sendVerificationEmail = async (user, token) => {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/verify-email?token=${token}`;

  const content = `
    <h2>Bienvenue ${user.name} ! 🎉</h2>
    <p>Merci de vous être inscrit sur Fashion Store.</p>
    <p>Pour activer votre compte, cliquez sur le bouton ci-dessous :</p>
    <div class="info-box">
      <p>⏰ Ce lien expire dans <strong>24 heures</strong>.</p>
    </div>
    <p style="color: #718096; font-size: 14px;">Si vous n'avez pas créé ce compte, ignorez cet email.</p>
  `;

  const html = baseTemplate(
    ['#667eea', '#764ba2'],
    '📧',
    'Vérifiez votre email',
    content,
    '✅ Vérifier mon email',
    url
  );

  try {
    await transporter.sendMail({
      from: `"Fashion Store" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '✅ Vérifiez votre compte Fashion Store',
      html
    });
    console.log('✅ Email de vérification envoyé à:', user.email);
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi email:', error.message);
    return false;
  }
};

// EMAIL 2: Bienvenue
export const sendWelcomeEmail = async (user) => {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/products`;

  const content = `
    <h2>Compte vérifié ! ✨</h2>
    <p>Bonjour <strong>${user.name}</strong>,</p>
    <p>Votre compte a été vérifié avec succès.</p>
    <p>Vous pouvez maintenant :</p>
    <ul style="padding-left: 20px; margin: 15px 0;">
      <li style="margin: 10px 0;">🛍️ Parcourir nos collections</li>
      <li style="margin: 10px 0;">💳 Commander en toute sécurité</li>
      <li style="margin: 10px 0;">📦 Suivre vos commandes</li>
      <li style="margin: 10px 0;">❤️ Sauvegarder vos favoris</li>
    </ul>
  `;

  const html = baseTemplate(
    ['#10b981', '#059669'],
    '🎉',
    'Bienvenue chez Fashion Store',
    content,
    '🛒 Découvrir la boutique',
    url
  );

  try {
    await transporter.sendMail({
      from: `"Fashion Store" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '🎉 Bienvenue chez Fashion Store !',
      html
    });
    console.log('✅ Email de bienvenue envoyé');
    return true;
  } catch (error) {
    console.error('❌ Erreur envoi email:', error.message);
    return false;
  }
};

export default {
  sendVerificationEmail,
  sendWelcomeEmail
};
