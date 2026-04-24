// backend/routes/product.routes.js
import express from 'express';
import Product from '../models/Product.js';
import cacheService from '../services/cache.service.js';
import {
  cacheMiddleware,
  searchCacheMiddleware,
  suggestionsCacheMiddleware,
  invalidateCachePattern
} from '../middleware/cache.middleware.js';

const router = express.Router();

// ====================== HELPER MESURE L3 ======================
const withL3Timing = async (operationFn) => {
  const start = performance.now();
  const result = await operationFn();
  const l3ResponseTimeMs = performance.now() - start;
  return { result, l3ResponseTimeMs };
};

// ====================== HELPER INVALIDATION ======================
const invalidateCache = async (...patterns) => {
  await invalidateCachePattern(...patterns);
};

// ====================== ROUTES GET ======================

// Liste des produits
router.get('/',
  searchCacheMiddleware(),
  async (req, res) => {
    try {
      const { gender, category, search, minPrice, maxPrice, sizes, colors, sort = '-createdAt', page = 1, limit = 20 } = req.query;

      const query = { isActive: true };
      if (gender) query.gender = gender;
      if (category) query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
      if (search?.trim()) {
        const term = search.trim();
        query.$or = [
          { name: { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } },
          { brand: { $regex: term, $options: 'i' } }
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

      const { result: [products, total] } = await withL3Timing(async () =>
        Promise.all([
          Product.find(query).sort(sort).skip(skip).limit(Number(limit)).lean(),
          Product.countDocuments(query)
        ])
      );

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

// Produits en vedette
router.get('/featured', cacheMiddleware('featured'), async (req, res) => {
  const limit = parseInt(req.query.limit) || 8;
  const { result: products } = await withL3Timing(async () =>
    Product.find({ featured: true, isActive: true }).sort('-createdAt').limit(limit).lean()
  );
  res.json({ success: true, products });
});

// Produits tendance
router.get('/trending', cacheMiddleware('trending'), async (req, res) => {
  const limit = parseInt(req.query.limit) || 8;
  const { result: products } = await withL3Timing(async () =>
    Product.find({ isActive: true }).sort('-salesCount -rating.average').limit(limit).lean()
  );
  res.json({ success: true, products });
});

// Catégories
router.get('/categories', cacheMiddleware('categories'), async (req, res) => {
  const { result: categories } = await withL3Timing(async () =>
    Product.distinct('category', { isActive: true })
  );
  res.json({ success: true, categories });
});

// Suggestions de recherche
router.get('/search/suggestions', suggestionsCacheMiddleware(), async (req, res) => {
  const { q = '' } = req.query;
  const term = q.trim();
  if (term.length < 2) return res.json({ success: true, suggestions: [] });

  const regex = { $regex: term, $options: 'i' };
  const activeFilter = { isActive: true };

  const { result: [byName, byBrand, byCategory] } = await withL3Timing(async () => Promise.all([
    Product.find({ ...activeFilter, name: regex }, { name: 1, images: 1, price: 1 }).limit(5).lean(),
    Product.find({ ...activeFilter, brand: regex }, { brand: 1 }).limit(3).lean(),
    Product.find({ ...activeFilter, category: regex }, { category: 1 }).limit(3).lean()
  ]));

  const suggestions = [
    ...byName.map(p => ({ type: 'product', label: p.name, price: p.price, image: p.images?.[0]?.url || null, id: p._id })),
    ...byBrand.map(p => ({ type: 'brand', label: p.brand })),
    ...byCategory.map(p => ({ type: 'category', label: p.category }))
  ].slice(0, 8);

  res.json({ success: true, suggestions, query: term });
});
// GET /api/products/search/suggestions?q=rob
// ⚠️ Doit être AVANT /:id pour éviter le conflit
router.get('/search/suggestions', async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    // Tentative cache — TTL long car les suggestions changent peu
    const cacheKey = `suggestions:${q.toLowerCase()}`;
    const cached = await cacheService.getByKey(cacheKey, 3600); // 1h
    if (cached) {
      return res.json({ success: true, suggestions: cached, source: 'cache' });
    }

    const regex = new RegExp(q, 'i');
    const products = await Product.find({ name: regex })
      .select('name price images category')
      .limit(5)
      .lean();

    const suggestions = products.map(p => ({
      type:  'product',
      label: p.name,
      price: p.price,
      image: p.images?.[0]?.url || null,
      id:    p._id
    }));

    await cacheService.setWithTTL(cacheKey, suggestions, 3600);

    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('❌ Erreur suggestions:', error);
    res.json({ success: true, suggestions: [] });
  }
});
// ====================== DÉTAIL PRODUIT (TRÈS IMPORTANT) ======================
router.get('/:id',
  cacheMiddleware('product-detail', (req) => ({ id: req.params.id })),   // Clé unique par ID
  async (req, res) => {
    try {
      const { result: product } = await withL3Timing(async () =>
        Product.findById(req.params.id).lean()
      );

      if (!product) {
        return res.status(404).json({ success: false, message: 'Produit non trouvé' });
      }

      await Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });

      res.json({ success: true, product });
    } catch (error) {
      console.error('Erreur GET /products/:id:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// ====================== MUTATIONS ======================
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    await invalidateCache('products', 'featured', 'trending', 'categories', 'search-suggestions', 'search-popular', 'product-detail');
    res.status(201).json({ success: true, product });
  } catch (error) {
    console.error('Erreur POST /products:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur serveur' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    await invalidateCache('products', 'product-detail', 'featured', 'trending', 'search-suggestions');
    res.json({ success: true, product });
  } catch (error) {
    console.error('Erreur PUT /products/:id:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur serveur' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    await invalidateCache('products', 'product-detail', 'search-suggestions', 'search-popular');
    res.json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    console.error('Erreur DELETE /products/:id:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur serveur' });
  }
});

export default router;
