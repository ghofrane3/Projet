import cacheService from '../services/cache.service.js';


// ════════════════════════════════════════════════════════════════════════════
// UTILITAIRES RECHERCHE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Normalise les paramètres de requête pour garantir
 * qu'une même recherche produit toujours la même clé de cache.
 *
 * FIXES :
 *  - 'path' absent de PARAM_ORDER → clé stable quelle que soit l'URL appelante
 *  - Valeurs tableau triées → sizes=[S,M] == sizes=[M,S]
 */
export const normalizeSearchParams = (query) => {
  const PARAM_ORDER = [
    'search', 'gender', 'category',
    'minPrice', 'maxPrice', 'sizes',
    'colors', 'sort', 'page', 'limit',
    // 'path' intentionnellement absent
  ];

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

/**
 * TTL dynamique selon le type de requête.
 */
export const getSearchTTL = (params) => {
  if (params.search)                       return 300;   // 5 min
  if (params.minPrice || params.maxPrice)  return 600;   // 10 min
  if (params.gender   || params.category)  return 1800;  // 30 min
  return 3600;                                           // 1 h
};

/**
 * Clé reproductible pour les routes de recherche.
 * Format : products:<k1>:<v1>|<k2>:<v2>
 * page et limit exclus → même clé quelle que soit la page.
 */
export const buildSearchCacheKey = (type, params) => {
  const EXCLUDE = ['page', 'limit'];

  const sorted = Object.keys(params)
    .sort()
    .filter(k =>
      params[k] !== undefined &&
      params[k] !== ''        &&
      !EXCLUDE.includes(k)
    )
    .map(k => `${k}:${params[k]}`)
    .join('|');

  return `${type}:${sorted || 'all'}`;
};

// ════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE STANDARD
// (product-detail, featured, categories …)
// ════════════════════════════════════════════════════════════════════════════

/**
 * FIXES :
 *  1. keyGenerator par défaut ne passe plus 'path' dans les params
 *     → product-detail:id:xxx au lieu de product-detail:id:xxx|path:/xxx
 *  2. query params triés avant stringify → clé stable quel que soit leur ordre
 *
 * @param {string}        cacheType    - Type dans CACHE_CONFIG.strategies
 * @param {function|null} keyGenerator - (req) => params  [optionnel]
 */
export const cacheMiddleware = (cacheType, keyGenerator = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      let params;

      if (keyGenerator) {
        params = keyGenerator(req);
      } else {
        // Tri explicite → ordre des params sans importance
        // 'path' absent → même clé quelle que soit l'URL appelante
        const sortedQuery = Object.keys(req.query)
          .sort()
          .reduce((acc, k) => { acc[k] = req.query[k]; return acc; }, {});

        params = { query: JSON.stringify(sortedQuery) };
      }

      const cachedData = await cacheService.get(cacheType, params);

      if (cachedData) {
        res.set('X-Cache',      'HIT');
        res.set('X-Cache-Type', cacheType);
        return res.json({ ...cachedData, _cached: true, _cacheType: cacheType });
      }

      res.set('X-Cache',      'MISS');
      res.set('X-Cache-Type', cacheType);

      const l3Start      = Date.now();
      const originalJson = res.json.bind(res);

      res.json = function (data) {
        if (data?.success !== false) {
          const l3Time = Date.now() - l3Start;
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

// ════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE RECHERCHE  (GET /api/products)
// ════════════════════════════════════════════════════════════════════════════

/**
 * FIXES :
 *  1. path exclu des params → clé stable
 *  2. TTL réel transmis à getByKey → L1 expire avec le bon délai
 *     (avant : 300s hardcodé même pour les listes générales à 3600s)
 */
export const searchCacheMiddleware = () => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      const normParams = normalizeSearchParams(req.query);
      const ttl        = getSearchTTL(normParams);
      const cacheKey   = buildSearchCacheKey('products', normParams);

      // TTL passé explicitement → L1 utilise le bon délai d'expiration
      const cachedData = await cacheService.getByKey(cacheKey, ttl);

      if (cachedData) {
        console.log(`✅ [SEARCH CACHE HIT]  clé: ${cacheKey} | TTL: ${ttl}s`);
        res.set('X-Cache',     'HIT');
        res.set('X-Cache-TTL', String(ttl));
        return res.json({ ...cachedData, _cached: true });
      }

      console.log(`❌ [SEARCH CACHE MISS] clé: ${cacheKey} | TTL: ${ttl}s → MongoDB`);
      res.set('X-Cache',     'MISS');
      res.set('X-Cache-TTL', String(ttl));

      const l3Start      = Date.now();
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

// ════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE SUGGESTIONS
// ════════════════════════════════════════════════════════════════════════════

const SUGGESTION_TTL = 120; // 2 min

export const suggestionsCacheMiddleware = () => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      const term = (req.query.q || '').trim().toLowerCase();
      if (term.length < 2) return next();

      const cacheKey = `search-suggestions:q:${term}`;
      const cached   = await cacheService.getByKey(cacheKey, SUGGESTION_TTL);

      if (cached) {
        console.log(`✅ [SUGGEST CACHE HIT]  clé: ${cacheKey}`);
        res.set('X-Cache', 'HIT');
        return res.json({ ...cached, _cached: true });
      }

      console.log(`❌ [SUGGEST CACHE MISS] clé: ${cacheKey} → MongoDB`);
      res.set('X-Cache', 'MISS');

      const l3Start      = Date.now();
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

// ════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE INVALIDATION
// ════════════════════════════════════════════════════════════════════════════

export const invalidateCacheMiddleware = (eventType) => {
  return async (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method))
      return next();

    const originalJson = res.json.bind(res);

    res.json = function (data) {
      if (data?.success || res.statusCode < 400) {
        cacheService.invalidate(eventType).catch(err =>
          console.error('Erreur invalidation cache:', err)
        );
      }
      return originalJson(data);
    };

    next();
  };
};

// ════════════════════════════════════════════════════════════════════════════
// UTILITAIRES
// ════════════════════════════════════════════════════════════════════════════

export const bypassCache = (req, res, next) => {
  req.bypassCache = true;
  next();
};

export const invalidateCachePattern = async (...patterns) => {
  for (const pattern of patterns) {
    for (const [key] of cacheService.memoryCache) {
      if (key.includes(pattern)) {
        cacheService.memoryCache.delete(key);
        cacheService.memoryCacheStats.delete(key);
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
  cacheService.metrics.invalidations++;
  console.log(`🔄 Cache invalidé: [${patterns.join(', ')}]`);
};

export default {
  cacheMiddleware,
  searchCacheMiddleware,
  suggestionsCacheMiddleware,
  invalidateCacheMiddleware,
  invalidateCachePattern,
  normalizeSearchParams,
  getSearchTTL,
  buildSearchCacheKey,
  bypassCache,
};
