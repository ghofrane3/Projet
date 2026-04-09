import cacheService from '../services/cache.service.js';

// ════════════════════════════════════════════════════════════
// UTILITAIRES RECHERCHE
// ════════════════════════════════════════════════════════════

/**
 * Normalise les paramètres de requête pour garantir
 * qu'une même recherche produit toujours la même clé de cache.
 * Ex: ?search=Robe&page=1 == ?page=1&search=robe → même clé
 */
export const normalizeSearchParams = (query) => {
  const PARAM_ORDER = [
    'search', 'gender', 'category',
    'minPrice', 'maxPrice', 'sizes',
    'colors', 'sort', 'page', 'limit', 'path'
  ];

  const out = {};
  for (const k of PARAM_ORDER) {
    if (query[k] !== undefined && query[k] !== '') {
      // Mettre en minuscule uniquement le terme de recherche
      out[k] = (k === 'search')
        ? query[k].trim().toLowerCase()
        : query[k];
    }
  }
  return out;
};

/**
 * Calcule le TTL dynamique selon le type de requête.
 * La recherche textuelle expire plus vite (données + volatiles).
 */
export const getSearchTTL = (params) => {
  if (params.search)                        return 300;   // 5 min  — recherche texte
  if (params.minPrice || params.maxPrice)   return 600;   // 10 min — filtre prix
  if (params.gender   || params.category)   return 1800;  // 30 min — filtre catégorie
  return 3600;                                            // 1h     — liste générale
};

/**
 * Génère une clé de cache brute pour la recherche.
 * Format: search:<type>:<params_triés>
 */
export const buildSearchCacheKey = (type, params) => {
  // Exclure page et limit de la clé → même résultat peu importe la pagination
  // pour les recherches (on cache la requête, pas la page)
  const EXCLUDE_FROM_KEY = ['page', 'limit'];

  const sorted = Object.keys(params)
    .sort()
    .filter(k =>
      params[k] !== undefined &&
      params[k] !== ''        &&
      !EXCLUDE_FROM_KEY.includes(k)
    )
    .map(k => `${k}:${params[k]}`)
    .join('|');

  return `${type}:${sorted}`;
};
// ════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE STANDARD (routes catégories, featured, etc.)
// ════════════════════════════════════════════════════════════

/**
 * Middleware cache standard — utilise CACHE_CONFIG via cacheService.get/set
 * Convient pour: featured, trending, categories, product-detail
 *
 * @param {string} cacheType - Type défini dans CACHE_CONFIG.strategies
 * @param {function|null} keyGenerator - Fonction optionnelle pour les params
 */
export const cacheMiddleware = (cacheType, keyGenerator = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      const params = keyGenerator
        ? keyGenerator(req)
        : { path: req.path, query: JSON.stringify(req.query) };

      const cachedData = await cacheService.get(cacheType, params);

      if (cachedData) {
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Type', cacheType);
        return res.json({ ...cachedData, _cached: true, _cacheType: cacheType });
      }

      res.set('X-Cache', 'MISS');
      const l3Start      = Date.now();
      const originalJson = res.json.bind(res);

      res.json = function(data) {
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

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE RECHERCHE (TTL dynamique + normalisation)
// ════════════════════════════════════════════════════════════

/**
 * Middleware cache spécialisé pour la route GET /api/products
 * Gère: recherche textuelle, filtres prix, filtres catégorie/genre
 *
 * Différences avec cacheMiddleware standard:
 * - Normalise les paramètres (évite les doublons de clé)
 * - TTL dynamique selon le type de requête
 * - Clé construite manuellement (bypass CACHE_CONFIG si type inconnu)
 */
export const searchCacheMiddleware = () => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      // 1. Normaliser les paramètres
      const rawParams  = { ...req.query, path: req.path };
      const normParams = normalizeSearchParams(rawParams);

      // 2. TTL dynamique
      const ttl = getSearchTTL(normParams);

      // 3. Clé de cache brute
      const cacheKey = buildSearchCacheKey('products', normParams);

      // 4. Chercher dans le cache (L1 → L2)
      const cachedData = await cacheService.getByKey(cacheKey);

     if (cachedData) {
  console.log(`✅ [SEARCH CACHE HIT]  clé: ${cacheKey} | TTL: ${ttl}s`);
  res.set('X-Cache', 'HIT');
  res.set('X-Cache-TTL', String(ttl));
  return res.json({ ...cachedData, _cached: true });
}


      // 5. MISS → aller en MongoDB
      res.set('X-Cache',     'MISS');
      res.set('X-Cache-TTL', String(ttl));
      const l3Start      = Date.now();
      const originalJson = res.json.bind(res);

      res.json = function(data) {
        if (data?.success !== false) {
          const l3Time = Date.now() - l3Start;
          cacheService.setWithTTL(cacheKey, data, ttl, l3Time).catch(err =>
            console.error('Erreur mise en cache recherche:', err)
          );
        }
        return originalJson(data);
      };
// Et après le MISS :
console.log(`❌ [SEARCH CACHE MISS] clé: ${cacheKey} | TTL: ${ttl}s → MongoDB`);
      next();

    } catch (error) {
      console.error('Erreur searchCacheMiddleware:', error);
      next();
    }
  };
};

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE SUGGESTIONS (TTL très court)
// ════════════════════════════════════════════════════════════

/**
 * Middleware cache pour l'autocomplete.
 * TTL fixé à 120s (2 min) — résultats très dynamiques.
 */
export const suggestionsCacheMiddleware = () => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      const term = (req.query.q || '').trim().toLowerCase();

      if (term.length < 2) return next();

      const cacheKey = `search-suggestions:q:${term}`;
      const cached   = await cacheService.getByKey(cacheKey);

     if (cached) {
  console.log(`✅ [SUGGEST CACHE HIT]  clé: ${cacheKey}`);
  res.set('X-Cache', 'HIT');
  return res.json({ ...cached, _cached: true });
}
console.log(`❌ [SUGGEST CACHE MISS] clé: ${cacheKey} → MongoDB`);

      res.set('X-Cache', 'MISS');
      const l3Start      = Date.now();
      const originalJson = res.json.bind(res);

      res.json = function(data) {
        if (data?.success !== false) {
          const l3Time = Date.now() - l3Start;
          cacheService.setWithTTL(cacheKey, data, 120, l3Time).catch(err =>
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

// ════════════════════════════════════════════════════════════
// MIDDLEWARE D'INVALIDATION AUTOMATIQUE
// ════════════════════════════════════════════════════════════

/**
 * Invalide le cache après une mutation réussie (POST/PUT/DELETE/PATCH)
 * @param {string} eventType - Événement défini dans CACHE_CONFIG.invalidation
 */
export const invalidateCacheMiddleware = (eventType) => {
  return async (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method))
      return next();

    const originalJson = res.json.bind(res);

    res.json = function(data) {
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

// ════════════════════════════════════════════════════════════
// UTILITAIRES SUPPLÉMENTAIRES
// ════════════════════════════════════════════════════════════

/** Force le bypass du cache (pour données critiques) */
export const bypassCache = (req, res, next) => {
  req.bypassCache = true;
  next();
};

/** Invalide manuellement un pattern de clés */
export const invalidateCachePattern = async (...patterns) => {
  for (const pattern of patterns) {
    for (const [key] of cacheService.memoryCache) {
      if (key.includes(pattern)) {
        cacheService.memoryCache.delete(key);
        cacheService.memoryCacheStats.delete(key);
      }
    }
    try {
      const redisClient = (await import('../config/redis.js')).getRedisClient();
      if (redisClient) {
        const keys = await redisClient.keys(`*${pattern}*`);
        if (keys.length > 0) await redisClient.del(keys);
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
