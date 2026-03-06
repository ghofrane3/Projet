import express from 'express';
import Product from '../models/Product.js';
import { getCache, setCache, clearCachePattern, getRedisClient } from '../config/redis.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// SYSTÈME CACHE 3 NIVEAUX INTÉGRÉ
// ════════════════════════════════════════════════════════════

class MultiLevelCache {
  constructor() {
    // L1: Cache mémoire (le plus rapide)
    this.memoryCache = new Map();
    this.stats = { L1_hits: 0, L2_hits: 0, misses: 0, sets: 0 };

    // Nettoyage automatique toutes les 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Générer clé unique
  generateKey(type, params) {
    const sorted = Object.keys(params)
      .sort()
      .map(k => `${k}:${params[k]}`)
      .join('|');
    return `${type}:${sorted}`;
  }

  // GET avec cascade L1 → L2 → L3
  async get(type, params, ttl = 3600) {
    const key = this.generateKey(type, params);

    try {
      // L1: Vérifier mémoire
      const memoryData = this.memoryCache.get(key);
      if (memoryData && Date.now() < memoryData.expires) {
        this.stats.L1_hits++;
        console.log(`🎯 L1 HIT: ${key}`);
        return memoryData.data;
      }

      // L2: Vérifier Redis
      const redisData = await getCache(key);
      if (redisData) {
        this.stats.L2_hits++;
        console.log(`🎯 L2 HIT: ${key}`);

        // Promouvoir en L1
        this.memoryCache.set(key, {
          data: redisData,
          expires: Date.now() + (ttl * 1000)
        });

        return redisData;
      }

      // L3: Miss - sera chargé depuis MongoDB
      this.stats.misses++;
      console.log(`❌ MISS: ${key}`);
      return null;

    } catch (error) {
      console.error('Erreur cache GET:', error);
      return null;
    }
  }

  // SET dans L1 + L2
  async set(type, params, data, ttl = 3600) {
    const key = this.generateKey(type, params);

    try {
      // L1: Sauvegarder en mémoire
      this.memoryCache.set(key, {
        data,
        expires: Date.now() + (ttl * 1000)
      });

      // L2: Sauvegarder en Redis
      await setCache(key, data, ttl);

      this.stats.sets++;
      return true;

    } catch (error) {
      console.error('Erreur cache SET:', error);
      return false;
    }
  }

  // Invalider tout (L1 + L2)
  async invalidateAll(pattern = '*') {
    try {
      // L1: Vider mémoire
      if (pattern === '*') {
        this.memoryCache.clear();
      } else {
        for (const [key] of this.memoryCache) {
          if (key.includes(pattern)) {
            this.memoryCache.delete(key);
          }
        }
      }

      // L2: Vider Redis
      await clearCachePattern(pattern);

      console.log(`🔄 Cache invalidé: ${pattern}`);
      return true;

    } catch (error) {
      console.error('Erreur invalidation:', error);
      return false;
    }
  }

  // Nettoyage des entrées expirées
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.memoryCache) {
      if (now > value.expires) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Nettoyage: ${cleaned} entrées expirées`);
    }
  }

  // Métriques
  getStats() {
    const total = this.stats.L1_hits + this.stats.L2_hits + this.stats.misses;
    const hitRate = total > 0
      ? (((this.stats.L1_hits + this.stats.L2_hits) / total) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      totalRequests: total,
      memoryCacheSize: this.memoryCache.size
    };
  }
}

// Instance unique du cache
const cache = new MultiLevelCache();

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE AUTOMATIQUE
// ════════════════════════════════════════════════════════════
const cacheMiddleware = (type, ttl = 3600) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const params = { ...req.query, path: req.path };
    const cachedData = await cache.get(type, params, ttl);

    if (cachedData) {
      return res.json({ ...cachedData, _cached: true });
    }

    // Intercepter réponse pour mise en cache
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      cache.set(type, params, data, ttl);
      return originalJson(data);
    };

    next();
  };
};

// ════════════════════════════════════════════════════════════
// ROUTES AVEC CACHE
// ════════════════════════════════════════════════════════════

// GET /api/products - Liste avec cache
router.get('/',
  cacheMiddleware('products', 3600),
  async (req, res) => {
    try {
      const {
        gender,
        category,
        search,
        minPrice,
        maxPrice,
        sizes,
        colors,
        sort = '-createdAt',
        page = 1,
        limit = 20
      } = req.query;

      const query = {};

      if (gender) query.gender = gender;
      if (category) query.category = category;

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } }
        ];
      }

      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
      }

      if (sizes) {
        const sizeArray = sizes.split(',');
        query.sizes = { $in: sizeArray };
      }

      if (colors) {
        const colorArray = colors.split(',');
        query['colors.name'] = { $in: colorArray };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [products, total] = await Promise.all([
        Product.find(query).sort(sort).skip(skip).limit(Number(limit)).lean(),
        Product.countDocuments(query)
      ]);

      res.json({
        success: true,
        products,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });

    } catch (error) {
      console.error('Erreur GET /products:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// GET /api/products/featured
router.get('/featured',
  cacheMiddleware('featured', 7200),
  async (req, res) => {
    try {
      const products = await Product.find({ featured: true }).limit(8).lean();
      res.json({ success: true, products });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// GET /api/products/trending
router.get('/trending',
  cacheMiddleware('trending', 3600),
  async (req, res) => {
    try {
      const products = await Product.find({ trending: true }).limit(10).lean();
      res.json({ success: true, products });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// GET /api/products/categories
router.get('/categories',
  cacheMiddleware('categories', 86400),
  async (req, res) => {
    try {
      const categories = await Product.distinct('category');
      res.json({ success: true, categories });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// GET /api/products/:id
router.get('/:id',
  cacheMiddleware('product-detail', 3600),
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id).lean();

      if (!product) {
        return res.status(404).json({ success: false, message: 'Produit non trouvé' });
      }

      res.json({ success: true, product });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// POST /api/products - Créer + invalider cache
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();

    // Invalider cache
    await cache.invalidateAll('products');
    console.log('✅ Produit créé, cache invalidé');

    res.status(201).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PUT /api/products/:id - Modifier + invalider
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    await cache.invalidateAll('products');
    await cache.invalidateAll('product-detail');
    console.log('✅ Produit modifié, cache invalidé');

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    await cache.invalidateAll('products');
    console.log('✅ Produit supprimé, cache invalidé');

    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// ADMIN - Métriques & Gestion Cache
// ════════════════════════════════════════════════════════════

// GET /api/products/admin/cache/metrics
router.get('/admin/cache/metrics', (req, res) => {
  res.json({
    success: true,
    metrics: cache.getStats(),
    timestamp: new Date().toISOString()
  });
});

// POST /api/products/admin/cache/clear
router.post('/admin/cache/clear', async (req, res) => {
  await cache.invalidateAll('*');
  res.json({ success: true, message: 'Cache vidé' });
});

// POST /api/products/admin/cache/warmup
router.post('/admin/cache/warmup', async (req, res) => {
  try {
    console.log('🔥 Warmup cache...');

    const [featured, trending, categories] = await Promise.all([
      Product.find({ featured: true }).limit(10).lean(),
      Product.find({ trending: true }).limit(10).lean(),
      Product.distinct('category')
    ]);

    await cache.set('featured', {}, featured, 7200);
    await cache.set('trending', {}, trending, 3600);
    await cache.set('categories', {}, categories, 86400);

    console.log('✅ Warmup terminé');
    res.json({ success: true, message: 'Cache préchauffé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
