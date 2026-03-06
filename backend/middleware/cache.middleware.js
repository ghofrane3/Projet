import cacheService from '../services/cache.service.js';
import { CACHE_CONFIG } from '../config/cache-config.js';

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE AUTOMATIQUE
// ════════════════════════════════════════════════════════════

/**
 * Middleware qui met automatiquement en cache les réponses GET
 * et invalide intelligemment selon les mutations (POST/PUT/DELETE)
 *
 * @param {string} cacheType - Type de cache (ex: 'products', 'categories')
 * @param {function} keyGenerator - Fonction pour générer les paramètres de clé
 */
export const cacheMiddleware = (cacheType, keyGenerator = null) => {
  return async (req, res, next) => {
    // Seulement pour les requêtes GET
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Générer les paramètres de clé
      const params = keyGenerator ? keyGenerator(req) : {
        path: req.path,
        query: JSON.stringify(req.query)
      };

      // Chercher en cache
      const cachedData = await cacheService.get(cacheType, params);

      if (cachedData) {
        // ✅ Cache hit - Retourner immédiatement
        return res.json({
          ...cachedData,
          _cached: true,
          _cacheType: cacheType
        });
      }

      // ❌ Cache miss - Intercepter la réponse pour la mettre en cache
      const originalJson = res.json.bind(res);

      res.json = function(data) {
        // Sauvegarder en cache (asynchrone, ne pas attendre)
        cacheService.set(cacheType, params, data).catch(err => {
          console.error('Erreur mise en cache:', err);
        });

        // Retourner la réponse
        return originalJson(data);
      };

      next();

    } catch (error) {
      console.error('Erreur middleware cache:', error);
      next();
    }
  };
};

/**
 * Middleware d'invalidation automatique pour les mutations
 *
 * @param {string} eventType - Type d'événement (ex: 'product-update')
 */
export const invalidateCache = (eventType) => {
  return async (req, res, next) => {
    // Seulement pour les mutations (POST, PUT, DELETE, PATCH)
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Intercepter la réponse
    const originalJson = res.json.bind(res);

    res.json = function(data) {
      // Si la réponse est un succès, invalider le cache
      if (data.success || res.statusCode < 400) {
        cacheService.invalidate(eventType).catch(err => {
          console.error('Erreur invalidation cache:', err);
        });
      }

      return originalJson(data);
    };

    next();
  };
};

/**
 * Middleware pour bypasser le cache (forcer fraîcheur des données)
 * Utile pour les données critiques comme les commandes
 */
export const bypassCache = (req, res, next) => {
  req.bypassCache = true;
  next();
};

/**
 * Middleware pour forcer le rechargement du cache
 * Usage: ?refresh=true dans l'URL
 */
export const refreshCache = (cacheType) => {
  return async (req, res, next) => {
    if (req.query.refresh === 'true') {
      const params = {
        path: req.path,
        query: JSON.stringify(req.query)
      };

      // Invalider cette clé spécifique
      await cacheService.invalidate(cacheType);

      console.log(`🔄 Cache rafraîchi: ${cacheType}`);
    }

    next();
  };
};

export default {
  cacheMiddleware,
  invalidateCache,
  bypassCache,
  refreshCache
};
