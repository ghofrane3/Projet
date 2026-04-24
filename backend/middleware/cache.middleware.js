// backend/middleware/cache.middleware.js
import cacheService from '../services/cache.service.js';
import { getPredictionService } from '../services/prediction.service.js'; // ✅ AJOUT

// ====================== UTILITAIRES RECHERCHE ======================
export const normalizeSearchParams = (query) => {
  const PARAM_ORDER = ['search', 'gender', 'category', 'minPrice', 'maxPrice', 'sizes', 'colors', 'sort', 'page', 'limit'];

  const out = {};
  for (const k of PARAM_ORDER) {
    const v = query[k];
    if (v === undefined || v === '') continue;

    if (k === 'search') {
      out[k] = String(v).trim().toLowerCase();
    } else if (Array.isArray(v)) {
      out[k] = [...v].sort().join(',');
    } else {
      out[k] = String(v).trim();
    }
  }
  return out;
};

export const getSearchTTL = (params) => {
  if (params.search) return 300;           // 5 min
  if (params.minPrice || params.maxPrice) return 600;   // 10 min
  if (params.gender || params.category) return 1800;    // 30 min
  return 3600;                                 // 1 h
};

export const buildSearchCacheKey = (type, params) => {
  const EXCLUDE = ['page', 'limit'];
  const sorted = Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined && params[k] !== '' && !EXCLUDE.includes(k))
    .map(k => `${k}:${params[k]}`)
    .join('|');

  return `${type}:${sorted || 'all'}`;
};

// ====================== CACHE MIDDLEWARE PRINCIPAL (CORRIGÉ) ======================
export const cacheMiddleware = (cacheType, keyGenerator = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    // ✅ AJOUT : Enregistrer la requête pour la prédiction
    const ps = getPredictionService();
    if (ps) ps.recordRequest().catch(() => {});

    try {
      let params = {};

      // Clé unique pour chaque produit
      if (cacheType === 'product-detail') {
        params = { id: req.params.id };
      }
      // Clé pour les routes de recherche
      else if (keyGenerator) {
        params = keyGenerator(req);
      }
      // Clé par défaut pour les autres routes
      else {
        const sortedQuery = Object.keys(req.query || {})
          .sort()
          .reduce((acc, k) => { acc[k] = req.query[k]; return acc; }, {});
        params = { query: JSON.stringify(sortedQuery) };
      }

      const cachedData = await cacheService.get(cacheType, params);

      if (cachedData) {
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Type', cacheType);
        return res.json({ ...cachedData, _cached: true, _cacheType: cacheType });
      }

      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Type', cacheType);

      const l3Start = Date.now();
      const originalJson = res.json.bind(res);

      res.json = function (data) {
        if (data?.success !== false) {
          const l3Time = Date.now() - l3Start;
          // Enregistrement avec temps L3
          cacheService.set(cacheType, params, data, l3Time).catch(err =>
            console.error('Erreur mise en cache:', err)
          );
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Erreur middleware cache:', error);
      next();
    }
  };
};

// ====================== MIDDLEWARES SPÉCIFIQUES ======================
export const searchCacheMiddleware = () => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    // ✅ AJOUT : Enregistrer la requête pour la prédiction
    const ps = getPredictionService();
    if (ps) ps.recordRequest().catch(() => {});

    try {
      const normParams = normalizeSearchParams(req.query);
      const ttl = getSearchTTL(normParams);
      const cacheKey = buildSearchCacheKey('products', normParams);

      const cachedData = await cacheService.getByKey(cacheKey, ttl);

      if (cachedData) {
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-TTL', String(ttl));
        return res.json({ ...cachedData, _cached: true });
      }

      res.set('X-Cache', 'MISS');
      res.set('X-Cache-TTL', String(ttl));

      const l3Start = Date.now();
      const originalJson = res.json.bind(res);

      res.json = function (data) {
        if (data?.success !== false) {
          const l3Time = Date.now() - l3Start;
          cacheService.setWithTTL(cacheKey, data, ttl, l3Time).catch(err =>
            console.error('Erreur mise en cache recherche:', err)
          );
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Erreur searchCacheMiddleware:', error);
      next();
    }
  };
};

const SUGGESTION_TTL = 120;

export const suggestionsCacheMiddleware = () => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    // ✅ AJOUT : Enregistrer la requête pour la prédiction
    const ps = getPredictionService();
    if (ps) ps.recordRequest().catch(() => {});

    try {
      const term = (req.query.q || '').trim().toLowerCase();
      if (term.length < 2) return next();

      const cacheKey = `search-suggestions:q:${term}`;
      const cached = await cacheService.getByKey(cacheKey, SUGGESTION_TTL);

      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json({ ...cached, _cached: true });
      }

      res.set('X-Cache', 'MISS');

      const l3Start = Date.now();
      const originalJson = res.json.bind(res);

      res.json = function (data) {
        if (data?.success !== false) {
          const l3Time = Date.now() - l3Start;
          cacheService.setWithTTL(cacheKey, data, SUGGESTION_TTL, l3Time).catch(err =>
            console.error('Erreur cache suggestions:', err)
          );
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Erreur suggestionsCacheMiddleware:', error);
      next();
    }
  };
};

// ====================== INVALIDATION ======================
export const invalidateCachePattern = async (...patterns) => {
  for (const pattern of patterns) {
    for (const [key] of cacheService.memoryCache || []) {
      if (key.includes(pattern)) {
        cacheService.memoryCache.delete(key);
        if (cacheService.memoryCacheStats) cacheService.memoryCacheStats.delete(key);
      }
    }
    try {
      const { getRedisClientSafe } = await import('../config/redis.js');
      const redis = getRedisClientSafe();
      if (redis?.isOpen) {
        const keys = await redis.keys(`*${pattern}*`);
        if (keys.length > 0) await redis.del(keys);
      }
    } catch (_) {}
  }
  if (cacheService.metrics) cacheService.metrics.invalidations = (cacheService.metrics.invalidations || 0) + 1;
  console.log(`🔄 Cache invalidé: [${patterns.join(', ')}]`);
};

export default {
  cacheMiddleware,
  searchCacheMiddleware,
  suggestionsCacheMiddleware,
  invalidateCachePattern,
  normalizeSearchParams,
  getSearchTTL,
  buildSearchCacheKey,
};
