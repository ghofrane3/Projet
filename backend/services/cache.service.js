// backend/services/cache.service.js
import { getRedisClientSafe } from '../config/redis.js';
import { CACHE_CONFIG, generateCacheKey, calculateDynamicTTL } from '../config/cache.config.js';
import evictionEmitter from './eviction.emitter.js';

// ════════════════════════════════════════════════════════════════════════════
// SERVICE CACHE MULTINIVEAU  L1(mémoire) → L2(Redis) → L3(MongoDB)
// ════════════════════════════════════════════════════════════════════════════

class CacheService {
  constructor() {
    this.memoryCache      = new Map();
    this.memoryCacheStats = new Map();

    this.metrics = {
      hits:          { L1: 0, L2: 0 },
      misses:        0,
      sets:          0,
      invalidations: 0,
      l1Misses:      0,
      l2Misses:      0,
      l3Requests:    0,
      l1ResponseTimeSum:   0, l1ResponseTimeCount: 0,
      l2ResponseTimeSum:   0, l2ResponseTimeCount: 0,
      l3ResponseTimeSum:   0, l3ResponseTimeCount: 0,
      evictions: 0,
    };

    this.metricsHistory     = [];
    this.HISTORY_MAX_POINTS = 1440;
    this._snapshotStarted   = false;

    this.startMemoryCleanup();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET via type + params (routes standard)
  // ══════════════════════════════════════════════════════════════════════════
  async get(type, params = {}) {
    const key    = generateCacheKey(type, params);
    const config = CACHE_CONFIG.strategies[type] || CACHE_CONFIG.strategies.default;
    if (!config || config.bypass) return null;
    return this._getFromLevels(key, config.ttl || 300);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET par clé brute
  // ══════════════════════════════════════════════════════════════════════════
  async getByKey(key, defaultTTL = 300) {
    return this._getFromLevels(key, defaultTTL);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LECTURE L1 → L2 centralisée
  // ══════════════════════════════════════════════════════════════════════════
  async _getFromLevels(key, defaultTTL) {
    try {
      // L1 : mémoire
      const t1    = Date.now();
      const l1hit = this.getFromMemory(key);

      if (l1hit !== null) {
        const ms = Date.now() - t1;
        this.metrics.hits.L1++;
        this.metrics.l1ResponseTimeSum   += ms;
        this.metrics.l1ResponseTimeCount++;
        this.incrementAccessCount(key);
        if (CACHE_CONFIG.monitoring?.enabled)
          console.log(`🎯 L1 HIT: ${key} (${ms}ms)`);
        return l1hit;
      }

      this.metrics.l1Misses++;

      // L2 : Redis
      const redis = getRedisClientSafe();
      if (redis) {
        const t2 = Date.now();
        let raw;

        try {
          raw = await redis.get(key);
        } catch (err) {
          console.error(`❌ L2 GET error [${key}]:`, err.message);
          this.metrics.l2Misses++;
          this.metrics.misses++;
          this.metrics.l3Requests++;
          return null;
        }

        if (raw !== null) {
          const ms = Date.now() - t2;
          let parsed;

          try {
            parsed = JSON.parse(raw);
          } catch {
            console.error(`❌ L2 JSON corrompu [${key}] — supprimé`);
            await redis.del(key).catch(() => {});
            this.metrics.l2Misses++;
            this.metrics.misses++;
            this.metrics.l3Requests++;
            return null;
          }

          this.metrics.hits.L2++;
          this.metrics.l2ResponseTimeSum   += ms;
          this.metrics.l2ResponseTimeCount++;

          let remainingTTL = defaultTTL;
          try {
            const redisTTL = await redis.ttl(key);
            if (redisTTL > 0) remainingTTL = redisTTL;
          } catch {}

          this.memoryCache.set(key, {
            data:      parsed,
            expiresAt: Date.now() + (remainingTTL * 1000),
            createdAt: Date.now()
          });
          this.incrementAccessCount(key);

          if (CACHE_CONFIG.monitoring?.enabled)
            console.log(`🎯 L2 HIT: ${key} (${ms}ms) → remonté L1`);

          return parsed;
        }

        this.metrics.l2Misses++;
      } else {
        console.warn(`⚠️  Redis indisponible — GET [${key}]`);
        this.metrics.l2Misses++;
      }

      this.metrics.misses++;
      this.metrics.l3Requests++;
      return null;

    } catch (err) {
      console.error(`Erreur _getFromLevels [${key}]:`, err);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SET via type + params
  // ══════════════════════════════════════════════════════════════════════════
  async set(type, params = {}, data, l3Ms = 0) {
    const key    = generateCacheKey(type, params);
    const config = CACHE_CONFIG.strategies[type] || CACHE_CONFIG.strategies.default;
    if (!config || config.bypass) return false;
    const ttl = calculateDynamicTTL(config, this.getAccessCount(key));
    return this._setToLevels(key, data, ttl, l3Ms);
  }

  async setWithTTL(key, data, ttl, l3Ms = 0) {
    return this._setToLevels(key, data, ttl, l3Ms);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉCRITURE L1 + L2
  // ══════════════════════════════════════════════════════════════════════════
  async _setToLevels(key, data, ttl, l3Ms = 0) {
    try {
      if (l3Ms > 0) {
        this.metrics.l3ResponseTimeSum   += l3Ms;
        this.metrics.l3ResponseTimeCount++;
      }

      // L1
      if (this.memoryCache.size >= (CACHE_CONFIG.limits?.maxMemoryKeys || 500))
        this.evictLRU();

      this.memoryCache.set(key, {
        data,
        expiresAt: Date.now() + (ttl * 1000),
        createdAt: Date.now()
      });

      // L2 Redis
      const redis = getRedisClientSafe();
      if (redis) {
        try {
          await redis.setEx(key, ttl, JSON.stringify(data));
        } catch (err) {
          console.error(`❌ L2 SET error [${key}]:`, err.message);
        }
      }

      this.metrics.sets++;
      return true;

    } catch (err) {
      console.error(`Erreur _setToLevels [${key}]:`, err);
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MÉTHODES D'INVALIDATION (CORRIGÉES)
  // ══════════════════════════════════════════════════════════════════════════

  async delete(key) {
    if (!key) return;
    return this.invalidateKey(key, 'direct_delete');
  }

  async invalidatePattern(pattern) {
    // L1
    for (const [key] of this.memoryCache) {
      if (key.match(new RegExp(pattern.replace(/\*/g, '.*')))) {
        this.memoryCache.delete(key);
        this.memoryCacheStats.delete(key);
      }
    }

    // L2 Redis
    const redis = getRedisClientSafe();
    if (redis) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) await redis.del(keys);
      } catch (err) {
        console.error(`Erreur invalidatePattern ${pattern}:`, err.message);
      }
    }
    this.metrics.invalidations++;
  }

  async invalidateKey(key, context = 'manual_delete') {
    this.memoryCache.delete(key);
    this.memoryCacheStats.delete(key);

    const redis = getRedisClientSafe();
    if (redis) {
      try {
        await redis.del(key);
      } catch (err) {
        console.error(`Erreur invalidateKey [${key}]:`, err.message);
      }
    }

    this.metrics.invalidations++;
    evictionEmitter.emit(key, 'manual_delete', 'L1+L2', { context });
  }

  async invalidateByTag(tag) {
    const deletedKeys = [];

    // L1
    for (const [key] of this.memoryCache) {
      if (key.includes(tag)) {
        this.memoryCache.delete(key);
        this.memoryCacheStats.delete(key);
        deletedKeys.push(key);
      }
    }

    // L2
    const redis = getRedisClientSafe();
    if (redis) {
      try {
        const keys = await redis.keys(`*${tag}*`);
        if (keys.length > 0) {
          await redis.del(keys);
          deletedKeys.push(...keys);
        }
      } catch (err) {
        console.error(`Erreur invalidation tag ${tag}:`, err.message);
      }
    }

    this.metrics.invalidations++;
    return deletedKeys;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FLUSH TOTAL
  // ══════════════════════════════════════════════════════════════════════════
  async flush(context = 'full_flush') {
    const count = this.memoryCache.size;
    this.memoryCache.clear();
    this.memoryCacheStats.clear();

    const redis = getRedisClientSafe();
    if (redis) {
      try {
        await redis.flushDb();
      } catch (err) {
        console.error('Erreur flush Redis:', err.message);
      }
    }

    this.metrics.invalidations++;
    evictionEmitter._emitCleared({ count, reason: 'full_flush', context });

    return count;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WARMUP
  // ══════════════════════════════════════════════════════════════════════════
  async warmup(type, dataFetcher) {
    const config = CACHE_CONFIG.strategies[type];
    if (!config) return;
    console.log(`🔥 Warmup: ${type}`);
    for (const category of (config.warmup || [])) {
      try {
        const data = await dataFetcher(category);
        await this.set(type, { category }, data);
      } catch (err) {
        console.error(`Erreur warmup ${type}/${category}:`, err.message);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MÉMOIRE L1
  // ══════════════════════════════════════════════════════════════════════════
  getFromMemory(key) {
    const e = this.memoryCache.get(key);
    if (!e) return null;
    if (e.expiresAt && Date.now() > e.expiresAt) {
      this.memoryCache.delete(key);
      this.memoryCacheStats.delete(key);
      return null;
    }
    return e.data;
  }

  evictLRU() {
    const n      = Math.ceil(this.memoryCache.size * 0.1);
    const sorted = [...this.memoryCacheStats.entries()]
      .sort((a, b) => a[1].count - b[1].count)
      .slice(0, n);

    for (const [k] of sorted) {
      this.memoryCache.delete(k);
      this.memoryCacheStats.delete(k);
      this.metrics.evictions++;
    }

    console.log(`🧹 LRU eviction: ${n} entrées`);
  }

  startMemoryCleanup() {
    setInterval(() => {
      let n = 0;
      for (const [k, e] of this.memoryCache) {
        if (e.expiresAt && Date.now() > e.expiresAt) {
          this.memoryCache.delete(k);
          this.memoryCacheStats.delete(k);
          n++;
        }
      }
      if (n > 0) console.log(`🧹 Cleanup L1: ${n} expirées`);
    }, 5 * 60 * 1000);
  }

  incrementAccessCount(key) {
    const s      = this.memoryCacheStats.get(key) || { count: 0, lastAccess: 0 };
    s.count++;
    s.lastAccess = Date.now();
    this.memoryCacheStats.set(key, s);
  }

  getAccessCount(key) {
    return this.memoryCacheStats.get(key)?.count || 0;
  }

  getPopularKeys(limit = 10) {
    return [...this.memoryCacheStats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([key, s]) => ({ key, ...s }));
  }

  getMetrics() {
    const m         = this.metrics;
    const l1Hits    = m.hits.L1;
    const l2Hits    = m.hits.L2;
    const totalHits = l1Hits + l2Hits;
    const totalReq  = totalHits + m.misses;

    const evictionRate = m.sets > 0
      ? parseFloat(((m.evictions / m.sets) * 100).toFixed(2))
      : 0;

    return {
      totalHits,
      totalMisses:   m.misses,
      totalRequests: totalReq,
      hitRate: totalReq > 0 ? parseFloat(((totalHits / totalReq) * 100).toFixed(2)) : 0,

      l1Hits,
      l1Misses:          m.l1Misses,
      l1HitRate: (l1Hits + m.l1Misses) > 0 ? parseFloat(((l1Hits / (l1Hits + m.l1Misses)) * 100).toFixed(2)) : 0,
      l1AvgResponseTime: m.l1ResponseTimeCount > 0 ? parseFloat((m.l1ResponseTimeSum / m.l1ResponseTimeCount).toFixed(2)) : 0,

      l2Hits,
      l2Misses:          m.l2Misses,
      l2HitRate: (l2Hits + m.l2Misses) > 0 ? parseFloat(((l2Hits / (l2Hits + m.l2Misses)) * 100).toFixed(2)) : 0,
      l2AvgResponseTime: m.l2ResponseTimeCount > 0 ? parseFloat((m.l2ResponseTimeSum / m.l2ResponseTimeCount).toFixed(2)) : 0,

      l3Requests:        m.l3Requests,
      l3AvgResponseTime: m.l3ResponseTimeCount > 0 ? parseFloat((m.l3ResponseTimeSum / m.l3ResponseTimeCount).toFixed(2)) : 0,

      sets:            m.sets,
      invalidations:   m.invalidations,
      memoryCacheSize: this.memoryCache.size,
      popularKeys:     this.getPopularKeys(10),
      evictions:       m.evictions,
      evictionRate,
    };
  }

  getHistory() { return [...this.metricsHistory]; }

  takeSnapshot() {
    const m = this.getMetrics();
    this.metricsHistory.push({
      timestamp:     new Date().toISOString(),
      hitRate:       m.hitRate,
      totalRequests: m.totalRequests,
      totalHits:     m.totalHits,
      totalMisses:   m.totalMisses,
      l1Hits:        m.l1Hits,
      l2Hits:        m.l2Hits,
      l3Requests:    m.l3Requests,
      evictions:     m.evictions,
      evictionRate:  m.evictionRate,
    });
    if (this.metricsHistory.length > this.HISTORY_MAX_POINTS)
      this.metricsHistory.shift();
  }

  startSnapshotTimer() {
    if (this._snapshotStarted) return;
    this._snapshotStarted = true;
    setInterval(() => this.takeSnapshot(), 60 * 1000);
    console.log('📊 Snapshots démarrés (60s)');
  }

  resetMetrics() {
    this.metrics = {
      hits: { L1: 0, L2: 0 },
      misses: 0, sets: 0, invalidations: 0,
      l1Misses: 0, l2Misses: 0, l3Requests: 0,
      l1ResponseTimeSum: 0, l1ResponseTimeCount: 0,
      l2ResponseTimeSum: 0, l2ResponseTimeCount: 0,
      l3ResponseTimeSum: 0, l3ResponseTimeCount: 0,
      evictions: 0,
    };
    this.metricsHistory = [];
    console.log('🔄 Métriques reset');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ════════════════════════════════════════════════════════════════════════════
const SINGLETON_KEY = Symbol.for('app.cacheService');

if (!globalThis[SINGLETON_KEY]) {
  globalThis[SINGLETON_KEY] = new CacheService();
  console.log('✅ CacheService singleton créé');
} else {
  console.log('♻️  CacheService singleton réutilisé');
}

export default globalThis[SINGLETON_KEY];
