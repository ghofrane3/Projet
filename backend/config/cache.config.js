/**
 * Configuration du Cache Multiniveau
 */

export const CACHE_CONFIG = {
  monitoring: {
    enabled: true,
    logMisses: true
  },

  limits: {
    maxMemoryKeys: 1000,        // Limite L1 (mémoire)
    maxRedisKeys: 10000
  },

  strategies: {
    products: {
      ttl: 300,                 // 5 minutes
      warmup: true,
      compress: false
    },
    categories: {
      ttl: 3600,                // 1 heure
      warmup: true,
      compress: false
    },
    // Ajoute d'autres types selon tes besoins
    default: {
      ttl: 300,
      warmup: false
    }
  },

  invalidation: {
    // Exemple : invalider le cache produits quand un produit est modifié
    'product-updated': ['products'],
    'product-created': ['products'],
    'category-updated': ['categories']
  }
};

export function generateCacheKey(type, params = {}) {
  if (!params || Object.keys(params).length === 0) {
    return `${type}`;
  }
  const paramStr = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join(':');
  return `${type}:${paramStr}`;
}

export function calculateDynamicTTL(config, accessCount = 0) {
  const baseTTL = config.ttl || 300;
  // TTL plus long si la clé est souvent accédée
  if (accessCount > 50) return Math.min(baseTTL * 3, 3600);
  if (accessCount > 20) return Math.min(baseTTL * 2, 1800);
  return baseTTL;
}
