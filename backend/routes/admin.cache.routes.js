import express from 'express';
import { getRedisClient } from '../config/redis.js';
import cacheService from '../services/cache.service.js';
import evictionEmitter from '../services/eviction.emitter.js';

// ✅ FIX ÉTAPE 2 : importer le middleware d'authentification
// Toutes les routes /api/admin/cache/* doivent être protégées
import { authenticateUser, authorizeAdmin } from '../middleware/auth.js';

import {
  getMetrics,
  getHistory,
  resetMetrics,
} from '../controllers/cacheMetrics.controller.js';

const router = express.Router();

// ✅ FIX ÉTAPE 2 : Appliquer protect + isAdmin sur TOUTES les routes du router
// Cela remplace le besoin de le mettre route par route.
// Si ton middleware s'appelle différemment (ex: authMiddleware, verifyToken),
// remplace les noms ici.
router.use(authenticateUser, authorizeAdmin);

// ════════════════════════════════════════════════════════════
// MÉTRIQUES (ordre important : avant /stats)
// ════════════════════════════════════════════════════════════

router.get('/metrics',         getMetrics);
router.get('/metrics/history', getHistory);
router.post('/metrics/reset',  resetMetrics);

// ════════════════════════════════════════════════════════════
// STATS REDIS
// ════════════════════════════════════════════════════════════

router.get('/stats', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    if (!redisClient) {
      return res.json({ success: false, message: 'Redis non connecté' });
    }

    const allKeys    = await redisClient.keys('*');
    const keysByType = {};
    const keyDetails = [];

    for (const key of allKeys) {
      const type  = key.split(':')[0];
      keysByType[type] = (keysByType[type] || 0) + 1;

      const ttl   = await redisClient.ttl(key);
      const value = await redisClient.get(key);
      const size  = value ? Buffer.byteLength(value, 'utf8') : 0;

      keyDetails.push({
        key,
        type,
        ttl:    ttl > 0 ? ttl : 'permanent',
        size,
        sizeKB: (size / 1024).toFixed(2),
      });
    }

    const totalSize = keyDetails.reduce((s, k) => s + k.size, 0);

    res.json({
      success: true,
      stats: {
        totalKeys:   allKeys.length,
        totalSizeKB: (totalSize / 1024).toFixed(2),
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        keysByType,
        recentKeys:  keyDetails.sort((a, b) => b.size - a.size).slice(0, 50),
      },
    });
  } catch (error) {
    console.error('Erreur stats cache:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// CLÉS
// ════════════════════════════════════════════════════════════

router.get('/keys', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    const { pattern = '*', limit = 100 } = req.query;
    const keys    = await redisClient.keys(pattern);
    const keyData = [];

    for (const key of keys.slice(0, Number(limit))) {
      const ttl   = await redisClient.ttl(key);
      const value = await redisClient.get(key);
      keyData.push({
        key,
        ttl,
        size:    value ? Buffer.byteLength(value, 'utf8') : 0,
        preview: value ? value.substring(0, 100) : null,
      });
    }

    res.json({ success: true, total: keys.length, displayed: keyData.length, keys: keyData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ FIX ÉTAPE 2 : deleteKey — notifier WebSocket après suppression
router.delete('/key/:key', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    const { key }     = req.params;
    const decodedKey  = decodeURIComponent(key);

    const deleted = await redisClient.del(decodedKey);

    // Synchronise L1 + stratégie
    cacheService.memoryCache.delete(decodedKey);
    cacheService.memoryCacheStats.delete(decodedKey);
    if (cacheService.strategy) cacheService.strategy.remove(decodedKey);

    // ✅ Notification WebSocket temps réel vers le dashboard Angular
    evictionEmitter.emit(decodedKey, 'manual_delete', 'L1+L2');

    res.json({
      success: deleted > 0,
      message: deleted > 0 ? `Clé ${decodedKey} supprimée` : 'Clé non trouvée',
      deleted,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ FIX ÉTAPE 2 : deleteByPattern — notifier WebSocket après suppression
router.delete('/pattern', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    const { pattern } = req.body;

    if (!pattern) {
      return res.status(400).json({ success: false, message: 'Pattern requis' });
    }

    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) {
      return res.json({ success: true, message: 'Aucune clé trouvée', deleted: 0 });
    }

    const deleted = await redisClient.del(keys);

    // Synchronise L1 + stratégie
    for (const k of keys) {
      cacheService.memoryCache.delete(k);
      cacheService.memoryCacheStats.delete(k);
      if (cacheService.strategy) cacheService.strategy.remove(k);
    }

    // ✅ Notification WebSocket — batch avec toutes les clés supprimées
    evictionEmitter.emitBatch(keys, 'pattern_delete');

    res.json({ success: true, message: `${deleted} clés supprimées`, deleted, keys });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ FIX ÉTAPE 2 : clearAll — notifier WebSocket après flush
router.delete('/all', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.flushDb();
    cacheService.memoryCache.clear();
    cacheService.memoryCacheStats.clear();

    // ✅ Notification WebSocket — cache:cleared
    evictionEmitter._emitCleared();

    res.json({ success: true, message: 'Cache entièrement vidé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// INFO REDIS
// ════════════════════════════════════════════════════════════

router.get('/info', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    const info        = await redisClient.info();

    const memoryMatch = info.match(/used_memory_human:(.*)/);
    const keysMatch   = info.match(/keys=([\d]+)/);
    const uptimeMatch = info.match(/uptime_in_seconds:([\d]+)/);
    const uptime      = uptimeMatch ? Number(uptimeMatch[1]) : 0;

    res.json({
      success: true,
      redis: {
        memory:          memoryMatch ? memoryMatch[1].trim() : 'unknown',
        totalKeys:       keysMatch   ? keysMatch[1]          : '0',
        uptime,
        uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// WARMUP
// ════════════════════════════════════════════════════════════

router.post('/warmup', async (req, res) => {
  try {
    const { types = ['products', 'categories'] } = req.body;
    const Product      = (await import('../models/Product.js')).default;
    const { setCache } = await import('../config/redis.js');

    const warmedUp = [];

    if (types.includes('products')) {
      const featured = await Product.find({ featured: true }).limit(10).lean();
      const trending = await Product.find({ trending: true }).limit(10).lean();
      await setCache('products:featured', featured, 7200);
      await setCache('products:trending', trending, 3600);
      warmedUp.push('products (featured + trending)');
    }

    if (types.includes('categories')) {
      const categories = await Product.distinct('category');
      await setCache('categories:all', categories, 86400);
      warmedUp.push('categories');
    }

    // ✅ Notification WebSocket après warmup
    evictionEmitter.emitMetrics();

    res.json({ success: true, message: 'Cache préchauffé', warmedUp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// SMART CACHE (TTL Adaptatif + Stratégie)
// ════════════════════════════════════════════════════════════

router.get('/smart-config', (req, res) => {
  try {
    if (!cacheService.getAdaptiveTTLConfig) {
      return res.status(503).json({
        success: false,
        error: 'Smart cache non initialisé — appelez patchCacheService() dans server.js',
      });
    }
    res.json({ success: true, data: cacheService.getAdaptiveTTLConfig() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/smart-config', (req, res) => {
  try {
    if (!cacheService.updateAdaptiveTTLConfig) {
      return res.status(503).json({
        success: false,
        error: 'Smart cache non initialisé — appelez patchCacheService() dans server.js',
      });
    }
    const updated = cacheService.updateAdaptiveTTLConfig(req.body);
    evictionEmitter.emitMetrics();
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/inspect/:key', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);

    if (cacheService.inspectKey) {
      const info = await cacheService.inspectKey(key);
      return res.json({ success: true, data: info });
    }

    const redisClient = getRedisClient();
    const ttl = redisClient ? await redisClient.ttl(key) : -2;
    res.json({
      success: true,
      data: { key, inL1: cacheService.memoryCache.has(key), inL2: ttl > -2, redisTTL: ttl },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/strategy/popular', (req, res) => {
  try {
    const strategy = cacheService.strategy;

    if (!strategy) {
      return res.json({ success: true, data: cacheService.getPopularKeys(10) });
    }

    const entries = [...(strategy._meta?.entries() ?? [])];
    const sorted  = entries
      .sort((a, b) => (b[1].hits ?? b[1].freq ?? 0) - (a[1].hits ?? a[1].freq ?? 0))
      .slice(0, 10)
      .map(([key, meta]) => ({
        key,
        score:       meta.hits ?? meta.freq ?? 0,
        lastAccess:  meta.lastAccess ?? meta.insertedAt ?? 0,
        computedTTL: cacheService.adaptiveTTL
          ? cacheService.adaptiveTTL.compute(key, meta)
          : null,
      }));

    res.json({ success: true, data: sorted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// CONFIG (conservée de l'existant)
// ════════════════════════════════════════════════════════════

router.get('/config', (req, res) => {
  const smartData = cacheService.getAdaptiveTTLConfig
    ? cacheService.getAdaptiveTTLConfig()
    : null;

  res.json({
    success: true,
    data: {
      ttlConfig: {
        textSearch:     300,
        priceFilter:    600,
        categoryFilter: 1800,
        generalList:    3600,
        suggestions:    120,
      },
      smartCache: smartData,
      metrics: cacheService.getMetrics ? cacheService.getMetrics() : null,
    },
  });
});

export default router;
