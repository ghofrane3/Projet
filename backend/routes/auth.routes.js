import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import { authenticateUser } from '../middleware/auth.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../services/email.service.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// INSCRIPTION AVEC VÉRIFICATION EMAIL
// POST /api/auth/register
// ═══════════════════════════════════════════════════════════
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Inscription:', req.body.email);

    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont requis'
      });
    }

    // Vérifier si l'utilisateur existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé'
      });
    }

    // Générer token de vérification
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Créer l'utilisateur (non vérifié)
    const user = await User.create({
      name,
      email,
      password,
      isVerified: false,
      verificationToken,
      verificationTokenExpires
    });

    // Envoyer l'email de vérification
    const emailSent = await sendVerificationEmail(user, verificationToken);

    if (!emailSent) {
      console.log('⚠️ Email non envoyé, mais utilisateur créé');
    }

    console.log('✅ Utilisateur créé (non vérifié):', user.email);

    res.status(201).json({
      success: true,
      message: '📧 Inscription réussie ! Un email de vérification a été envoyé à ' + email,
      needsVerification: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// VÉRIFICATION EMAIL
// GET /api/auth/verify-email/:token
// ═══════════════════════════════════════════════════════════
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    console.log('🔍 Vérification token:', token.substring(0, 10) + '...');

    // Trouver l'utilisateur avec ce token
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('❌ Token invalide ou expiré');
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }

    // Vérifier le compte
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    // Envoyer email de bienvenue
    await sendWelcomeEmail(user);

    console.log('✅ Email vérifié:', user.email);

    res.json({
      success: true,
      message: '✅ Email vérifié avec succès ! Vous pouvez maintenant vous connecter.',
      user: {
        name: user.name,
        email: user.email,
        isVerified: true
      }
    });

  } catch (error) {
    console.error('❌ Erreur vérification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
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
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Ce compte est déjà vérifié'
      });
    }

    // Générer nouveau token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    // Renvoyer l'email
    await sendVerificationEmail(user, verificationToken);

    console.log('✅ Email renvoyé');

    res.json({
      success: true,
      message: '📧 Email de vérification renvoyé'
    });

  } catch (error) {
    console.error('❌ Erreur renvoi:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// CONNEXION AVEC COOKIES (SÉCURISÉ)
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Connexion:', email);

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe requis'
      });
    }

    // Trouver l'utilisateur
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      console.log('❌ Identifiants invalides');
      return res.status(401).json({
        success: false,
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le compte est vérifié (sauf pour admin)
    if (!user.isVerified && user.role !== 'admin') {
      console.log('⚠️ Compte non vérifié');
      return res.status(403).json({
        success: false,
        message: '📧 Veuillez vérifier votre email avant de vous connecter',
        needsVerification: true,
        email: user.email
      });
    }

    // ✅ Générer Access Token (courte durée)
    const accessToken = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        email: user.email
      },
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
      token: refreshToken,
      userId: user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    // Mettre à jour la date de dernière connexion
    user.lastLogin = new Date();
    await user.save();

    // ✅ NOUVEAU : Envoyer les tokens dans des httpOnly cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,  // Pas accessible via JavaScript (protection XSS)
      secure: process.env.NODE_ENV === 'production', // HTTPS seulement en production
      sameSite: 'strict', // Protection CSRF
      maxAge: 60 * 60 * 1000 // 1 heure en millisecondes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours en millisecondes
    });

    console.log('✅ Connexion réussie avec cookies sécurisés');

    // ✅ Envoyer SEULEMENT les données utilisateur (PAS les tokens)
    res.json({
      success: true,
      message: 'Connexion réussie',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// REFRESH TOKEN (avec cookies)
// POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════
router.post('/refresh', async (req, res) => {
  try {
    // ✅ Lire le refresh token depuis le cookie
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token manquant'
      });
    }

    // Vérifier que le token existe en DB et n'est pas révoqué
    const tokenRecord = await RefreshToken.findOne({
      token: refreshToken,
      isRevoked: false
    });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Refresh token invalide ou expiré'
      });
    }

    // Vérifier la signature du token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || (!user.isVerified && user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Utilisateur non valide'
      });
    }

    // ✅ Générer nouveau access token
    const accessToken = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    // ✅ Envoyer le nouveau token dans un cookie
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 heure
    });

    res.json({
      success: true,
      message: 'Token rafraîchi avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur refresh:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// LOGOUT (avec cookies)
// POST /api/auth/logout
// ═══════════════════════════════════════════════════════════
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    // ✅ Lire le refresh token depuis le cookie
    const refreshToken = req.cookies.refreshToken;

    // Révoquer le refresh token en DB
    if (refreshToken) {
      await RefreshToken.updateOne(
        { token: refreshToken },
        { isRevoked: true }
      );
    }

    // ✅ Supprimer les cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    console.log('✅ Déconnexion réussie');

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });

  } catch (error) {
    console.error('❌ Erreur logout:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GET USER INFO (avec cookies)
// GET /api/auth/me
// ═══════════════════════════════════════════════════════════
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('❌ Erreur /me:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

export default router;
