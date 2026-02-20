//auth.js
import { verifyAccessToken } from '../config/jwt.js';

// Middleware pour vérifier l'Access Token
export const authenticateUser = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token non fourni',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Access token invalide ou expiré',
        code: 'INVALID_TOKEN'
      });
    }

    // Ajouter les infos utilisateur à la requête
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentification échouée',
      code: 'AUTH_FAILED'
    });
  }
};

// Middleware pour vérifier le rôle admin
export const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé : droits administrateur requis'
    });
  }
  next();
};
