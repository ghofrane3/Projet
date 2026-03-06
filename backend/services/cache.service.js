import { getRedisClient } from '../config/redis.js';  // ✅ CORRIGÉ
import { CACHE_CONFIG, generateCacheKey, calculateDynamicTTL } from '../config/cache-config.js';

// ════════════════════════════════════════════════════════════
// SERVICE CACHE MULTINIVEAU INTELLIGENT
// ════════════════════════════════════════════════════════════

class CacheService {
  constructor() {
    // L1 Cache: Mémoire locale (ultra rapide)
    this.memoryCache = new Map();
    this.memoryCacheStats = new Map();  // Compteur d'accès

    // Métriques
    this.metrics = {
      hits: { L1: 0, L2: 0 },
      misses: 0,
      sets: 0,
      invalidations: 0
    };

    // Nettoyage périodique du cache mémoire
    this.startMemoryCleanup();
  }

  // ════════════════════════════════════════════════════════════
  // GET - Récupération multiniveau
  // ════════════════════════════════════════════════════════════
  async get(type, params = {}) {
    const key = generateCacheKey(type, params);
    const config = CACHE_CONFIG.strategies[type];

    if (!config || config.bypass) {
      return null;
    }

    try {
      // L1: Vérifier cache mémoire
      const memoryResult = this.getFromMemory(key);
      if (memoryResult !== null) {
        this.metrics.hits.L1++;
        this.incrementAccessCount(key);

        if (CACHE_CONFIG.monitoring.enabled) {
          console.log(`🎯 L1 HIT: ${key}`);
        }

        return memoryResult;
      }

      // L2: Vérifier Redis
      const redisClient = getRedisClient();
      if (redisClient) {
        const redisData = await redisClient.get(key);

        if (redisData) {
          this.metrics.hits.L2++;
          const parsed = JSON.parse(redisData);

          // Promouvoir en L1 pour accès futur
          this.setInMemory(key, parsed, config);
          this.incrementAccessCount(key);

          if (CACHE_CONFIG.monitoring.enabled) {
            console.log(`🎯 L2 HIT: ${key}`);
          }

          return parsed;
        }
      }

      // Cache miss
      this.metrics.misses++;

      if (CACHE_CONFIG.monitoring.logMisses) {
        console.log(`❌ MISS: ${key}`);
      }

      return null;

    } catch (error) {
      console.error(`Erreur GET cache ${key}:`, error);
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════
  // SET - Écriture multiniveau
  // ════════════════════════════════════════════════════════════
  async set(type, params = {}, data) {
    const key = generateCacheKey(type, params);
    const config = CACHE_CONFIG.strategies[type];

    if (!config || config.bypass) {
      return false;
    }

    try {
      const accessCount = this.getAccessCount(key);
      const ttl = calculateDynamicTTL(config, accessCount);

      // L1: Écrire en mémoire
      this.setInMemory(key, data, config);

      // L2: Écrire en Redis
      const redisClient = getRedisClient();
      if (redisClient) {
        const serialized = JSON.stringify(data);

        if (config.compress && serialized.length > 1024) {
          // TODO: Implémenter compression pour gros objets
        }

        await redisClient.setEx(key, ttl, serialized);
      }

      this.metrics.sets++;
      return true;

    } catch (error) {
      console.error(`Erreur SET cache ${key}:`, error);
      return false;
    }
  }

  // ════════════════════════════════════════════════════════════
  // INVALIDATION INTELLIGENTE
  // ════════════════════════════════════════════════════════════
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
    // Invalider en mémoire
    for (const [key] of this.memoryCache) {
      if (key.includes(tag)) {
        this.memoryCache.delete(key);
        this.memoryCacheStats.delete(key);
      }
    }

    // Invalider en Redis
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        const keys = await redisClient.keys(`*${tag}*`);
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (error) {
        console.error(`Erreur invalidation Redis tag ${tag}:`, error);
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // WARMUP - Préchauffer le cache
  // ════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════
  // GESTION MÉMOIRE L1
  // ════════════════════════════════════════════════════════════
  getFromMemory(key) {
    const entry = this.memoryCache.get(key);

    if (!entry) return null;

    // Vérifier expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      this.memoryCacheStats.delete(key);
      return null;
    }

    return entry.data;
  }

  setInMemory(key, data, config) {
    // Vérifier limite mémoire
    if (this.memoryCache.size >= CACHE_CONFIG.limits.maxRedisKeys / 10) {
      this.evictLRU();
    }

    const expiresAt = config.ttl ? Date.now() + (config.ttl * 1000) : null;

    this.memoryCache.set(key, {
      data,
      expiresAt,
      createdAt: Date.now()
    });
  }

  evictLRU() {
    // Supprimer 10% des entrées les moins utilisées
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
    // Nettoyage toutes les 5 minutes
    setInterval(() => {
      let cleaned = 0;

      for (const [key, entry] of this.memoryCache) {
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          this.memoryCache.delete(key);
          this.memoryCacheStats.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`🧹 Nettoyage mémoire: ${cleaned} entrées expirées`);
      }
    }, 5 * 60 * 1000);
  }

  // ════════════════════════════════════════════════════════════
  // STATISTIQUES
  // ════════════════════════════════════════════════════════════
  incrementAccessCount(key) {
    const stats = this.memoryCacheStats.get(key) || { count: 0, lastAccess: Date.now() };
    stats.count++;
    stats.lastAccess = Date.now();
    this.memoryCacheStats.set(key, stats);
  }

  getAccessCount(key) {
    return this.memoryCacheStats.get(key)?.count || 0;
  }

  getMetrics() {
    const totalRequests = this.metrics.hits.L1 + this.metrics.hits.L2 + this.metrics.misses;
    const hitRate = totalRequests > 0
      ? ((this.metrics.hits.L1 + this.metrics.hits.L2) / totalRequests * 100).toFixed(2)
      : 0;

    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      totalRequests,
      memoryCacheSize: this.memoryCache.size,
      popularKeys: this.getPopularKeys(10)
    };
  }

  getPopularKeys(limit = 10) {
    return [...this.memoryCacheStats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([key, stats]) => ({ key, ...stats }));
  }

  // Reset métriques
  resetMetrics() {
    this.metrics = {
      hits: { L1: 0, L2: 0 },
      misses: 0,
      sets: 0,
      invalidations: 0
    };
  }
}

// Instance singleton
const cacheService = new CacheService();

export default cacheService;
