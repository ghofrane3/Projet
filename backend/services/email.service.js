// backend/services/email.service.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// ════════════════════════════════════════════════════════════════════════════
// DEBUG au démarrage
// ════════════════════════════════════════════════════════════════════════════
console.log('📧 [EmailService] Initialisation...');
console.log(`   EMAIL_USER     = ${process.env.EMAIL_USER || '❌ NON DÉFINI'}`);
console.log(`   EMAIL_PASSWORD = ${process.env.EMAIL_PASSWORD
  ? '✅ défini (' + process.env.EMAIL_PASSWORD.length + ' chars)'
  : '❌ NON DÉFINI'}`);

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  console.error('❌ [EmailService] Variables EMAIL manquantes dans .env — aucun email ne sera envoyé.');
}

// ════════════════════════════════════════════════════════════════════════════
// Helper
// ════════════════════════════════════════════════════════════════════════════
const displayName = (user) =>
  user?.firstName || user?.name?.split(' ')[0] || user?.name || 'Client';

// ════════════════════════════════════════════════════════════════════════════
// Transporteur SMTP Gmail — port 587 STARTTLS (plus fiable que 465)
// ════════════════════════════════════════════════════════════════════════════
const createTransporter = () =>
  nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout:   5000,
    socketTimeout:     10000,
  });

let transporter = createTransporter();

transporter.verify((error) => {
  if (error) {
    console.error('❌ [EmailService] SMTP échoué :', error.message, '| Code :', error.code);
    if (error.code === 'EAUTH') {
      console.error('   → Utilisez un "Mot de passe d\'application" Google :');
      console.error('     https://myaccount.google.com/apppasswords');
    }
  } else {
    console.log('✅ [EmailService] SMTP Gmail connecté');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Envoi centralisé
// ════════════════════════════════════════════════════════════════════════════
const sendMail = async (to, subject, html) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn(`⚠️  [EmailService] Config manquante — email ignoré pour ${to}`);
    return false;
  }
  if (!to) {
    console.warn('⚠️  [EmailService] Destinataire manquant');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from:    `"Fashion Store 👕" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ [EmailService] Envoyé → ${to} | MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ [EmailService] Échec → ${to} | ${error.message} | Code: ${error.code}`);
    if (error.code === 'EAUTH' || error.code === 'ECONNRESET') {
      transporter = createTransporter(); // reset
    }
    return false;
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Template HTML
// ════════════════════════════════════════════════════════════════════════════
const baseTemplate = (color, icon, title, content, buttonText, buttonUrl) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;background:#f4f4f7;padding:20px;margin:0}
    .container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)}
    .header{background:linear-gradient(135deg,${color[0]},${color[1]});color:#fff;padding:40px;text-align:center}
    .header h1{font-size:28px;margin:10px 0}
    .icon{font-size:48px;margin-bottom:15px}
    .content{padding:40px 30px;color:#333}
    .content h2{color:#2d3748;font-size:22px;margin-bottom:20px}
    .content p{margin-bottom:15px;color:#4a5568;font-size:16px;line-height:1.6}
    .button{display:inline-block;padding:16px 40px;background:linear-gradient(135deg,${color[0]},${color[1]});color:#fff!important;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0}
    .info-box{background:#f7fafc;border-left:4px solid ${color[0]};padding:15px;margin:20px 0;border-radius:4px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:10px 6px}
    th{border-bottom:2px solid #e2e8f0;text-align:left;font-size:14px;color:#718096}
    td{border-bottom:1px solid #e2e8f0;font-size:15px}
    .total-row td{border-bottom:none;font-weight:bold;font-size:17px;padding-top:14px}
    .footer{background:#f7fafc;padding:30px;text-align:center;border-top:1px solid #e2e8f0;color:#718096;font-size:13px}
    .badge{display:inline-block;background:${color[0]};color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:bold}
  </style>
</head>
<body>
<div class="container">
  <div class="header"><div class="icon">${icon}</div><h1>${title}</h1></div>
  <div class="content">
    ${content}
    ${buttonUrl ? `
      <center style="margin-top:24px">
        <a href="${buttonUrl}" class="button">${buttonText}</a>
      </center>
      <div class="info-box" style="margin-top:16px">
        <p style="margin:0"><strong>Ou copiez ce lien :</strong></p>
        <p style="margin:6px 0 0;word-break:break-all;color:${color[0]};font-size:14px">${buttonUrl}</p>
      </div>` : ''}
  </div>
  <div class="footer">
    <p style="font-weight:bold;font-size:16px;margin-bottom:6px">👕 Fashion Store</p>
    <p style="margin:0">© 2026 Fashion Store — Mode &amp; Vêtements</p>
  </div>
</div>
</body>
</html>`;

// ════════════════════════════════════════════════════════════════════════════
// EMAIL 1 : Vérification compte
// ════════════════════════════════════════════════════════════════════════════
export const sendVerificationEmail = async (user, token) => {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/verify-email?token=${token}`;
  const content = `
    <h2>Bienvenue ${displayName(user)} ! 🎉</h2>
    <p>Merci de vous être inscrit sur Fashion Store.</p>
    <p>Pour activer votre compte, cliquez sur le bouton ci-dessous :</p>
    <div class="info-box"><p style="margin:0">⏰ Ce lien expire dans <strong>24 heures</strong>.</p></div>
    <p style="color:#718096;font-size:14px">Si vous n'avez pas créé ce compte, ignorez cet email.</p>`;
  return sendMail(
    user.email,
    '✅ Vérifiez votre compte Fashion Store',
    baseTemplate(['#667eea','#764ba2'], '📧', 'Vérifiez votre email', content, '✅ Vérifier mon email', url)
  );
};

// ════════════════════════════════════════════════════════════════════════════
// EMAIL 2 : Bienvenue
// ════════════════════════════════════════════════════════════════════════════
export const sendWelcomeEmail = async (user) => {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/products`;
  const content = `
    <h2>Compte vérifié ! ✨</h2>
    <p>Bonjour <strong>${displayName(user)}</strong>,</p>
    <p>Votre compte a été vérifié avec succès. Vous pouvez maintenant :</p>
    <ul style="padding-left:20px;margin:15px 0">
      <li style="margin:10px 0">🛍️ Parcourir nos collections</li>
      <li style="margin:10px 0">💳 Commander en toute sécurité</li>
      <li style="margin:10px 0">📦 Suivre vos commandes</li>
      <li style="margin:10px 0">❤️ Sauvegarder vos favoris</li>
    </ul>`;
  return sendMail(
    user.email,
    '🎉 Bienvenue chez Fashion Store !',
    baseTemplate(['#10b981','#059669'], '🎉', 'Bienvenue chez Fashion Store', content, '🛒 Découvrir la boutique', url)
  );
};

// ════════════════════════════════════════════════════════════════════════════
// EMAIL 3 : Confirmation de commande
// ✅ NOM UNIQUE : sendOrderConfirmation — utilisé partout (order.routes.js + payment.js)
// ════════════════════════════════════════════════════════════════════════════
export const sendOrderConfirmation = async (user, order) => {
  const itemsHtml = (order.products || []).map((item) => {
    const p     = item.productId;
    const name  = p?.name  || 'Produit';
    const price = item.price || p?.price || 0;
    const qty   = item.quantity || 1;
    return `<tr>
      <td>${name}</td>
      <td style="text-align:center">${qty}</td>
      <td style="text-align:right">${(price * qty).toFixed(2)} TND</td>
    </tr>`;
  }).join('');

  const addr     = order.shippingAddress;
  const addrHtml = addr
    ? `<p style="margin:6px 0">${[addr.street, addr.zipCode, addr.city, addr.country].filter(Boolean).join(', ')}</p>`
    : '<p style="margin:6px 0;color:#718096">Non renseignée</p>';

  const orderId = String(order._id).slice(-8).toUpperCase();

  const content = `
    <h2>Merci pour votre commande, ${displayName(user)} ! 🎉</h2>
    <p>Votre commande <span class="badge">#${orderId}</span> a bien été reçue et est en cours de traitement.</p>
    <div class="info-box">
      <table>
        <thead>
          <tr>
            <th>Article</th>
            <th style="text-align:center">Qté</th>
            <th style="text-align:right">Prix</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr class="total-row">
            <td colspan="2">Total</td>
            <td style="text-align:right"><strong>${(order.totalAmount || 0).toFixed(2)} TND</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <h3 style="margin-top:24px;color:#2d3748">📍 Adresse de livraison</h3>
    ${addrHtml}
    <p style="color:#718096;font-size:14px;margin-top:20px">
      Vous recevrez un email dès que votre commande sera expédiée.
    </p>`;

  return sendMail(
    user.email,
    `📦 Commande #${orderId} confirmée — Fashion Store`,
    baseTemplate(
      ['#10b981','#059669'], '📦', 'Commande confirmée', content,
      '🔍 Suivre ma commande',
      `${process.env.FRONTEND_URL || 'http://localhost:4200'}/account/orders`
    )
  );
};

// ════════════════════════════════════════════════════════════════════════════
// EMAIL 4 : Expédition  (lit automatiquement order.delivery)
// ════════════════════════════════════════════════════════════════════════════
export const sendOrderShipped = async (user, order) => {
  const orderId        = String(order._id).slice(-8).toUpperCase();
  const trackingNumber = order.delivery?.trackingNumber || null;
  const carrier        = order.delivery?.carrier        || null;
  const estimatedDate  = order.delivery?.estimatedDate
    ? new Date(order.delivery.estimatedDate).toLocaleDateString('fr-FR')
    : null;

  const content = `
    <h2>Votre commande est en route, ${displayName(user)} ! 🚚</h2>
    <p>La commande <span class="badge">#${orderId}</span> a été expédiée.</p>
    ${carrier || trackingNumber ? `
    <div class="info-box">
      ${carrier        ? `<p style="margin:4px 0">🚛 <strong>Transporteur :</strong> ${carrier}</p>` : ''}
      ${trackingNumber ? `<p style="margin:4px 0">📋 <strong>Numéro de suivi :</strong> ${trackingNumber}</p>` : ''}
      ${estimatedDate  ? `<p style="margin:4px 0">📅 <strong>Livraison estimée :</strong> ${estimatedDate}</p>` : ''}
    </div>` : ''}
    <p>Délai estimé : <strong>3 à 5 jours ouvrés</strong>.</p>
    <p style="color:#718096;font-size:14px">Vous recevrez un email de confirmation dès la livraison.</p>`;

  return sendMail(
    user.email,
    `🚚 Commande #${orderId} expédiée — Fashion Store`,
    baseTemplate(
      ['#3b82f6','#1d4ed8'], '🚚', 'Commande expédiée', content,
      '📍 Suivre ma livraison',
      `${process.env.FRONTEND_URL || 'http://localhost:4200'}/account/orders`
    )
  );
};

// ════════════════════════════════════════════════════════════════════════════
// EMAIL 5 : Livraison confirmée
// ════════════════════════════════════════════════════════════════════════════
export const sendOrderDelivered = async (user, order) => {
  const orderId = String(order._id).slice(-8).toUpperCase();
  const content = `
    <h2>Votre commande est arrivée, ${displayName(user)} ! ✨</h2>
    <p>La commande <span class="badge">#${orderId}</span> a été livrée avec succès.</p>
    <p>Nous espérons que vous êtes satisfait(e) de votre achat !</p>
    <p>N'hésitez pas à laisser un avis — votre retour nous aide à nous améliorer.</p>`;
  return sendMail(
    user.email,
    `✅ Commande #${orderId} livrée — Fashion Store`,
    baseTemplate(
      ['#10b981','#059669'], '✅', 'Commande livrée', content,
      '⭐ Laisser un avis',
      `${process.env.FRONTEND_URL || 'http://localhost:4200'}/products`
    )
  );
};

// ════════════════════════════════════════════════════════════════════════════
// EMAIL 6 : Annulation
// ════════════════════════════════════════════════════════════════════════════
export const sendOrderCancelled = async (user, order) => {
  const orderId = String(order._id).slice(-8).toUpperCase();
  const content = `
    <h2>Commande annulée</h2>
    <p>Bonjour ${displayName(user)},</p>
    <p>La commande <span class="badge">#${orderId}</span> a bien été annulée.</p>
    <p>Si vous avez été débité(e), le remboursement sera effectué sous <strong>3 à 5 jours ouvrés</strong>.</p>
    <p style="color:#718096;font-size:14px">Si vous pensez qu'il s'agit d'une erreur, répondez à cet email.</p>`;
  return sendMail(
    user.email,
    `❌ Commande #${orderId} annulée — Fashion Store`,
    baseTemplate(
      ['#ef4444','#dc2626'], '❌', 'Commande annulée', content,
      '🛍️ Retourner à la boutique',
      `${process.env.FRONTEND_URL || 'http://localhost:4200'}/products`
    )
  );
};

// ════════════════════════════════════════════════════════════════════════════
// EMAIL 7 : Statut générique
// ════════════════════════════════════════════════════════════════════════════
export const sendOrderStatusUpdate = async (user, order, status) => {
  const labels = {
    processing: { icon: '⚙️', title: 'En préparation', text: 'est en cours de préparation.' },
    shipped:    { icon: '🚚', title: 'Expédiée',        text: 'a été expédiée.'             },
    delivered:  { icon: '✅', title: 'Livrée',          text: 'a été livrée.'               },
    cancelled:  { icon: '❌', title: 'Annulée',         text: 'a été annulée.'              },
  };
  const cfg     = labels[status] || { icon: '📋', title: 'Mise à jour', text: 'a été mise à jour.' };
  const orderId = String(order._id).slice(-8).toUpperCase();
  const content = `
    <h2>Mise à jour de votre commande</h2>
    <p>Bonjour ${displayName(user)},</p>
    <p>La commande <span class="badge">#${orderId}</span> ${cfg.text}</p>`;
  return sendMail(
    user.email,
    `${cfg.icon} Commande #${orderId} : ${cfg.title} — Fashion Store`,
    baseTemplate(
      ['#667eea','#764ba2'], cfg.icon, cfg.title, content,
      '📦 Voir mes commandes',
      `${process.env.FRONTEND_URL || 'http://localhost:4200'}/account/orders`
    )
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Export — NOM UNIQUE sendOrderConfirmation dans les deux exports
// ════════════════════════════════════════════════════════════════════════════
export default {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendOrderConfirmation,       // ✅ nom unifié (plus de "Email" à la fin)
  sendOrderShipped,
  sendOrderDelivered,
  sendOrderCancelled,
  sendOrderStatusUpdate,
};
