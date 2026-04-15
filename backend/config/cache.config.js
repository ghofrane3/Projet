// ════════════════════════════════════════════════════════════════════════════
// config/cache.config.js  –  VERSION FINALE COMPLÈTE
// Importé par cache.service.js  (generateCacheKey, calculateDynamicTTL)
// Nouveau : LRU / LFU / FIFO + AdaptiveTTL + patchCacheService()
// ════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────────────
// 1. STRATÉGIES D'ÉVICTION
// ────────────────────────────────────────────────────────────────────────────

export class LRUStrategy {
  constructor(maxSize = 500) {
    this.name    = 'LRU';
    this.maxSize = maxSize;
    this._meta   = new Map(); // key → { lastAccess, hits }
  }

  touch(key) {
    const e = this._meta.get(key) ?? { hits: 0, lastAccess: 0 };
    e.hits++;
    e.lastAccess = Date.now();
    this._meta.set(key, e);
  }

  evict() {
    if (this._meta.size <= this.maxSize) return null;
    let oldest = null, oldestTime = Infinity;
    for (const [k, v] of this._meta) {
      if (v.lastAccess < oldestTime) { oldestTime = v.lastAccess; oldest = k; }
    }
    if (oldest) this._meta.delete(oldest);
    return oldest;
  }

  remove(key) { this._meta.delete(key); }
  getMeta(key) { return this._meta.get(key) ?? null; }
  getScore(key) { return this._meta.get(key)?.lastAccess ?? 0; }
  size() { return this._meta.size; }
}

export class LFUStrategy {
  constructor(maxSize = 500) {
    this.name    = 'LFU';
    this.maxSize = maxSize;
    this._meta   = new Map(); // key → { freq, lastAccess }
  }

  touch(key) {
    const e = this._meta.get(key) ?? { freq: 0, lastAccess: 0 };
    e.freq++;
    e.lastAccess = Date.now();
    this._meta.set(key, e);
  }

  evict() {
    if (this._meta.size <= this.maxSize) return null;
    let leastUsed = null, minFreq = Infinity;
    for (const [k, v] of this._meta) {
      if (
        v.freq < minFreq ||
        (v.freq === minFreq &&
          v.lastAccess < (this._meta.get(leastUsed)?.lastAccess ?? Infinity))
      ) {
        minFreq = v.freq;
        leastUsed = k;
      }
    }
    if (leastUsed) this._meta.delete(leastUsed);
    return leastUsed;
  }

  remove(key) { this._meta.delete(key); }
  getMeta(key) { return this._meta.get(key) ?? null; }
  getScore(key) { return this._meta.get(key)?.freq ?? 0; }
  size() { return this._meta.size; }
}

export class FIFOStrategy {
  constructor(maxSize = 500) {
    this.name    = 'FIFO';
    this.maxSize = maxSize;
    this._queue  = [];
    this._set    = new Set();
    this._meta   = new Map(); // key → { insertedAt, hits }
  }

  touch(key) {
    if (!this._set.has(key)) {
      this._queue.push(key);
      this._set.add(key);
      this._meta.set(key, { insertedAt: Date.now(), hits: 0 });
    } else {
      this._meta.get(key).hits++;
    }
  }

  evict() {
    if (this._queue.length <= this.maxSize) return null;
    const oldest = this._queue.shift();
    this._set.delete(oldest);
    this._meta.delete(oldest);
    return oldest;
  }

  remove(key) {
    this._set.delete(key);
    this._meta.delete(key);
    this._queue = this._queue.filter(k => k !== key);
  }

  getMeta(key) { return this._meta.get(key) ?? null; }
  getScore(key) { return this._meta.get(key)?.insertedAt ?? 0; }
  size() { return this._meta.size; }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. TTL ADAPTATIF
// ────────────────────────────────────────────────────────────────────────────

export class AdaptiveTTL {
  constructor(cfg = {}) {
    this.baseTTL      = cfg.baseTTL      ?? 300;
    this.minTTL       = cfg.minTTL       ?? 30;
    this.maxTTL       = cfg.maxTTL       ?? 86400;
    this.hotThreshold = cfg.hotThreshold ?? 10;
    this.coldAfterMs  = cfg.coldAfterMs  ?? 600_000;
    this.rules        = cfg.rules ?? [
      { pattern: /^products:list/,   ttl: 600   },
      { pattern: /^products:detail/, ttl: 1800  },
      { pattern: /^search-suggest/,  ttl: 120   },
      { pattern: /^products:all/,    ttl: 3600  },
      { pattern: /^admin:/,          ttl: 60    },
      { pattern: /^cart:/,           ttl: 120   },
    ];
  }

  /**
   * Calcule le TTL (secondes) pour une clé.
   * Priorité : règle statique → clé chaude → clé froide → base
   */
  compute(key, meta = {}) {
    // 1. Règle statique — priorité absolue
    for (const rule of this.rules) {
      const match = rule.pattern instanceof RegExp
        ? rule.pattern.test(key)
        : key.startsWith(rule.pattern);
      if (match) return rule.ttl;
    }

    const hits       = meta.hits ?? meta.freq ?? 0;
    const lastAccess = meta.lastAccess ?? meta.insertedAt ?? Date.now();
    const ageMs      = Date.now() - lastAccess;

    // 2. Clé chaude → TTL boosté ×1 à ×4
    if (hits >= this.hotThreshold) {
      const boost = Math.min(hits / this.hotThreshold, 4);
      return Math.min(Math.round(this.baseTTL * boost), this.maxTTL);
    }

    // 3. Clé froide → TTL réduit ×0.25 à ×1
    if (ageMs > this.coldAfterMs) {
      const factor = Math.max(0.25, 1 - ageMs / (this.coldAfterMs * 4));
      return Math.max(Math.round(this.baseTTL * factor), this.minTTL);
    }

    // 4. Défaut
    return this.baseTTL;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. PATCH DU SINGLETON CacheService
//    À appeler UNE FOIS dans server.js après import cacheService
// ────────────────────────────────────────────────────────────────────────────

export function patchCacheService(instance, opts = {}) {
  // ── Choisir la stratégie ──────────────────────────────────────────────────
  const name = (opts.strategy ?? 'LRU').toUpperCase();
  instance.strategy = name === 'LFU'
    ? new LFUStrategy(opts.maxSize ?? 500)
    : name === 'FIFO'
      ? new FIFOStrategy(opts.maxSize ?? 500)
      : new LRUStrategy(opts.maxSize ?? 500);

  instance.adaptiveTTL = new AdaptiveTTL(opts.ttl ?? {});

  // ── Surcharge getFromMemory : enregistre l'accès ──────────────────────────
  const _origGet = instance.getFromMemory.bind(instance);
  instance.getFromMemory = function (key) {
    const result = _origGet(key);
    if (result !== null) this.strategy.touch(key);
    return result;
  };

  // ── Surcharge _setToLevels : TTL adaptatif + éviction ─────────────────────
  const _origSet = instance._setToLevels.bind(instance);
  instance._setToLevels = async function (key, data, ttl, l3Ms = 0) {
    this.strategy.touch(key);

    const evicted = this.strategy.evict();
    if (evicted && this.memoryCache.has(evicted)) {
      this.memoryCache.delete(evicted);
      this.memoryCacheStats.delete(evicted);
    }

    // Recalcule le TTL si c'est le TTL par défaut (300s)
    const meta        = this.strategy.getMeta(key);
    const smartTTL    = this.adaptiveTTL.compute(key, meta ?? {});
    const effectiveTTL = (ttl === 300 && smartTTL !== 300) ? smartTTL : ttl;

    return _origSet(key, data, effectiveTTL, l3Ms);
  };

  // ── Surcharge invalidateByTag : synchronise la stratégie ─────────────────
  const _origInv = instance.invalidateByTag.bind(instance);
  instance.invalidateByTag = async function (tag) {
    for (const [key] of this.memoryCache) {
      if (key.includes(tag)) this.strategy.remove(key);
    }
    return _origInv(tag);
  };

  // ── Nouvelle méthode : inspectKey ─────────────────────────────────────────
  instance.inspectKey = async function (key) {
    let raw = null, redisTTL = -2;
    try {
      const { getRedisClientSafe } = await import('./redis.js');
      const redis = getRedisClientSafe();
      if (redis) {
        [raw, redisTTL] = await Promise.all([
          redis.get(key).catch(() => null),
          redis.ttl(key).catch(() => -2),
        ]);
      }
    } catch (_) {}

    const stratMeta   = this.strategy.getMeta(key);
    const computedTTL = stratMeta ? this.adaptiveTTL.compute(key, stratMeta) : null;

    return {
      key,
      inL1:         this.memoryCache.has(key),
      inL2:         raw !== null,
      redisTTL,
      computedTTL,
      strategyMeta: stratMeta,
      value: raw
        ? (() => { try { return JSON.parse(raw); } catch { return raw; } })()
        : null,
    };
  };

  // ── Nouvelles méthodes config ─────────────────────────────────────────────
  instance.updateAdaptiveTTLConfig = function (cfg) {
    const t = this.adaptiveTTL;
    if (cfg.baseTTL      !== undefined) t.baseTTL      = Number(cfg.baseTTL);
    if (cfg.minTTL       !== undefined) t.minTTL       = Number(cfg.minTTL);
    if (cfg.maxTTL       !== undefined) t.maxTTL       = Number(cfg.maxTTL);
    if (cfg.hotThreshold !== undefined) t.hotThreshold = Number(cfg.hotThreshold);
    if (cfg.coldAfterMs  !== undefined) t.coldAfterMs  = Number(cfg.coldAfterMs);
    return this.getAdaptiveTTLConfig();
  };

  instance.getAdaptiveTTLConfig = function () {
    const t = this.adaptiveTTL;
    return {
      baseTTL:      t.baseTTL,
      minTTL:       t.minTTL,
      maxTTL:       t.maxTTL,
      hotThreshold: t.hotThreshold,
      coldAfterMs:  t.coldAfterMs,
      strategyName: this.strategy.name,
      rules: t.rules.map(r => ({
        pattern: r.pattern instanceof RegExp ? r.pattern.toString() : r.pattern,
        ttl:     r.ttl,
      })),
    };
  };

  // ── Surcharge getMetrics : ajoute infos stratégie ─────────────────────────
  const _origMetrics = instance.getMetrics.bind(instance);
  instance.getMetrics = function () {
    return {
      ..._origMetrics(),
      strategy:     this.strategy.name,
      strategySize: this.strategy.size(),
      adaptiveTTL:  this.getAdaptiveTTLConfig(),
    };
  };

  console.log(`✅ [SmartCache] Patché : stratégie=${instance.strategy.name} | TTL adaptatif activé`);
  return instance;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. CONFIGURATION EXISTANTE (inchangée — conservée intégralement)
// ────────────────────────────────────────────────────────────────────────────

export const CACHE_CONFIG = {
  strategies: {
    'product-list':     { ttl: 600,   maxItems: 100, warmup: ['homme', 'femme', 'enfant'] },
    'product-detail':   { ttl: 1800,  maxItems: 500 },
    'product-search':   { ttl: 300,   maxItems: 200 },
    'product-featured': { ttl: 3600,  maxItems: 50  },
    'categories':       { ttl: 7200,  maxItems: 20  },
    'category-detail':  { ttl: 3600,  maxItems: 50  },
    'user-profile':     { ttl: 600,   maxItems: 1000 },
    'user-orders':      { ttl: 300,   maxItems: 1000 },
    'cart':             { ttl: 120,   maxItems: 1000 },
    'admin-stats':      { ttl: 60,    maxItems: 10  },
    'admin-users':      { ttl: 120,   maxItems: 10  },
    'search-popular':   { ttl: 3600,  maxItems: 20  },
    default:            { ttl: 300,   maxItems: 100 },
  },

  invalidation: {
    'product-update':  ['product-list', 'product-detail', 'product-search', 'product-featured'],
    'product-create':  ['product-list', 'product-search', 'product-featured'],
    'product-delete':  ['product-list', 'product-detail', 'product-search', 'product-featured'],
    'order-create':    ['user-orders', 'admin-stats'],
    'order-update':    ['user-orders', 'admin-stats'],
    'user_registered': ['admin:users'],
    'user_updated':    ['user:', 'admin:users'],
    'user_deleted':    ['user:', 'admin:users'],
    'category-update': ['categories', 'category-detail', 'product-list'],
  },

  limits: {
    maxMemoryKeys:  500,
    maxMemoryMB:    100,
    maxKeyLength:   200,
    maxValueSizeKB: 512,
  },

  monitoring: {
    enabled:   process.env.NODE_ENV !== 'production',
    logMisses: false,
    logHits:   false,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 5. FONCTIONS UTILITAIRES (déjà utilisées par cache.service.js)
// ────────────────────────────────────────────────────────────────────────────

export const generateCacheKey = (type, params = {}) => {
  const sorted = Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined && params[k] !== '')
    .map(k => `${k}:${params[k]}`)
    .join('|');
  return `${type}:${sorted || 'all'}`;
};

export const calculateDynamicTTL = (config, accessCount = 0) => {
  const base = config.ttl || 300;
  if (accessCount >= 100) return Math.min(base * 3, 86400);
  if (accessCount >= 50)  return Math.min(base * 2, 86400);
  if (accessCount >= 10)  return Math.min(base * 1.5, 86400);
  return base;
};
