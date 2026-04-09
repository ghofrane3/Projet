import express from 'express';
import Product  from '../models/Product.js';
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
// HELPER INVALIDATION (conserve l'ancien comportement)
// ════════════════════════════════════════════════════════════
const invalidateCache = async (...patterns) => {
  await invalidateCachePattern(...patterns);
};

// ════════════════════════════════════════════════════════════
// GET /api/products — Liste + recherche + filtres
// Utilise searchCacheMiddleware → TTL dynamique + normalisation
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

      const query = {};

      if (gender)   query.gender   = gender;
      if (category) query.category = category;

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
        },
        // Indiquer si c'est une recherche (utile pour le frontend)
        ...(search ? { searchTerm: search.trim(), resultCount: total } : {})
      });

    } catch (error) {
      console.error('Erreur GET /products:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/featured
// TTL fixe 7200s — cacheMiddleware standard
// ════════════════════════════════════════════════════════════
router.get('/featured',
  cacheMiddleware('featured', (req) => ({ path: req.path })),
  async (req, res) => {
    try {
      const products = await Product.find({ featured: true }).limit(8).lean();
      res.json({ success: true, products });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/trending
// ════════════════════════════════════════════════════════════
router.get('/trending',
  cacheMiddleware('trending', (req) => ({ path: req.path })),
  async (req, res) => {
    try {
      const products = await Product.find({ trending: true }).limit(10).lean();
      res.json({ success: true, products });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/categories
// ════════════════════════════════════════════════════════════
router.get('/categories',
  cacheMiddleware('categories', (req) => ({ path: req.path })),
  async (req, res) => {
    try {
      const categories = await Product.distinct('category');
      res.json({ success: true, categories });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// NOUVELLES ROUTES RECHERCHE
// ════════════════════════════════════════════════════════════

// GET /api/products/search/suggestions — Autocomplete
// Cache 2 min — résultats très dynamiques
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

      const [byName, byBrand, byCategory] = await Promise.all([
        Product.find({ name: regex },     { name: 1, images: 1, price: 1 }).limit(5).lean(),
        Product.find({ brand: regex },    { brand: 1 }).limit(3).lean(),
        Product.find({ category: regex }, { category: 1 }).limit(3).lean()
      ]);

      const suggestions = [
        ...byName.map(p => ({
          type:  'product',
          label: p.name,
          price: p.price,
          image: p.images?.[0] || null,
          id:    p._id
        })),
        ...byBrand.map(p => ({
          type:  'brand',
          label: p.brand
        })),
        ...byCategory.map(p => ({
          type:  'category',
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

// GET /api/products/search/popular — Recherches populaires
// Cache 1h — données stables
router.get('/search/popular',
  cacheMiddleware('search-popular', (req) => ({ path: req.path })),
  async (req, res) => {
    try {
      const [topCategories, topBrands] = await Promise.all([
        Product.aggregate([
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort:  { count: -1 } },
          { $limit: 6 }
        ]),
        Product.aggregate([
          { $group: { _id: '$brand', count: { $sum: 1 } } },
          { $sort:  { count: -1 } },
          { $limit: 5 }
        ])
      ]);

      res.json({
        success: true,
        popular: {
          categories: topCategories.map(c => c._id).filter(Boolean),
          brands:     topBrands.map(b => b._id).filter(Boolean)
        }
      });

    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/products/:id — Détail produit
// DOIT RESTER EN DERNIER (sinon capte /search/suggestions etc.)
// ════════════════════════════════════════════════════════════
router.get('/:id',
  cacheMiddleware('product-detail', (req) => ({ path: req.path, id: req.params.id })),
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

// ════════════════════════════════════════════════════════════
// MUTATIONS — Invalider le cache après modification
// ════════════════════════════════════════════════════════════

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    await invalidateCache('products', 'featured', 'trending',
                          'categories', 'search-suggestions', 'search-popular');
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
    await invalidateCache('products', 'product-detail', 'featured',
                          'trending', 'search-suggestions');
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
    await invalidateCache('products', 'product-detail',
                          'search-suggestions', 'search-popular');
    console.log('✅ Produit supprimé, cache invalidé');
    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// ADMIN — Métriques & Gestion Cache
// ════════════════════════════════════════════════════════════

router.get('/admin/cache/metrics', (req, res) => {
  res.json({
    success:   true,
    metrics:   cacheService.getMetrics(),
    timestamp: new Date().toISOString()
  });
});

router.post('/admin/cache/clear', async (req, res) => {
  await invalidateCache('products', 'product-detail', 'featured',
                        'trending', 'categories', 'search-suggestions', 'search-popular');
  res.json({ success: true, message: 'Cache vidé' });
});

router.post('/admin/cache/warmup', async (req, res) => {
  try {
    console.log('🔥 Warmup cache...');
    const [featured, trending, categories] = await Promise.all([
      Product.find({ featured: true }).limit(10).lean(),
      Product.find({ trending: true }).limit(10).lean(),
      Product.distinct('category')
    ]);

    await Promise.all([
      cacheService.set('featured',   {}, { success: true, products: featured },  7200),
      cacheService.set('trending',   {}, { success: true, products: trending },  3600),
      cacheService.set('categories', {}, { success: true, categories },         86400),
    ]);

    console.log('✅ Warmup terminé');
    res.json({ success: true, message: 'Cache préchauffé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
