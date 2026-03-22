import jwt from 'jsonwebtoken';

// ════════════════════════════════════════════════════════════
// MIDDLEWARE AUTHENTIFICATION (avec cookies httpOnly)
// ════════════════════════════════════════════════════════════
export const authenticateUser = (req, res, next) => {
  try {
    // ✅ NOUVEAU : Lire le token depuis le cookie au lieu du header
    const token = req.cookies.accessToken;

    // Vérifier si le token existe
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié - Token manquant',
        code: 'NO_TOKEN'
      });
    }

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide',
        code: 'INVALID_TOKEN'
      });
    }

    // ✅ Ajouter les infos utilisateur à la requête
    req.user = decoded;

    // Passer au middleware suivant
    next();

  } catch (error) {
    // Gérer les différents types d'erreurs JWT
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide',
        code: 'INVALID_TOKEN'
      });
    }

    // Erreur générique
    return res.status(401).json({
      success: false,
      message: 'Authentification échouée',
      code: 'AUTH_FAILED',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ════════════════════════════════════════════════════════════
// MIDDLEWARE AUTORISATION ADMIN
// ════════════════════════════════════════════════════════════
export const authorizeAdmin = (req, res, next) => {
  try {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'NO_AUTH'
      });
    }

    // Vérifier le rôle admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé : droits administrateur requis',
        code: 'FORBIDDEN'
      });
    }

    next();

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions',
      code: 'SERVER_ERROR'
    });
  }
};

// ════════════════════════════════════════════════════════════
// MIDDLEWARE OPTIONNEL (pour routes publiques avec user optionnel)
// ════════════════════════════════════════════════════════════
export const optionalAuth = (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
      } catch (error) {
        // Token invalide ou expiré, mais on continue quand même
        req.user = null;
      }
    } else {
      req.user = null;
    }

    next();

  } catch (error) {
    req.user = null;
    next();
  }
};

// ════════════════════════════════════════════════════════════
// EXPORTS PAR DÉFAUT
// ════════════════════════════════════════════════════════════
export default authenticateUser;
