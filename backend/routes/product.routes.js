import express from 'express';
import Product from '../models/Product.js';
import { clearCachePattern } from '../config/redis.js';

// ════════════════════════════════════════════════════════════
// IMPORT DU SINGLETON CACHESERVICE (remplace MultiLevelCache)
// ════════════════════════════════════════════════════════════
import cacheService from '../services/cache.service.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CACHE AUTOMATIQUE (branché sur cacheService)
// ════════════════════════════════════════════════════════════
const cacheMiddleware = (type, ttl = 3600) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const params = { ...req.query, path: req.path };

    // ─── Mesure du temps L3 pour le SET ──────────────────
    let l3Start = null;

    // Utilise cacheService.get() → incrémente L1/L2 hits
    const cachedData = await cacheService.get(type, params);

    if (cachedData) {
      return res.json({ ...cachedData, _cached: true });
    }

    // MISS → on va en MongoDB, on mesure le temps L3
    l3Start = Date.now();

    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Calcule le temps L3 (MongoDB) et le passe au SET
      const l3Time = l3Start ? Date.now() - l3Start : 0;
      cacheService.set(type, params, data, l3Time);
      return originalJson(data);
    };

    next();
  };
};

// ════════════════════════════════════════════════════════════
// HELPER : Invalider le cache (L1 + L2 via cacheService)
// ════════════════════════════════════════════════════════════
const invalidateCache = async (...patterns) => {
  for (const pattern of patterns) {
    // L1 : vider les clés correspondantes du memoryCache
    for (const [key] of cacheService.memoryCache) {
      if (key.includes(pattern)) {
        cacheService.memoryCache.delete(key);
        cacheService.memoryCacheStats.delete(key);
      }
    }
    // L2 : vider Redis
    await clearCachePattern(`*${pattern}*`);
  }
  cacheService.metrics.invalidations++;
  console.log(`🔄 Cache invalidé: ${patterns.join(', ')}`);
};

// ════════════════════════════════════════════════════════════
// ROUTES AVEC CACHE (logique métier identique)
// ════════════════════════════════════════════════════════════

// GET /api/products
router.get('/',
  cacheMiddleware('products', 3600),
  async (req, res) => {
    try {
      const {
        gender, category, search,
        minPrice, maxPrice, sizes, colors,
        sort = '-createdAt', page = 1, limit = 20
      } = req.query;

      const query = {};

      if (gender)   query.gender   = gender;
      if (category) query.category = category;

      if (search) {
        query.$or = [
          { name:        { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { brand:       { $regex: search, $options: 'i' } }
        ];
      }

      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
      }

      if (sizes)  query.sizes          = { $in: sizes.split(',') };
      if (colors) query['colors.name'] = { $in: colors.split(',') };

      const skip = (Number(page) - 1) * Number(limit);

      const [products, total] = await Promise.all([
        Product.find(query).sort(sort).skip(skip).limit(Number(limit)).lean(),
        Product.countDocuments(query)
      ]);

      res.json({
        success: true,
        products,
        pagination: {
          page:  Number(page),
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

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    await invalidateCache('products');
    console.log('✅ Produit créé, cache invalidé');
    res.status(201).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id, req.body, { new: true }
    );
    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }
    await invalidateCache('products', 'product-detail');
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
    await invalidateCache('products');
    console.log('✅ Produit supprimé, cache invalidé');
    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// ADMIN — Métriques & Gestion Cache (redirige vers cacheService)
// ════════════════════════════════════════════════════════════

// GET /api/products/admin/cache/metrics
router.get('/admin/cache/metrics', (req, res) => {
  res.json({
    success: true,
    metrics: cacheService.getMetrics(),
    timestamp: new Date().toISOString()
  });
});

// POST /api/products/admin/cache/clear
router.post('/admin/cache/clear', async (req, res) => {
  await invalidateCache('products', 'product-detail', 'featured', 'trending', 'categories');
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

    await cacheService.set('featured',    {}, { success: true, products: featured },   7200);
    await cacheService.set('trending',    {}, { success: true, products: trending },   3600);
    await cacheService.set('categories',  {}, { success: true, categories },           86400);

    console.log('✅ Warmup terminé');
    res.json({ success: true, message: 'Cache préchauffé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
