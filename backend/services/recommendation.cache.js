// ============================================================
// services/recommendation.cache.js
// Cache Redis pour les recommandations
// ─────────────────────────────────────────────────────────────
// Stratégie de cache :
//   • TTL court (2 min) pour recommandations personnalisées
//   • TTL long (15 min) pour recommandations globales par catégorie
//   • Invalidation automatique quand une nouvelle interaction arrive
// ============================================================

import { createClient } from 'redis';

// ─── Durées de vie du cache (en secondes) ───────────────────
const TTL = {
  global:       15 * 60,  // 15 minutes — recommandations globales
  personalized:  2 * 60,  // 2 minutes  — recommandations personnalisées
  popularity:   30 * 60,  // 30 minutes — popularité des catégories
};

// ─── Préfixes de clé Redis ───────────────────────────────────
const KEY_PREFIX = {
  global:       'reco:global:',
  personalized: 'reco:user:',
  popularity:   'reco:popularity',
};

// ─── Instance Redis (singleton via globalThis) ───────────────
let redisClient = null;

export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) return redisClient;

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 5) return new Error('Redis: trop de tentatives de reconnexion');
        return Math.min(retries * 100, 2000);
      },
    },
  });

  redisClient.on('error', (err) => {
    console.error('[RecoCache] Erreur Redis:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('[RecoCache] Connecté à Redis');
  });

  await redisClient.connect();
  return redisClient;
}

// ============================================================
// LECTURE DU CACHE
// ============================================================
export async function getCachedRecommendations(key) {
  try {
    const client = await getRedisClient();
    const cached = await client.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    // Redis indisponible → on continue sans cache
    console.warn('[RecoCache] get() échoué, bypass cache:', err.message);
    return null;
  }
}

// ============================================================
// ÉCRITURE DANS LE CACHE
// ============================================================
export async function setCachedRecommendations(key, data, ttlSeconds = TTL.global) {
  try {
    const client = await getRedisClient();
    await client.setEx(key, ttlSeconds, JSON.stringify(data));
  } catch (err) {
    console.warn('[RecoCache] set() échoué:', err.message);
  }
}

// ============================================================
// INVALIDATION DU CACHE (quand une interaction est enregistrée)
// ============================================================
export async function invalidateCategoryCache(category) {
  try {
    const client = await getRedisClient();
    const key = `${KEY_PREFIX.global}${category.toLowerCase()}`;
    await client.del(key);
  } catch (err) {
    console.warn('[RecoCache] invalidate() échoué:', err.message);
  }
}

// ============================================================
// CONSTRUCTION DES CLÉS DE CACHE
// ============================================================
export function buildCacheKey({ type, category, sessionId, userId, topK }) {
  switch (type) {
    case 'global':
      return `${KEY_PREFIX.global}${category?.toLowerCase()}:k${topK}`;
    case 'personalized':
      return `${KEY_PREFIX.personalized}${userId || sessionId}:k${topK}`;
    case 'popularity':
      return KEY_PREFIX.popularity;
    default:
      return `reco:${type}:${Date.now()}`;
  }
}

// ============================================================
// WRAPPER CACHE-ASIDE
// Usage : const data = await withCache(key, ttl, () => fetchFromDB())
// ============================================================
export async function withCache(key, ttlSeconds, fetchFn) {
  // 1. Tente le cache
  const cached = await getCachedRecommendations(key);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  // 2. Cache MISS → appel la fonction de récupération
  const fresh = await fetchFn();

  // 3. Stocke le résultat dans Redis
  await setCachedRecommendations(key, fresh, ttlSeconds);

  return { ...fresh, fromCache: false };
}

export { TTL, KEY_PREFIX };
