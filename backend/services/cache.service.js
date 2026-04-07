import { getRedisClient } from '../config/redis.js';
import { CACHE_CONFIG, generateCacheKey, calculateDynamicTTL } from '../config/cache.config.js';

// ════════════════════════════════════════════════════════════
// SERVICE CACHE MULTINIVEAU INTELLIGENT
// ════════════════════════════════════════════════════════════

class CacheService {
  constructor() {
    // L1 Cache: Mémoire locale
    this.memoryCache = new Map();
    this.memoryCacheStats = new Map();

    // ─── MÉTRIQUES COMPLÈTES ─────────────────────────────
    this.metrics = {
      hits: { L1: 0, L2: 0 },
      misses: 0,
      sets: 0,
      invalidations: 0,

      l1Misses: 0,
      l2Misses: 0,
      l3Requests: 0,

      l1ResponseTimeSum: 0,
      l1ResponseTimeCount: 0,
      l2ResponseTimeSum: 0,
      l2ResponseTimeCount: 0,
      l3ResponseTimeSum: 0,
      l3ResponseTimeCount: 0,
    };

    // Historique snapshots (max 1440 points = 24h)
    this.metricsHistory = [];
    this.HISTORY_MAX_POINTS = 1440;
    this._snapshotStarted = false;

    // Nettoyage périodique L1
    this.startMemoryCleanup();
  }

  // ════════════════════════════════════════════════════════
  // GET - Récupération multiniveau
  // ════════════════════════════════════════════════════════
  async get(type, params = {}) {
    const key = generateCacheKey(type, params);
    const config = CACHE_CONFIG.strategies[type];

    if (!config || config.bypass) return null;

    try {
      // ── L1 : mémoire locale ──────────────────────────
      const t1 = Date.now();
      const memoryResult = this.getFromMemory(key);

      if (memoryResult !== null) {
        const l1Time = Date.now() - t1;
        this.metrics.hits.L1++;
        this.metrics.l1ResponseTimeSum += l1Time;
        this.metrics.l1ResponseTimeCount++;
        this.incrementAccessCount(key);

        if (CACHE_CONFIG.monitoring.enabled) {
          console.log(`🎯 L1 HIT: ${key} (${l1Time}ms)`);
        }
        return memoryResult;
      }

      // L1 miss
      this.metrics.l1Misses++;

      // ── L2 : Redis ───────────────────────────────────
      const redisClient = getRedisClient();
      if (redisClient) {
        const t2 = Date.now();
        const redisData = await redisClient.get(key);

        if (redisData) {
          const l2Time = Date.now() - t2;
          this.metrics.hits.L2++;
          this.metrics.l2ResponseTimeSum += l2Time;
          this.metrics.l2ResponseTimeCount++;

          const parsed = JSON.parse(redisData);
          this.setInMemory(key, parsed, config);
          this.incrementAccessCount(key);

          if (CACHE_CONFIG.monitoring.enabled) {
            console.log(`🎯 L2 HIT: ${key} (${l2Time}ms)`);
          }
          return parsed;
        }

        // L2 miss
        this.metrics.l2Misses++;
      }

      // ── L3 : MongoDB (miss total) ────────────────────
      this.metrics.misses++;
      this.metrics.l3Requests++;

      if (CACHE_CONFIG.monitoring.logMisses) {
        console.log(`❌ MISS: ${key} → L3 (MongoDB)`);
      }
      return null;

    } catch (error) {
      console.error(`Erreur GET cache ${key}:`, error);
      return null;
    }
  }

  // ════════════════════════════════════════════════════════
  // SET - Écriture multiniveau
  // ════════════════════════════════════════════════════════

  // l3ResponseTimeMs : optionnel — passé depuis le controller produit
  async set(type, params = {}, data, l3ResponseTimeMs = 0) {
    const key = generateCacheKey(type, params);
    const config = CACHE_CONFIG.strategies[type];

    if (!config || config.bypass) return false;

    try {
      const accessCount = this.getAccessCount(key);
      const ttl = calculateDynamicTTL(config, accessCount);

      // Enregistrer temps L3 si fourni
      if (l3ResponseTimeMs > 0) {
        this.metrics.l3ResponseTimeSum += l3ResponseTimeMs;
        this.metrics.l3ResponseTimeCount++;
      }

      // L1 : mémoire
      this.setInMemory(key, data, config);

      // L2 : Redis
      const redisClient = getRedisClient();
      if (redisClient) {
        const serialized = JSON.stringify(data);
        await redisClient.setEx(key, ttl, serialized);
      }

      this.metrics.sets++;
      return true;

    } catch (error) {
      console.error(`Erreur SET cache ${key}:`, error);
      return false;
    }
  }

  // ════════════════════════════════════════════════════════
  // INVALIDATION
  // ════════════════════════════════════════════════════════
  async invalidate(eventType) {
    const tagsToInvalidate = CACHE_CONFIG.invalidation[eventType] || [];
    if (tagsToInvalidate.length === 0) return;

    console.log(`🔄 Invalidation: ${eventType} → ${tagsToInvalidate.join(', ')}`);

    for (const tag of tagsToInvalidate) {
      await this.invalidateByTag(tag);
    }
    this.metrics.invalidations++;
  }

  async invalidateByTag(tag) {
    for (const [key] of this.memoryCache) {
      if (key.includes(tag)) {
        this.memoryCache.delete(key);
        this.memoryCacheStats.delete(key);
      }
    }

    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        const keys = await redisClient.keys(`*${tag}*`);
        if (keys.length > 0) await redisClient.del(keys);
      } catch (error) {
        console.error(`Erreur invalidation Redis tag ${tag}:`, error);
      }
    }
  }

  // ════════════════════════════════════════════════════════
  // WARMUP
  // ════════════════════════════════════════════════════════
  async warmup(type, dataFetcher) {
    const config = CACHE_CONFIG.strategies[type];
    if (!config || !config.warmup) return;

    console.log(`🔥 Warmup cache: ${type}`);
    for (const category of config.warmup) {
      try {
        const data = await dataFetcher(category);
        await this.set(type, { category }, data);
      } catch (error) {
        console.error(`Erreur warmup ${type}/${category}:`, error);
      }
    }
  }

  // ════════════════════════════════════════════════════════
  // GESTION MÉMOIRE L1
  // ════════════════════════════════════════════════════════
  getFromMemory(key) {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      this.memoryCacheStats.delete(key);
      return null;
    }
    return entry.data;
  }

  setInMemory(key, data, config) {
    if (this.memoryCache.size >= CACHE_CONFIG.limits.maxRedisKeys / 10) {
      this.evictLRU();
    }

    const expiresAt = config.ttl ? Date.now() + (config.ttl * 1000) : null;
    this.memoryCache.set(key, { data, expiresAt, createdAt: Date.now() });
  }

  evictLRU() {
    const entriesToRemove = Math.ceil(this.memoryCache.size * 0.1);
    const sortedByAccess = [...this.memoryCacheStats.entries()]
      .sort((a, b) => a[1].count - b[1].count)
      .slice(0, entriesToRemove);

    for (const [key] of sortedByAccess) {
      this.memoryCache.delete(key);
      this.memoryCacheStats.delete(key);
    }
    console.log(`🧹 Eviction LRU: ${entriesToRemove} entrées supprimées`);
  }

  startMemoryCleanup() {
    setInterval(() => {
      let cleaned = 0;
      for (const [key, entry] of this.memoryCache) {
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          this.memoryCache.delete(key);
          this.memoryCacheStats.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) console.log(`🧹 Nettoyage mémoire: ${cleaned} entrées expirées`);
    }, 5 * 60 * 1000);
  }

  // ════════════════════════════════════════════════════════
  // STATISTIQUES ACCÈS
  // ════════════════════════════════════════════════════════
  incrementAccessCount(key) {
    const stats = this.memoryCacheStats.get(key) || { count: 0, lastAccess: Date.now() };
    stats.count++;
    stats.lastAccess = Date.now();
    this.memoryCacheStats.set(key, stats);
  }

  getAccessCount(key) {
    return this.memoryCacheStats.get(key)?.count || 0;
  }

  getPopularKeys(limit = 10) {
    return [...this.memoryCacheStats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([key, stats]) => ({ key, ...stats }));
  }

  // ════════════════════════════════════════════════════════
  // MÉTRIQUES COMPLÈTES
  // ════════════════════════════════════════════════════════
  getMetrics() {
    const {
      hits, misses, sets, invalidations,
      l1Misses, l2Misses, l3Requests,
      l1ResponseTimeSum, l1ResponseTimeCount,
      l2ResponseTimeSum, l2ResponseTimeCount,
      l3ResponseTimeSum, l3ResponseTimeCount,
    } = this.metrics;

    const l1Hits = hits.L1;
    const l2Hits = hits.L2;
    const totalHits = l1Hits + l2Hits;
    const totalRequests = totalHits + misses;

    return {
      // Global
      totalHits,
      totalMisses: misses,
      totalRequests,
      hitRate: totalRequests > 0
        ? parseFloat(((totalHits / totalRequests) * 100).toFixed(2))
        : 0,

      // L1
      l1Hits,
      l1Misses,
      l1HitRate: (l1Hits + l1Misses) > 0
        ? parseFloat(((l1Hits / (l1Hits + l1Misses)) * 100).toFixed(2))
        : 0,
      l1AvgResponseTime: l1ResponseTimeCount > 0
        ? parseFloat((l1ResponseTimeSum / l1ResponseTimeCount).toFixed(2))
        : 0,

      // L2
      l2Hits,
      l2Misses,
      l2HitRate: (l2Hits + l2Misses) > 0
        ? parseFloat(((l2Hits / (l2Hits + l2Misses)) * 100).toFixed(2))
        : 0,
      l2AvgResponseTime: l2ResponseTimeCount > 0
        ? parseFloat((l2ResponseTimeSum / l2ResponseTimeCount).toFixed(2))
        : 0,

      // L3
      l3Requests,
      l3AvgResponseTime: l3ResponseTimeCount > 0
        ? parseFloat((l3ResponseTimeSum / l3ResponseTimeCount).toFixed(2))
        : 0,

      // Existants conservés
      sets,
      invalidations,
      memoryCacheSize: this.memoryCache.size,
      popularKeys: this.getPopularKeys(10),
    };
  }

  // ════════════════════════════════════════════════════════
  // HISTORIQUE SNAPSHOTS
  // ════════════════════════════════════════════════════════
  getHistory() {
    return [...this.metricsHistory];
  }

  takeSnapshot() {
    const m = this.getMetrics();
    this.metricsHistory.push({
      timestamp: new Date().toISOString(),
      hitRate: m.hitRate,
      totalRequests: m.totalRequests,
      totalHits: m.totalHits,
      totalMisses: m.totalMisses,
      l1Hits: m.l1Hits,
      l2Hits: m.l2Hits,
      l3Requests: m.l3Requests,
    });

    if (this.metricsHistory.length > this.HISTORY_MAX_POINTS) {
      this.metricsHistory.shift();
    }
  }

  // Appelé une seule fois depuis server.js après connectRedis()
  startSnapshotTimer() {
    if (this._snapshotStarted) return;
    this._snapshotStarted = true;
    setInterval(() => this.takeSnapshot(), 60 * 1000);
    console.log('📊 Cache metrics snapshots démarrés (toutes les 60s)');
  }

  // ════════════════════════════════════════════════════════
  // RESET
  // ════════════════════════════════════════════════════════
  resetMetrics() {
    this.metrics = {
      hits: { L1: 0, L2: 0 },
      misses: 0,
      sets: 0,
      invalidations: 0,
      l1Misses: 0,
      l2Misses: 0,
      l3Requests: 0,
      l1ResponseTimeSum: 0,
      l1ResponseTimeCount: 0,
      l2ResponseTimeSum: 0,
      l2ResponseTimeCount: 0,
      l3ResponseTimeSum: 0,
      l3ResponseTimeCount: 0,
    };
    this.metricsHistory = [];
    console.log('🔄 Cache metrics reset');
  }
}

// Singleton
// ════════════════════════════════════════════════════════════
// SINGLETON GARANTI via globalThis (évite les doubles instances ESM)
// ════════════════════════════════════════════════════════════

const SINGLETON_KEY = Symbol.for('app.cacheService');

if (!globalThis[SINGLETON_KEY]) {
  globalThis[SINGLETON_KEY] = new CacheService();
  console.log('✅ CacheService singleton créé');
} else {
  console.log('♻️  CacheService singleton réutilisé');
}

const cacheService = globalThis[SINGLETON_KEY];


// DIAGNOSTIC TEMPORAIRE — à supprimer après vérification
console.log('🆔 CacheService instance ID:', Math.random().toString(36).slice(2));
export default cacheService;
