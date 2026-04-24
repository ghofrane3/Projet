import express from 'express';
import jwt     from 'jsonwebtoken';
import crypto  from 'crypto';
import User          from '../models/User.js';
import RefreshToken  from '../models/RefreshToken.js';
import { authenticateUser } from '../middleware/auth.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../services/email.service.js';
import cacheService from '../services/cache.service.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// INSCRIPTION AVEC VÉRIFICATION EMAIL
// POST /api/auth/register
// ✅ Invalide le cache utilisateurs + notification "user_registered"
// ═══════════════════════════════════════════════════════════
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Inscription:', req.body.email);

    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont requis',
      });
    }

    // Vérifier si l'utilisateur existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé',
      });
    }

    // Générer token de vérification
    const verificationToken        = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Créer l'utilisateur (non vérifié)
    const user = await User.create({
      name,
      email,
      password,
      isVerified: false,
      verificationToken,
      verificationTokenExpires,
    });

    // Envoyer l'email de vérification
    const emailSent = await sendVerificationEmail(user, verificationToken);
    if (!emailSent) console.log('⚠️ Email non envoyé, mais utilisateur créé');

    console.log('✅ Utilisateur créé (non vérifié):', user.email);

    // ✅ Invalide le cache liste des utilisateurs (admin dashboard)
    // → notification éviction "user_registered"
    await cacheService.invalidate('user_registered');

    res.status(201).json({
      success:           true,
      message:           '📧 Inscription réussie ! Un email de vérification a été envoyé à ' + email,
      needsVerification: true,
      user: {
        id:         user._id,
        name:       user.name,
        email:      user.email,
        isVerified: user.isVerified,
      },
    });

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error:   error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════
// VÉRIFICATION EMAIL
// GET /api/auth/verify-email/:token
// ✅ Invalide la clé du profil utilisateur + notification "user_updated"
// ═══════════════════════════════════════════════════════════
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    console.log('🔍 Vérification token:', token.substring(0, 10) + '...');

    const user = await User.findOne({
      verificationToken:         token,
      verificationTokenExpires:  { $gt: Date.now() },
    });

    if (!user) {
      console.log('❌ Token invalide ou expiré');
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré',
      });
    }

    // Vérifier le compte
    user.isVerified              = true;
    user.verificationToken       = null;
    user.verificationTokenExpires = null;
    await user.save();

    // Envoyer email de bienvenue
    await sendWelcomeEmail(user);

    console.log('✅ Email vérifié:', user.email);

    // ✅ Invalide le profil en cache
    await cacheService.invalidateKey(`user:${user._id}`, 'user_updated');

    res.json({
      success: true,
      message: '✅ Email vérifié avec succès ! Vous pouvez maintenant vous connecter.',
      user: {
        name:       user.name,
        email:      user.email,
        isVerified: true,
      },
    });

  } catch (error) {
    console.error('❌ Erreur vérification:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// RENVOYER EMAIL DE VÉRIFICATION
// POST /api/auth/resend-verification
// ═══════════════════════════════════════════════════════════
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('📧 Renvoi email:', email);

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Ce compte est déjà vérifié' });
    }

    // Générer nouveau token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken        = verificationToken;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user, verificationToken);

    console.log('✅ Email renvoyé');

    res.json({ success: true, message: '📧 Email de vérification renvoyé' });

  } catch (error) {
    console.error('❌ Erreur renvoi:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// CONNEXION AVEC COOKIES (SÉCURISÉ)
// POST /api/auth/login
// (pas d'invalidation cache — lecture seule)
// ═══════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Connexion:', email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe requis',
      });
    }

    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      console.log('❌ Identifiants invalides');
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect',
      });
    }

    // Vérifier si le compte est vérifié (sauf pour admin)
    if (!user.isVerified && user.role !== 'admin') {
      console.log('⚠️ Compte non vérifié');
      return res.status(403).json({
        success:           false,
        message:           '📧 Veuillez vérifier votre email avant de vous connecter',
        needsVerification: true,
        email:             user.email,
      });
    }

    // ✅ Générer Access Token (courte durée)
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    // ✅ Générer Refresh Token (longue durée)
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
    );

    // Sauvegarder refresh token en DB
    await RefreshToken.create({
      token:     refreshToken,
      userId:    user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Mettre à jour la date de dernière connexion
    user.lastLogin = new Date();
    await user.save();

    // ✅ Envoyer les tokens dans des httpOnly cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   60 * 60 * 1000, // 1 heure
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 jours
    });

    console.log('✅ Connexion réussie avec cookies sécurisés');

    res.json({
      success: true,
      message: 'Connexion réussie',
      user: {
        id:         user._id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        isVerified: user.isVerified,
      },
    });

  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// REFRESH TOKEN (avec cookies)
// POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token manquant' });
    }

    const tokenRecord = await RefreshToken.findOne({
      token:     refreshToken,
      isRevoked: false,
    });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Refresh token invalide ou expiré',
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user    = await User.findById(decoded.userId);

    if (!user || (!user.isVerified && user.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Utilisateur non valide' });
    }

    const accessToken = jwt.sign(
      { userId: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   60 * 60 * 1000,
    });

    res.json({ success: true, message: 'Token rafraîchi avec succès' });

  } catch (error) {
    console.error('❌ Erreur refresh:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// LOGOUT (avec cookies)
// POST /api/auth/logout
// ═══════════════════════════════════════════════════════════
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await RefreshToken.updateOne({ token: refreshToken }, { isRevoked: true });
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    console.log('✅ Déconnexion réussie');
    res.json({ success: true, message: 'Déconnexion réussie' });

  } catch (error) {
    console.error('❌ Erreur logout:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET USER INFO (avec cookies)
// GET /api/auth/me
// ═══════════════════════════════════════════════════════════
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const userId   = req.user.userId;
    const cacheKey = `user:${userId}`;

    // ── Tentative cache ─────────────────────────────────────────────────────
    const cached = await cacheService.getByKey(cacheKey, 180);
    if (cached) {
      return res.json({ success: true, user: cached, source: 'cache' });
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const profile = {
      id:         user._id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      isVerified: user.isVerified,
    };

    await cacheService.setWithTTL(cacheKey, profile, 180);

    res.json({ success: true, user: profile });

  } catch (error) {
    console.error('❌ Erreur /me:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// MISE À JOUR PROFIL
// PUT /api/auth/profile
// ✅ Invalide la clé du profil + notification "user_updated"
// ═══════════════════════════════════════════════════════════
router.put('/profile', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, phone, address } = req.body;

    const updateData = {};
    if (name)    updateData.name    = name;
    if (phone)   updateData.phone   = phone;
    if (address) updateData.address = address;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // ✅ Invalide le profil en cache
    await cacheService.invalidateKey(`user:${userId}`, 'user_updated');

    res.json({
      success: true,
      message: 'Profil mis à jour',
      user: {
        id:         user._id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        isVerified: user.isVerified,
      },
    });

  } catch (error) {
    console.error('❌ Erreur update profil:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// OUBLI MOT DE PASSE — envoie un email avec lien de reset
// POST /api/auth/forgot-password
// ═══════════════════════════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email requis' });
    }

    const user = await User.findOne({ email });

    // Toujours répondre OK pour ne pas révéler si l'email existe
    if (!user) {
      return res.json({
        success: true,
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé.',
      });
    }

    // Générer token de reset (1h)
    const resetToken        = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);

    user.resetPasswordToken   = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    await user.save();

    // Envoyer l'email
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/auth/reset-password?token=${resetToken}`;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f7;padding:20px;margin:0}
  .container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)}
  .header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:40px;text-align:center}
  .header h1{font-size:26px;margin:10px 0}
  .icon{font-size:48px;margin-bottom:10px}
  .content{padding:40px 30px;color:#333}
  .content p{margin-bottom:15px;color:#4a5568;font-size:16px;line-height:1.6}
  .button{display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff!important;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0}
  .info-box{background:#f7fafc;border-left:4px solid #667eea;padding:15px;margin:20px 0;border-radius:4px}
  .footer{background:#f7fafc;padding:30px;text-align:center;border-top:1px solid #e2e8f0;color:#718096;font-size:13px}
</style>
</head>
<body>
<div class="container">
  <div class="header"><div class="icon">🔐</div><h1>Réinitialisation du mot de passe</h1></div>
  <div class="content">
    <h2>Bonjour ${user.name || user.email} !</h2>
    <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
    <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
    <center style="margin-top:24px">
      <a href="${resetUrl}" class="button">🔑 Réinitialiser mon mot de passe</a>
    </center>
    <div class="info-box">
      <p style="margin:0">⏰ Ce lien expire dans <strong>1 heure</strong>.</p>
      <p style="margin:6px 0 0;word-break:break-all;color:#667eea;font-size:14px">${resetUrl}</p>
    </div>
    <p style="color:#718096;font-size:14px">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
  </div>
  <div class="footer">
    <p style="font-weight:bold;font-size:16px;margin-bottom:6px">👕 Fashion Store</p>
    <p style="margin:0">© 2026 Fashion Store — Mode &amp; Vêtements</p>
  </div>
</div>
</body>
</html>`;

    const { sendMail } = await import('../services/email.service.js');
    // Utilise directement nodemailer via le transporter existant
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: `"Fashion Store 👕" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '🔐 Réinitialisation de votre mot de passe — Fashion Store',
      html,
    });

    console.log(`📧 Email reset envoyé → ${user.email}`);

    res.json({
      success: true,
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.',
    });

  } catch (error) {
    console.error('❌ Erreur forgot-password:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════
// RESET MOT DE PASSE — vérifie le token et change le mdp
// POST /api/auth/reset-password
// ═══════════════════════════════════════════════════════════
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token et mot de passe requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit faire au moins 6 caractères' });
    }

    const user = await User.findOne({
      resetPasswordToken:   token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Lien invalide ou expiré. Veuillez refaire une demande.',
      });
    }

    // Mettre à jour le mot de passe (le modèle User hash automatiquement via pre-save)
    user.password             = password;
    user.resetPasswordToken   = null;
    user.resetPasswordExpires = null;
    await user.save();

    console.log(`✅ Mot de passe réinitialisé pour ${user.email}`);

    res.json({
      success: true,
      message: '✅ Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.',
    });

  } catch (error) {
    console.error('❌ Erreur reset-password:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

export default router;
