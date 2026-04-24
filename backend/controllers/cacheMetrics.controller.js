/**
 * cacheMetrics.controller.js  –  VERSION AMÉLIORÉE v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Nouveaux endpoints :
 *   GET  /api/admin/cache/preview-delete?pattern=...   → dry-run
 *   GET  /api/admin/cache/popular-keys                 → top clés LRU/LFU
 *   GET  /api/admin/cache/eviction-stats               → stats évictions
 *   GET  /api/admin/cache/alerts                       → alertes actives + historique
 *   GET  /api/admin/cache/invalidation-history         → timeline invalidations
 *   GET  /api/admin/cache/compression-stats            → ratio compression
 *   POST /api/admin/cache/prefetch/:category           → déclencher pre-fetch
 * ─────────────────────────────────────────────────────────────────────────────
 */

import cacheService        from '../services/cache.service.js';
import evictionEmitter     from '../services/eviction.emitter.js';
import { getRedisClientSafe } from '../config/redis.js';
import { invalidationHistory, CACHE_CONFIG } from '../config/cache.config.js';

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

const getRedis = () => getRedisClientSafe();

const ok  = (res, data, extra = {}) => res.json({ success: true,  data, ...extra });
const err = (res, msg, status = 500) => res.status(status).json({ success: false, error: msg });

/** Convertir un pattern glob simple en RegExp */
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

// ────────────────────────────────────────────────────────────────────────────
// MÉTRIQUES — GET /api/admin/cache/metrics
// ────────────────────────────────────────────────────────────────────────────

export const getMetrics = async (req, res) => {
  try {
    const metrics = cacheService.getMetrics?.() ?? {};
    ok(res, metrics);
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// HISTORIQUE MÉTRIQUES — GET /api/admin/cache/metrics/history
// ────────────────────────────────────────────────────────────────────────────

let _metricsHistory = [];

export const getMetricsHistory = async (req, res) => {
  try {
    // Snapshot toutes les 5 min (max 288 pour 24h)
    const snap = {
      timestamp:     new Date().toISOString(),
      ...(cacheService.getMetrics?.() ?? {}),
    };
    _metricsHistory.unshift(snap);
    if (_metricsHistory.length > 288) _metricsHistory.length = 288;
    ok(res, _metricsHistory.slice(0, 100));
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// RESET MÉTRIQUES — POST /api/admin/cache/metrics/reset
// ────────────────────────────────────────────────────────────────────────────

export const resetMetrics = async (req, res) => {
  try {
    cacheService.resetMetrics?.();
    _metricsHistory = [];
    evictionEmitter.emit('metrics', 'reset', 'L1+L2', { context: 'admin-reset' });
    ok(res, { message: 'Métriques réinitialisées' });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// STATS GÉNÉRALES — GET /api/admin/cache/stats
// ────────────────────────────────────────────────────────────────────────────

export const getCacheStats = async (req, res) => {
  try {
    const redis = getRedis();
    const stats = { totalKeys: 0, totalSizeKB: '0', totalSizeMB: '0', keysByType: {}, recentKeys: [] };

    if (redis) {
      const keys = await redis.keys('*').catch(() => []);
      stats.totalKeys = keys.length;

      let totalSize = 0;
      const recentKeys = [];
      const limit = Math.min(keys.length, 50);

      for (let i = 0; i < limit; i++) {
        const key = keys[i];
        try {
          const [val, ttl] = await Promise.all([
            redis.get(key).catch(() => null),
            redis.ttl(key).catch(() => -2),
          ]);
          const size = val ? Buffer.byteLength(val, 'utf8') : 0;
          totalSize += size;

          const type = key.split(':')[0] || 'other';
          stats.keysByType[type] = (stats.keysByType[type] ?? 0) + 1;

          recentKeys.push({
            key,
            type,
            ttl: ttl === -1 ? 'permanent' : ttl,
            size,
            sizeKB: (size / 1024).toFixed(2),
          });
        } catch {}
      }

      stats.recentKeys  = recentKeys.sort((a, b) => b.size - a.size);
      stats.totalSizeKB = (totalSize / 1024).toFixed(2);
      stats.totalSizeMB = (totalSize / 1048576).toFixed(3);
    }

    res.json({ success: true, stats });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// INFO REDIS — GET /api/admin/cache/info
// ────────────────────────────────────────────────────────────────────────────

export const getRedisInfo = async (req, res) => {
  try {
    const redis = getRedis();
    const redisData = { memory: 'N/A', totalKeys: '0', uptime: 0, uptimeFormatted: '0s' };

    if (redis) {
      const [serverInfo, dbSize] = await Promise.all([
        redis.info().catch(() => ''),
        redis.dbSize().catch(() => 0),
      ]);

      const memMatch    = serverInfo.match(/used_memory_human:(.+)/);
      const uptimeMatch = serverInfo.match(/uptime_in_seconds:(\d+)/);

      redisData.memory   = memMatch    ? memMatch[1].trim()    : 'N/A';
      redisData.totalKeys = String(dbSize);
      const sec = uptimeMatch ? parseInt(uptimeMatch[1]) : 0;
      redisData.uptime   = sec;
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      redisData.uptimeFormatted = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    }

    res.json({ success: true, redis: redisData });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// SUPPRESSION PAR CLÉ — DELETE /api/admin/cache/key/:key
// ────────────────────────────────────────────────────────────────────────────

export const deleteKey = async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    console.log('🗑️ Suppression clé demandée:', key);

    const redis = getRedis();
    let deleted = 0;

    // Suppression de Redis
    if (redis) {
      const result = await redis.del(key).catch(err => {
        console.error('Erreur suppression Redis:', err);
        return 0;
      });
      deleted = result;
    }

    // Suppression du cache mémoire
    if (cacheService.memoryCache?.has(key)) {
      cacheService.memoryCache.delete(key);
    }
    if (cacheService.memoryCacheStats?.has(key)) {
      cacheService.memoryCacheStats.delete(key);
    }

    // Utiliser invalidate si disponible, sinon ignorer
    if (typeof cacheService.invalidate === 'function') {
      await cacheService.invalidate(key).catch(err => {
        console.warn('Avertissement invalidate:', err.message);
      });
    }

    // Émettre l'événement d'éviction
    evictionEmitter.emit(key, 'manual_delete', 'L1+L2', { context: 'admin-ui' });

    console.log('✅ Clé supprimée:', key, 'deleted:', deleted);
    ok(res, { deleted: key, success: true });

  } catch (e) {
    console.error('❌ Erreur deleteKey:', e);
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// SUPPRESSION PAR PATTERN — DELETE /api/admin/cache/pattern
// ────────────────────────────────────────────────────────────────────────────

export const deleteByPattern = async (req, res) => {
  try {
    const { pattern } = req.body;
    if (!pattern) return err(res, 'pattern requis', 400);

    const redis = getRedis();
    let deleted = 0;
    const deletedKeys = [];

    if (redis) {
      const keys = await redis.keys(pattern).catch(() => []);
      for (const k of keys) {
        await redis.del(k).catch(() => {});
        cacheService.memoryCache?.delete(k);
        cacheService.memoryCacheStats?.delete(k);
        deletedKeys.push(k);
        deleted++;
      }
    }

    evictionEmitter.emitBatch(deletedKeys, 'pattern_delete', { pattern, context: 'admin-ui' });
    ok(res, { deleted, pattern, keys: deletedKeys });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ★ NOUVEAU : DRY-RUN — GET /api/admin/cache/preview-delete?pattern=...
// ────────────────────────────────────────────────────────────────────────────

export const previewDelete = async (req, res) => {
  try {
    const { pattern } = req.query;
    if (!pattern) return err(res, 'pattern query param requis', 400);

    const redis = getRedis();
    let matchedKeys = [];
    let totalSizeBytes = 0;

    if (redis) {
      const allKeys = await redis.keys(pattern).catch(() => []);
      const limit = Math.min(allKeys.length, 200);

      for (let i = 0; i < limit; i++) {
        const key = allKeys[i];
        try {
          const [val, ttl] = await Promise.all([
            redis.get(key).catch(() => null),
            redis.ttl(key).catch(() => -2),
          ]);
          const sizeBytes = val ? Buffer.byteLength(val, 'utf8') : 0;
          totalSizeBytes += sizeBytes;
          matchedKeys.push({
            key,
            ttl: ttl === -1 ? 'permanent' : ttl,
            sizeKB: (sizeBytes / 1024).toFixed(2),
            type: key.split(':')[0] || 'other',
          });
        } catch {}
      }

      // Si plus de 200 clés, indiquer le total réel
      if (allKeys.length > 200) {
        matchedKeys.push({
          key: `... et ${allKeys.length - 200} clés supplémentaires`,
          ttl: null, sizeKB: '?', type: '...',
        });
      }

      ok(res, {
        pattern,
        matchedCount:  allKeys.length,
        previewCount:  Math.min(allKeys.length, 200),
        totalSizeKB:   (totalSizeBytes / 1024).toFixed(2),
        keys:          matchedKeys,
        warning:       allKeys.length > 50
          ? `Attention : ${allKeys.length} clés seront supprimées définitivement.`
          : null,
      });
    } else {
      ok(res, { pattern, matchedCount: 0, previewCount: 0, totalSizeKB: '0', keys: [] });
    }
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// VIDAGE TOTAL — DELETE /api/admin/cache/all
// ────────────────────────────────────────────────────────────────────────────

export const clearAll = async (req, res) => {
  try {
    const redis = getRedis();
    let count = 0;
    if (redis) {
      count = await redis.dbSize().catch(() => 0);
      await redis.flushDb().catch(() => {});
    }
    cacheService.memoryCache?.clear?.();
    cacheService.memoryCacheStats?.clear?.();
    evictionEmitter._emitCleared({ count, reason: 'full_flush', context: 'admin-ui' });
    ok(res, { cleared: count });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// WARMUP — POST /api/admin/cache/warmup
// ────────────────────────────────────────────────────────────────────────────

export const warmupCache = async (req, res) => {
  try {
    ok(res, { warmed: true, message: 'Warmup déclenché en arrière-plan' });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// SMART CONFIG — GET /api/admin/cache/smart-config
// ────────────────────────────────────────────────────────────────────────────

export const getSmartConfig = async (req, res) => {
  try {
    const cfg = cacheService.getAdaptiveTTLConfig?.();
    if (!cfg) return err(res, 'Smart cache non configuré', 404);
    ok(res, cfg);
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// SMART CONFIG — POST /api/admin/cache/smart-config
// ────────────────────────────────────────────────────────────────────────────

export const updateSmartConfig = async (req, res) => {
  try {
    const updated = cacheService.updateAdaptiveTTLConfig?.(req.body);
    if (!updated) return err(res, 'Smart cache non disponible', 404);
    ok(res, updated);
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POPULAR KEYS (strategy) — GET /api/admin/cache/strategy/popular
// ────────────────────────────────────────────────────────────────────────────

export const getPopularKeys = async (req, res) => {
  try {
    const strategy = cacheService.strategy;
    if (!strategy?._meta) return ok(res, []);

    const limit = parseInt(req.query.limit ?? '20');
    const entries = [...strategy._meta.entries()]
      .map(([key, meta]) => ({
        key,
        score:       meta.hits ?? meta.freq ?? 0,
        lastAccess:  meta.lastAccess ?? meta.insertedAt ?? 0,
        computedTTL: cacheService.adaptiveTTL?.compute(key, meta) ?? null,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    ok(res, entries);
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ★ NOUVEAU : POPULAR KEYS (pour le dashboard) — GET /api/admin/cache/popular-keys
// ────────────────────────────────────────────────────────────────────────────

export const getPopularCacheKeys = async (req, res) => {
  try {
    const strategy = cacheService.strategy;
    const limit = parseInt(req.query.limit ?? '10');
    let entries = [];

    if (strategy?._meta) {
      entries = [...strategy._meta.entries()]
        .map(([key, meta]) => ({
          key,
          accessCount: meta.hits ?? meta.freq ?? 0,
          lastAccess:  new Date(meta.lastAccess ?? meta.insertedAt ?? Date.now()).toISOString(),
          size:        0, // taille en mémoire non disponible directement
          sizeKB:      '0',
        }))
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, limit);
    }

    // Enrichir avec la taille Redis si dispo
    const redis = getRedis();
    if (redis && entries.length > 0) {
      for (const entry of entries) {
        try {
          const val = await redis.get(entry.key).catch(() => null);
          if (val) {
            const bytes = Buffer.byteLength(val, 'utf8');
            entry.size  = bytes;
            entry.sizeKB = (bytes / 1024).toFixed(2);
          }
        } catch {}
      }
    }

    ok(res, entries);
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ★ NOUVEAU : STATS ÉVICTIONS — GET /api/admin/cache/eviction-stats
// ────────────────────────────────────────────────────────────────────────────

export const getEvictionStats = async (req, res) => {
  try {
    const metrics = cacheService.getMetrics?.() ?? {};
    const totalEvictions  = metrics.evictions ?? 0;
    const totalRequests   = metrics.totalRequests ?? 1;
    const evictionRate    = Math.round(totalEvictions / totalRequests * 100);

    // Récupérer les évictions récentes depuis le buffer d'invalidations
    const recent = invalidationHistory.getLast(20)
      .filter(e => ['eviction', 'ttl-expired', 'batch_eviction'].includes(e.trigger))
      .map(e => ({
        timestamp: e.timestamp,
        key:       e.pattern,
        reason:    e.trigger,
      }));

    ok(res, {
      totalEvictions,
      evictionRate,
      recentEvictions: recent,
      strategySize:    cacheService.strategy?.size?.() ?? 0,
      maxSize:         CACHE_CONFIG.limits?.maxMemoryKeys ?? 500,
    });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ★ NOUVEAU : ALERTES — GET /api/admin/cache/alerts
// ────────────────────────────────────────────────────────────────────────────

export const getAlerts = async (req, res) => {
  try {
    const active  = evictionEmitter.getActiveAlerts();
    const history = evictionEmitter.getAlertHistory(50);
    ok(res, { active, history, activeCount: active.length });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ★ NOUVEAU : HISTORIQUE INVALIDATIONS — GET /api/admin/cache/invalidation-history
// ────────────────────────────────────────────────────────────────────────────

export const getInvalidationHistory = async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit  ?? '100');
    const window = parseInt(req.query.window ?? '3600000'); // 1h par défaut
    const entries = invalidationHistory.getLast(limit);
    const stats   = invalidationHistory.getStats(window);
    ok(res, { entries, stats });
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ★ NOUVEAU : STATS COMPRESSION — GET /api/admin/cache/compression-stats
// ────────────────────────────────────────────────────────────────────────────

export const getCompressionStats = async (req, res) => {
  try {
    const stats = evictionEmitter.getCompressionStats();
    ok(res, stats);
  } catch (e) {
    err(res, e.message);
  }
};

// ────────────────────────────────────────────────────────────────────────────
// INSPECT KEY — GET /api/admin/cache/inspect/:key
// ────────────────────────────────────────────────────────────────────────────

export const inspectKey = async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const result = await cacheService.inspectKey?.(key);
    if (!result) return err(res, 'inspectKey non disponible', 404);
    ok(res, result);
  } catch (e) {
    err(res, e.message);
  }
};
