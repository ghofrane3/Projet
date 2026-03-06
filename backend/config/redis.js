import { createClient } from 'redis';

let redisClient = null;

export const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connecté');
    });

    await redisClient.connect();
    return redisClient;

  } catch (error) {
    console.error('❌ Erreur connexion Redis:', error);
    // Continuer sans Redis si erreur
    return null;
  }
};

export const getRedisClient = () => redisClient;

// Helper: Get from cache
export const getCache = async (key) => {
  if (!redisClient) return null;

  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Erreur lecture cache:', error);
    return null;
  }
};

// Helper: Set to cache
export const setCache = async (key, data, expireSeconds = 3600) => {
  if (!redisClient) return false;

  try {
    await redisClient.setEx(key, expireSeconds, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Erreur écriture cache:', error);
    return false;
  }
};

// Helper: Delete from cache
export const deleteCache = async (key) => {
  if (!redisClient) return false;

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Erreur suppression cache:', error);
    return false;
  }
};

// Helper: Clear pattern
export const clearCachePattern = async (pattern) => {
  if (!redisClient) return false;

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    return true;
  } catch (error) {
    console.error('Erreur clear pattern:', error);
    return false;
  }
};

export default {
  connectRedis,
  getRedisClient,
  getCache,
  setCache,
  deleteCache,
  clearCachePattern
};
