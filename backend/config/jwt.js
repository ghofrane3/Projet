import jwt from 'jsonwebtoken';
import RefreshToken from '../models/RefreshToken.js';

/**
 * Génère un Access Token JWT (courte durée)
 */
export const generateAccessToken = (userId, email, role = 'customer') => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET n\'est pas défini');
  }

  return jwt.sign(
    { userId: userId.toString(), email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

/**
 * Génère un Refresh Token JWT (longue durée)
 */
export const generateRefreshToken = async (userId, ipAddress) => {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error('REFRESH_TOKEN_SECRET n\'est pas défini');
  }

  // Créer le refresh token JWT
  const refreshToken = jwt.sign(
    { userId: userId.toString() },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );

  // Calculer la date d'expiration (7 jours par défaut)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Sauvegarder en base de données
  const refreshTokenDoc = await RefreshToken.create({
    token: refreshToken,
    userId,
    expiresAt,
    createdByIp: ipAddress || 'unknown'
  });

  return refreshTokenDoc;
};

/**
 * Vérifie et décode un Access Token
 */
export const verifyAccessToken = (token) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET n\'est pas défini');
    }
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('Erreur de vérification du token:', error.message);
    return null;
  }
};

/**
 * Vérifie un Refresh Token
 */
export const verifyRefreshToken = async (token) => {
  try {
    if (!process.env.REFRESH_TOKEN_SECRET) {
      throw new Error('REFRESH_TOKEN_SECRET n\'est pas défini');
    }

    // 1. Vérifier la signature JWT
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

    // 2. Vérifier si le token existe en base et est actif
    const refreshTokenDoc = await RefreshToken.findOne({ token });

    if (!refreshTokenDoc) {
      console.log('❌ Refresh token non trouvé en base');
      return null;
    }

    if (!refreshTokenDoc.isActive()) {
      console.log('❌ Refresh token révoqué ou expiré');
      return null;
    }

    console.log('✅ Refresh token valide:', decoded.userId);
    return decoded;
  } catch (error) {
    console.error('❌ Erreur de vérification du refresh token:', error.message);
    return null;
  }
};

/**
 * Révoquer un Refresh Token
 */
export const revokeRefreshToken = async (token, ipAddress) => {
  try {
    const refreshTokenDoc = await RefreshToken.findOne({ token });

    if (!refreshTokenDoc) {
      throw new Error('Token introuvable');
    }

    // Marquer comme révoqué
    refreshTokenDoc.revokedAt = new Date();
    refreshTokenDoc.revokedByIp = ipAddress || 'unknown';
    await refreshTokenDoc.save();

    console.log('✅ Refresh token révoqué');
    return refreshTokenDoc;
  } catch (error) {
    console.error('❌ Erreur révocation:', error.message);
    throw error;
  }
};

/**
 * Supprimer tous les refresh tokens d'un utilisateur
 */
export const revokeAllUserTokens = async (userId) => {
  try {
    const result = await RefreshToken.updateMany(
      { userId, revokedAt: null },
      { revokedAt: new Date() }
    );
    console.log(`✅ ${result.modifiedCount} tokens révoqués pour l'utilisateur ${userId}`);
    return result;
  } catch (error) {
    console.error('❌ Erreur révocation multiple:', error.message);
    throw error;
  }
};
