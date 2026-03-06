// ════════════════════════════════════════════════════════════
// CONFIGURATION CACHE MULTINIVEAU INTELLIGENT
// ════════════════════════════════════════════════════════════

export const CACHE_CONFIG = {
  levels: {
    L1: 'memory',
    L2: 'redis',
    L3: 'database'
  },

  strategies: {
    products: {
      ttl: 3600,
      staleWhileRevalidate: 7200,
      tags: ['products'],
      prefetch: true,
      compress: true
    },

    productDetail: {
      ttl: 1800,
      staleWhileRevalidate: 3600,
      tags: ['products', 'product-detail'],
      warmup: ['featured', 'trending']
    },

    categories: {
      ttl: 86400,
      tags: ['categories'],
      invalidateOn: ['product-update']
    },

    search: {
      ttl: 600,
      maxEntries: 1000,
      trackPopular: true,
      tags: ['search']
    },

    cart: {
      ttl: 300,
      personal: true,
      tags: ['cart']
    },

    user: {
      ttl: 1800,
      personal: true,
      tags: ['user']
    },

    stats: {
      ttl: 300,
      tags: ['stats', 'admin']
    },

    orders: {
      ttl: 0,
      bypass: true
    }
  },

  priorities: {
    productDetail: 1,
    products: 2,
    categories: 2,
    search: 3,
    user: 3,
    cart: 4,
    stats: 5
  },

  limits: {
    maxMemoryMB: 100,
    maxRedisKeys: 10000,
    evictionPolicy: 'lru'
  },

  invalidation: {
    'product-update': ['products', 'product-detail', 'categories', 'search'],
    'order-created': ['stats', 'user'],
    'user-login': ['user', 'cart']
  },

  monitoring: {
    enabled: true,
    logHits: false,
    logMisses: true,
    metrics: true
  }
};

export const generateCacheKey = (type, params = {}) => {
  const parts = [type];

  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join('|');

  if (sortedParams) {
    parts.push(sortedParams);
  }

  return parts.join(':');
};

export const calculateDynamicTTL = (baseConfig, accessCount = 0) => {
  const { ttl } = baseConfig;

  if (accessCount > 1000) return ttl * 2;
  if (accessCount > 100) return ttl * 1.5;
  if (accessCount > 10) return ttl;

  return ttl * 0.5;
};

export default CACHE_CONFIG;
