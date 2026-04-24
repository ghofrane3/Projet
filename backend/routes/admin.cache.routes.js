/**
 * admin.cache.routes.js – VERSION FINALE v2.1
 * Routes administrateur Cache avec tous les nouveaux endpoints
 */

import express from 'express';
import { getRedisClient } from '../config/redis.js';
import cacheService from '../services/cache.service.js';
import evictionEmitter from '../services/eviction.emitter.js';

// Middleware d'authentification
import { authenticateUser, authorizeAdmin } from '../middleware/auth.js';

// Import des controllers
import {
  getMetrics,
  getMetricsHistory,
  resetMetrics,
  getCacheStats,
  getRedisInfo,
  deleteKey,
  deleteByPattern,
  previewDelete,
  clearAll,
  warmupCache,
  getSmartConfig,
  updateSmartConfig,
  getPopularKeys,
  getPopularCacheKeys,
  getEvictionStats,
  getAlerts,
  getInvalidationHistory,
  getCompressionStats,
  inspectKey,
} from '../controllers/cacheMetrics.controller.js';

const router = express.Router();

// 🔐 Protection de toutes les routes (Admin Only)
router.use(authenticateUser, authorizeAdmin);

// ════════════════════════════════════════════════════════════
// MÉTRIQUES
// ════════════════════════════════════════════════════════════
router.get('/metrics', getMetrics);
router.get('/metrics/history', getMetricsHistory);
router.post('/metrics/reset', resetMetrics);

// ════════════════════════════════════════════════════════════
// STATS & INFO REDIS
// ════════════════════════════════════════════════════════════
router.get('/stats', getCacheStats);
router.get('/info', getRedisInfo);

// ════════════════════════════════════════════════════════════
// GESTION DES CLÉS
// ════════════════════════════════════════════════════════════
router.get('/preview-delete', previewDelete);           // ★ Dry-run preview
router.delete('/key/:key', deleteKey);
router.delete('/pattern', deleteByPattern);
router.delete('/all', clearAll);
router.post('/warmup', warmupCache);

// ════════════════════════════════════════════════════════════
// SMART CACHE & STRATÉGIE
// ════════════════════════════════════════════════════════════
router.get('/smart-config', getSmartConfig);
router.post('/smart-config', updateSmartConfig);
router.get('/strategy/popular', getPopularKeys);

// ════════════════════════════════════════════════════════════
// ★ NOUVEAUX ENDPOINTS DASHBOARD
// ════════════════════════════════════════════════════════════
router.get('/popular-keys', getPopularCacheKeys);
router.get('/eviction-stats', getEvictionStats);
router.get('/alerts', getAlerts);
router.get('/invalidation-history', getInvalidationHistory);
router.get('/compression-stats', getCompressionStats);

// ════════════════════════════════════════════════════════════
// INSPECTION
// ════════════════════════════════════════════════════════════
router.get('/inspect/:key', inspectKey);

// ════════════════════════════════════════════════════════════
// ROUTES INLINE (Implémentations spécifiques)
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/cache/popular-keys
 * Clés les plus populaires (fallback / amélioration)
 */
router.get('/popular-keys', (req, res) => {
  try {
    const strategy = cacheService.strategy;
    let popular = [];

    if (strategy && strategy._meta) {
      const entries = [...strategy._meta.entries()];

      popular = entries
        .sort((a, b) => (b[1].hits ?? b[1].freq ?? 0) - (a[1].hits ?? a[1].freq ?? 0))
        .slice(0, 10)
        .map(([key, meta]) => ({
          key,
          hits: meta.hits ?? meta.freq ?? 0,
          lastAccess: meta.lastAccess ?? meta.insertedAt ?? Date.now(),
          ttl: meta.ttl ?? null,
        }));
    }
    else if (cacheService.getPopularKeys) {
      popular = cacheService.getPopularKeys(10) || [];
    }

    res.json({
      success: true,
      data: popular,
      count: popular.length
    });
  } catch (error) {
    console.error('Erreur popular-keys:', error);
    res.json({ success: true, data: [], count: 0 });
  }
});

/**
 * GET /api/admin/cache/eviction-stats
 * Statistiques d'éviction
 */
router.get('/eviction-stats', (req, res) => {
  try {
    const stats = {
      totalEvictions: cacheService.totalEvictions ?? 0,
      evictionRate: cacheService.evictionRate ?? 0,
      lruEvictions: cacheService.lruEvictions ?? 0,
      manualDeletions: cacheService.manualDeletions ?? 0,
      memoryUsage: cacheService.memoryCache?.size ?? 0,
      maxSize: cacheService.maxSize ?? 1000,
      currentSize: cacheService.memoryCache?.size ?? 0,
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Erreur eviction-stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// ROUTES SUPPLÉMENTAIRES UTILES (Optionnelles)
// ════════════════════════════════════════════════════════════

router.get('/keys', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    const { pattern = '*', limit = 100 } = req.query;

    const keys = await redisClient.keys(pattern);
    const keyData = [];

    for (const key of keys.slice(0, Number(limit))) {
      const ttl = await redisClient.ttl(key);
      const value = await redisClient.get(key);
      keyData.push({
        key,
        ttl: ttl > 0 ? ttl : 'permanent',
        size: value ? Buffer.byteLength(value, 'utf8') : 0,
        preview: value ? value.substring(0, 100) : null,
      });
    }

    res.json({
      success: true,
      total: keys.length,
      displayed: keyData.length,
      keys: keyData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
