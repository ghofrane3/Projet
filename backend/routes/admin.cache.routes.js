import express from 'express';
import { getRedisClient } from '../config/redis.js';
import cacheService from '../services/cache.service.js';
import {
  getMetrics,
  getHistory,
  resetMetrics
} from '../controllers/cacheMetrics.controller.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// ROUTES MÉTRIQUES — NOUVEAU (ordre important : avant /stats)
// ════════════════════════════════════════════════════════════

// GET  /api/admin/cache/metrics
router.get('/metrics', getMetrics);

// GET  /api/admin/cache/metrics/history
router.get('/metrics/history', getHistory);

// POST /api/admin/cache/metrics/reset
router.post('/metrics/reset', resetMetrics);

// ════════════════════════════════════════════════════════════
// ROUTES EXISTANTES
// ════════════════════════════════════════════════════════════

// GET /api/admin/cache/stats
router.get('/stats', async (req, res) => {
  try {
    const redisClient = getRedisClient();

    if (!redisClient) {
      return res.json({ success: false, message: 'Redis non connecté' });
    }

    const allKeys = await redisClient.keys('*');
    const keysByType = {};
    const keyDetails = [];

    for (const key of allKeys) {
      const type = key.split(':')[0];
      keysByType[type] = (keysByType[type] || 0) + 1;

      const ttl = await redisClient.ttl(key);
      const value = await redisClient.get(key);
      const size = value ? Buffer.byteLength(value, 'utf8') : 0;

      keyDetails.push({
        key,
        type,
        ttl: ttl > 0 ? ttl : 'permanent',
        size,
        sizeKB: (size / 1024).toFixed(2)
      });
    }

    const totalSize = keyDetails.reduce((sum, k) => sum + k.size, 0);

    res.json({
      success: true,
      stats: {
        totalKeys: allKeys.length,
        totalSizeKB: (totalSize / 1024).toFixed(2),
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        keysByType,
        recentKeys: keyDetails.sort((a, b) => b.size - a.size).slice(0, 50)
      }
    });

  } catch (error) {
    console.error('Erreur stats cache:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/cache/keys
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
        ttl,
        size: value ? Buffer.byteLength(value, 'utf8') : 0,
        preview: value ? value.substring(0, 100) : null
      });
    }

    res.json({ success: true, total: keys.length, displayed: keyData.length, keys: keyData });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/cache/key/:key
router.delete('/key/:key', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    const { key } = req.params;
    const deleted = await redisClient.del(key);
    res.json({
      success: deleted > 0,
      message: deleted > 0 ? `Clé ${key} supprimée` : 'Clé non trouvée',
      deleted
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/cache/pattern
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
    res.json({ success: true, message: `${deleted} clés supprimées`, deleted, keys });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/cache/all
router.delete('/all', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    await redisClient.flushDb();
    res.json({ success: true, message: 'Cache entièrement vidé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/cache/info
router.get('/info', async (req, res) => {
  try {
    const redisClient = getRedisClient();
    const info = await redisClient.info();

    const memoryMatch = info.match(/used_memory_human:(.*)/);
    const keysMatch = info.match(/keys=([\d]+)/);
    const uptimeMatch = info.match(/uptime_in_seconds:([\d]+)/);

    res.json({
      success: true,
      redis: {
        memory: memoryMatch ? memoryMatch[1].trim() : 'unknown',
        totalKeys: keysMatch ? keysMatch[1] : '0',
        uptime: uptimeMatch ? Number(uptimeMatch[1]) : 0,
        uptimeFormatted: uptimeMatch
          ? `${Math.floor(uptimeMatch[1] / 3600)}h ${Math.floor((uptimeMatch[1] % 3600) / 60)}m`
          : '0h 0m'
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/cache/warmup
router.post('/warmup', async (req, res) => {
  try {
    const { types = ['products', 'categories'] } = req.body;
    const Product = (await import('../models/Product.js')).default;
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

    res.json({ success: true, message: 'Cache préchauffé', warmedUp });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
