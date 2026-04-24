// ════════════════════════════════════════════════════════════════════════════
// config/cache.config.js  –  VERSION FINALE AMÉLIORÉE v3
// ════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────────────
// 1. STRATÉGIES D'ÉVICTION
// ────────────────────────────────────────────────────────────────────────────

export class LRUStrategy {
  constructor(maxSize = 500) {
    this.name    = 'LRU';
    this.maxSize = maxSize;
    this._meta   = new Map();
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
    this._meta   = new Map();
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
        (v.freq === minFreq && v.lastAccess < (this._meta.get(leastUsed)?.lastAccess ?? Infinity))
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
    this._meta   = new Map();
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

  compute(key, meta = {}) {
    for (const rule of this.rules) {
      const match = rule.pattern instanceof RegExp
        ? rule.pattern.test(key)
        : key.startsWith(rule.pattern);
      if (match) return rule.ttl;
    }

    const hits       = meta.hits ?? meta.freq ?? 0;
    const lastAccess = meta.lastAccess ?? meta.insertedAt ?? Date.now();
    const ageMs      = Date.now() - lastAccess;

    if (hits >= this.hotThreshold) {
      const boost = Math.min(hits / this.hotThreshold, 4);
      return Math.min(Math.round(this.baseTTL * boost), this.maxTTL);
    }

    if (ageMs > this.coldAfterMs) {
      const factor = Math.max(0.25, 1 - ageMs / (this.coldAfterMs * 4));
      return Math.max(Math.round(this.baseTTL * factor), this.minTTL);
    }

    return this.baseTTL;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. PATCH DU SINGLETON CacheService
// ────────────────────────────────────────────────────────────────────────────

export function patchCacheService(instance, opts = {}) {
  const name = (opts.strategy ?? 'LRU').toUpperCase();
  instance.strategy = name === 'LFU'
    ? new LFUStrategy(opts.maxSize ?? 500)
    : name === 'FIFO'
      ? new FIFOStrategy(opts.maxSize ?? 500)
      : new LRUStrategy(opts.maxSize ?? 500);

  instance.adaptiveTTL = new AdaptiveTTL(opts.ttl ?? {});

  const _origGet = instance.getFromMemory.bind(instance);
  instance.getFromMemory = function (key) {
    const result = _origGet(key);
    if (result !== null) this.strategy.touch(key);
    return result;
  };

  const _origSet = instance._setToLevels.bind(instance);
  instance._setToLevels = async function (key, data, ttl, l3Ms = 0) {
    this.strategy.touch(key);

    const evicted = this.strategy.evict();
    if (evicted && this.memoryCache.has(evicted)) {
      this.memoryCache.delete(evicted);
      this.memoryCacheStats.delete(evicted);
      if (this.metrics && typeof this.metrics.evictions === 'number') {
        this.metrics.evictions++;
      }
    }

    const meta         = this.strategy.getMeta(key);
    const smartTTL     = this.adaptiveTTL.compute(key, meta ?? {});
    const effectiveTTL = (ttl === 300 && smartTTL !== 300) ? smartTTL : ttl;

    return _origSet(key, data, effectiveTTL, l3Ms);
  };

  const _origInv = instance.invalidateByTag.bind(instance);
  instance.invalidateByTag = async function (tag) {
    for (const [key] of this.memoryCache) {
      if (key.includes(tag)) this.strategy.remove(key);
    }
    return _origInv(tag);
  };

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
      value: raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null,
    };
  };

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
// 4. CONFIGURATION PRINCIPALE
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
    'order_created':   ['user-orders', 'admin-stats'],
    'order_updated':   ['user-orders', 'admin-stats'],
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

  // ── NOUVEAU : Compression automatique ──────────────────────────────────
  compression: {
    enabled:        true,
    thresholdBytes: 5000,   // Compresser si > 5 KB
    algorithm:      'gzip', // 'gzip' | 'none'
  },

  // ── NOUVEAU : Alertes intelligentes ──────────────────────────────────────
  alerts: {
    hitRateCritical:     50,   // % – en dessous → alerte critique
    hitRateWarning:      65,   // % – en dessous → alerte attention
    memoryUsageWarning:  80,   // % de la RAM Redis → alerte attention
    evictionRateWarning: 20,   // % d'évictions → alerte attention
    redisDisconnected:   true, // toujours urgence
    checkIntervalMs:     30_000, // vérification toutes les 30s
  },

  // ── NOUVEAU : Pre-fetching prédictif ──────────────────────────────────────
  prefetch: {
    enabled:           true,
    correlationMin:    3,    // co-occurrences min avant pre-fetch
    maxPrefetchAhead:  2,    // max catégories à pré-charger en parallèle
    coolingPeriodMs:   60_000, // ne pas re-précharger dans la minute
  },

  monitoring: {
    enabled:   process.env.NODE_ENV !== 'production',
    logMisses: false,
    logHits:   false,
  },

  // ── NOUVEAU : Buffer circulaire d'invalidations ───────────────────────────
  invalidationHistory: {
    maxEntries: 500,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 5. FONCTIONS UTILITAIRES
// ────────────────────────────────────────────────────────────────────────────

export const generateCacheKey = (type, params = {}) => {
  const sorted = Object.keys(params)
    .sort()
    .filter(k => params[k] !== undefined && params[k] !== '')
    .map(k => `${k}:${params[k]}`)
    .join('|');
  return `${type}:${sorted || 'all'}`;
};

// ────────────────────────────────────────────────────────────────────────────
// 6. FORMULE TTL DYNAMIQUE — VERSION CORRIGÉE v2
// ────────────────────────────────────────────────────────────────────────────
//
// CORRECTION du bug v1 :
//   ancienne formule : TTL_base × log(1+n)/log(10)
//   → quand n=0 : facteur = 0 → TTL_final = 0 → borné à 30s pour TOUS les items
//
// CORRECTION :
//   bonusFrequence = 1 + log(1+n)/log(10)
//   → quand n=0 : facteur = 1 (neutre)
//   → quand n=9 : facteur ≈ 2  (double le TTL)
//   → quand n=99: facteur ≈ 3  (triple le TTL)
//
// FORMULE FINALE :
//   TTL = TTL_base
//         × (1 + log(1+accessCount)/log(10))    ← fréquence (logarithmique)
//         × (1 + l3ResponseTimeMs/200)            ← coût du miss L3
//         × max(0.2, 1 - minutesSinceUpdate/60)  ← fraîcheur (pénalité si récent)
//   puis borné entre TTL_min et TTL_max
//
// Exemples :
//   n=0,  l3=0ms,   maj=0min  → 300 × 1    × 1   × 0.2 = 60s
//   n=0,  l3=0ms,   maj=60min → 300 × 1    × 1   × 1.0 = 300s
//   n=9,  l3=200ms, maj=30min → 300 × 2    × 2   × 0.5 = 600s
//   n=99, l3=400ms, maj=60min → 300 × 3    × 3   × 1.0 = 2700s
//
export const calculateDynamicTTL = (
  config,
  accessCount       = 0,
  l3ResponseTimeMs  = 0,
  minutesSinceUpdate = 0
) => {
  const TTL_base = config.ttl || 300;
  const TTL_min  = CACHE_CONFIG.limits?.minTTL ?? 30;
  const TTL_max  = 86400;

  // Bonus fréquence : neutre (×1) quand n=0, croît logarithmiquement
  const bonusFrequence = 1 + Math.log(1 + accessCount) / Math.log(10);

  // Bonus coût du miss L3 : L3 lent = garder plus longtemps en cache
  const bonusCoutMiss = 1 + (l3ResponseTimeMs / 200);

  // Pénalité fraîcheur : données fraîchement mises à jour = TTL plus court
  // 0 min → ×0.2  |  60 min → ×1.0  (linéaire, min 0.2)
  const penaliteFraicheur = Math.max(0.2, 1 - minutesSinceUpdate / 60);

  const TTL_final = TTL_base * bonusFrequence * bonusCoutMiss * penaliteFraicheur;

  return Math.round(Math.min(Math.max(TTL_final, TTL_min), TTL_max));
};

// ────────────────────────────────────────────────────────────────────────────
// 7. BUFFER CIRCULAIRE D'INVALIDATIONS
// ────────────────────────────────────────────────────────────────────────────

export class InvalidationHistoryBuffer {
  /**
   * @param {number} maxEntries taille max du buffer
   */
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    this._entries   = [];
  }

  /**
   * Enregistrer un événement d'invalidation.
   * @param {'product-updated'|'manual'|'ttl-expired'|'order-created'|string} trigger
   * @param {string} pattern clé ou pattern supprimé
   * @param {number} keysDeleted nombre de clés supprimées
   * @param {string} [context] contexte métier optionnel
   */
  push(trigger, pattern, keysDeleted = 1, context = '') {
    const entry = {
      timestamp:   new Date().toISOString(),
      trigger,
      pattern,
      keysDeleted,
      context,
    };
    this._entries.unshift(entry);
    if (this._entries.length > this.maxEntries) {
      this._entries.length = this.maxEntries; // trim circulaire
    }
  }

  /**
   * Retourner les N dernières entrées.
   * @param {number} limit
   */
  getLast(limit = 100) {
    return this._entries.slice(0, limit);
  }

  /**
   * Statistiques agrégées sur la fenêtre glissante de `windowMs` ms.
   * @param {number} windowMs
   */
  getStats(windowMs = 3_600_000) {
    const since = Date.now() - windowMs;
    const window = this._entries.filter(e => new Date(e.timestamp).getTime() > since);
    const byTrigger = {};
    let totalKeys = 0;
    for (const e of window) {
      byTrigger[e.trigger] = (byTrigger[e.trigger] ?? 0) + 1;
      totalKeys += e.keysDeleted;
    }
    return {
      totalEvents: window.length,
      totalKeysDeleted: totalKeys,
      byTrigger,
      windowMs,
    };
  }

  /** Vider le buffer */
  clear() { this._entries = []; }
}

// Singleton exporté
export const invalidationHistory = new InvalidationHistoryBuffer(
  CACHE_CONFIG.invalidationHistory?.maxEntries ?? 500
);
