import express from 'express';
import Product from '../models/Product.js';
import { clearCachePattern } from '../config/redis.js';
import cacheService from '../services/cache.service.js';

// ════════════════════════════════════════════════════════════
// IMPORT DES MIDDLEWARES CACHE
// ════════════════════════════════════════════════════════════
import {
  cacheMiddleware,
  searchCacheMiddleware,
  suggestionsCacheMiddleware,
  invalidateCachePattern,
} from '../middleware/cache.middleware.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// HELPER INVALIDATION
// ════════════════════════════════════════════════════════════
const invalidateCache = async (...patterns) => {
  await invalidateCachePattern(...patterns);
};

// ════════════════════════════════════════════════════════════
// GET /api/products — Liste + recherche + filtres
// FIX : category utilise $regex insensible à la casse
// ════════════════════════════════════════════════════════════
router.get('/',
  searchCacheMiddleware(),
  async (req, res) => {
    try {
      const {
        gender, category, search,
        minPrice, maxPrice, sizes, colors,
        sort = '-createdAt', page = 1, limit = 20
      } = req.query;

      const query = { isActive: true };

      if (gender) query.gender = gender;

      // ✅ FIX : Comparaison insensible à la casse pour category
      if (category) {
        query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
      }

      if (search && search.trim()) {
        const term = search.trim();
        query.$or = [
          { name:        { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } },
          { brand:       { $regex: term, $options: 'i' } }
        ];
      }

      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = Number(minPrice);
        if (maxPrice) query.price.$lte = Number(maxPrice);
      }

      if (sizes) query.sizes = { $in: sizes.split(',') };
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
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        },
        ...(search ? { searchTerm: search.trim(), resultCount: total } : {})
      });

    } catch (error) {
      console.error('Erreur GET /products:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/featured — Produits en vedette
// ════════════════════════════════════════════════════════════
router.get('/featured',
  cacheMiddleware('featured', (req) => ({ path: req.path })),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 8;
      const products = await Product.find({
        featured: true,
        isActive: true
      })
        .sort('-createdAt')
        .limit(limit)
        .lean();

      res.json({ success: true, products });
    } catch (error) {
      console.error('Erreur GET /products/featured:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/trending — Produits tendance (top ventes)
// ════════════════════════════════════════════════════════════
router.get('/trending',
  cacheMiddleware('trending', (req) => ({ path: req.path, limit: req.query.limit })),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 8;

      // Récupérer les produits triés par nombre de ventes
      const products = await Product.find({ isActive: true })
        .sort('-salesCount -rating.average')
        .limit(limit)
        .lean();

      res.json({ success: true, products });
    } catch (error) {
      console.error('Erreur GET /products/trending:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/categories — Liste des catégories
// ════════════════════════════════════════════════════════════
router.get('/categories',
  cacheMiddleware('categories', (req) => ({ path: req.path })),
  async (req, res) => {
    try {
      const categories = await Product.distinct('category', { isActive: true });
      res.json({ success: true, categories });
    } catch (error) {
      console.error('Erreur GET /products/categories:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/search/suggestions — Autocomplete
// ════════════════════════════════════════════════════════════
router.get('/search/suggestions',
  suggestionsCacheMiddleware(),
  async (req, res) => {
    try {
      const { q = '' } = req.query;
      const term = q.trim();

      if (term.length < 2) {
        return res.json({ success: true, suggestions: [] });
      }

      const regex = { $regex: term, $options: 'i' };
      const activeFilter = { isActive: true };

      const [byName, byBrand, byCategory] = await Promise.all([
        Product.find(
          { ...activeFilter, name: regex },
          { name: 1, images: 1, price: 1 }
        ).limit(5).lean(),
        Product.find(
          { ...activeFilter, brand: regex },
          { brand: 1 }
        ).limit(3).lean(),
        Product.find(
          { ...activeFilter, category: regex },
          { category: 1 }
        ).limit(3).lean()
      ]);

      const suggestions = [
        ...byName.map(p => ({
          type: 'product',
          label: p.name,
          price: p.price,
          image: p.images?.[0]?.url || null,
          id: p._id
        })),
        ...byBrand.map(p => ({
          type: 'brand',
          label: p.brand
        })),
        ...byCategory.map(p => ({
          type: 'category',
          label: p.category
        }))
      ].slice(0, 8);

      res.json({ success: true, suggestions, query: term });

    } catch (error) {
      console.error('Erreur suggestions:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/search/popular — Recherches populaires
// ════════════════════════════════════════════════════════════
router.get('/search/popular',
  cacheMiddleware('search-popular', (req) => ({ path: req.path })),
  async (req, res) => {
    try {
      const [topCategories, topBrands] = await Promise.all([
        Product.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 6 }
        ]),
        Product.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$brand', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ])
      ]);

      res.json({
        success: true,
        popular: {
          categories: topCategories.map(c => c._id).filter(Boolean),
          brands: topBrands.map(b => b._id).filter(Boolean)
        }
      });

    } catch (error) {
      console.error('Erreur search popular:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/:id — Détail produit
// DOIT RESTER EN DERNIER
// ════════════════════════════════════════════════════════════
router.get('/:id',
  cacheMiddleware('product-detail', (req) => ({ path: req.path, id: req.params.id })),
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id).lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
      }

      // Incrémenter le compteur de vues
      await Product.findByIdAndUpdate(req.params.id, {
        $inc: { viewCount: 1 }
      });

      res.json({ success: true, product });
    } catch (error) {
      console.error('Erreur GET /products/:id:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// MUTATIONS — Invalider le cache après modification
// ════════════════════════════════════════════════════════════

router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();

    await invalidateCache(
      'products', 'featured', 'trending',
      'categories', 'search-suggestions', 'search-popular'
    );

    console.log('✅ Produit créé, cache invalidé');
    res.status(201).json({ success: true, product });
  } catch (error) {
    console.error('Erreur POST /products:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur'
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produit non trouvé'
      });
    }

    await invalidateCache(
      'products', 'product-detail', 'featured',
      'trending', 'search-suggestions'
    );

    console.log('✅ Produit modifié, cache invalidé');
    res.json({ success: true, product });
  } catch (error) {
    console.error('Erreur PUT /products/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur'
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produit non trouvé'
      });
    }

    await invalidateCache(
      'products', 'product-detail',
      'search-suggestions', 'search-popular'
    );

    console.log('✅ Produit supprimé, cache invalidé');
    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    console.error('Erreur DELETE /products/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur'
    });
  }
});

// ════════════════════════════════════════════════════════════
// ADMIN — Métriques & Gestion Cache
// ════════════════════════════════════════════════════════════

router.get('/admin/cache/metrics', (req, res) => {
  res.json({
    success: true,
    metrics: cacheService.getMetrics(),
    timestamp: new Date().toISOString()
  });
});

router.post('/admin/cache/clear', async (req, res) => {
  try {
    await invalidateCache(
      'products', 'product-detail', 'featured',
      'trending', 'categories', 'search-suggestions', 'search-popular'
    );
    res.json({ success: true, message: 'Cache vidé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/admin/cache/warmup', async (req, res) => {
  try {
    console.log('🔥 Warmup cache...');

    const [featured, trending, categories] = await Promise.all([
      Product.find({ featured: true, isActive: true })
        .limit(10)
        .lean(),
      Product.find({ isActive: true })
        .sort('-salesCount')
        .limit(10)
        .lean(),
      Product.distinct('category', { isActive: true })
    ]);

    await Promise.all([
      cacheService.set('featured', {}, { success: true, products: featured }, 7200),
      cacheService.set('trending', {}, { success: true, products: trending }, 3600),
      cacheService.set('categories', {}, { success: true, categories }, 86400),
    ]);

    console.log('✅ Warmup terminé');
    res.json({ success: true, message: 'Cache préchauffé' });
  } catch (error) {
    console.error('Erreur warmup:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
