import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// ─────────────────────────────────────────
// GET /api/products - Tous les produits
// ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      gender,
      search,
      minPrice,
      maxPrice,
      sizes,
      sort = '-createdAt',
      featured
    } = req.query;

    // ── Construire la requête ────────────────
    let query = { isActive: true };

    if (category) query.category = category;
    if (gender) query.gender = gender;
    if (featured) query.featured = true;

    // Filtre prix
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Filtre tailles
    if (sizes) {
      const sizeArray = sizes.split(',');
      query.sizes = { $in: sizeArray };
    }

    // Recherche textuelle
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // ── Trier ────────────────────────────────
    let sortOption = {};
    switch (sort) {
      case 'price_asc':    sortOption = { price: 1 }; break;
      case 'price_desc':   sortOption = { price: -1 }; break;
      case 'popular':      sortOption = { salesCount: -1 }; break;
      case 'rating':       sortOption = { 'rating.average': -1 }; break;
      case '-createdAt':
      default:             sortOption = { createdAt: -1 }; break;
    }

    // ── Pagination ───────────────────────────
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption)
        .limit(parseInt(limit))
        .skip(skip)
        .select('-__v'),
      Product.countDocuments(query)
    ]);

    res.json({
      success: true,
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération produits:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/products/featured - Produits vedettes
// ─────────────────────────────────────────
router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ featured: true, isActive: true })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('-__v');

    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/products/categories - Toutes les catégories
// ─────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/products/:id - Un produit
// ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    // Incrémenter le compteur de vues
    await Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
