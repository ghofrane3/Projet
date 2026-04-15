import express                         from 'express';
import Product                          from '../models/Product.js';
import { authenticateUser, authorizeAdmin } from '../middleware/auth.js';
import { upload, deleteImage, deleteImages } from '../config/cloudinary.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// AUTH — toutes les routes admin
// ════════════════════════════════════════════════════════════
router.use(authenticateUser);
router.use(authorizeAdmin);

// ════════════════════════════════════════════════════════════
// HELPER — Parser les champs JSON envoyés par FormData
// ════════════════════════════════════════════════════════════
const safeParseArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return value.trim() !== '' ? [value] : [];
    }
  }
  return [];
};

// ════════════════════════════════════════════════════════════
// HELPER — Wrapper multer pour gérer ses erreurs proprement
// ════════════════════════════════════════════════════════════
const uploadMiddleware = (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err) {
      console.error('❌ Erreur Multer/Cloudinary upload:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message || 'Erreur lors de l\'upload des images'
      });
    }
    next();
  });
};

// ════════════════════════════════════════════════════════════
// POST /api/admin/products — Créer un produit
// ════════════════════════════════════════════════════════════
router.post('/products', uploadMiddleware, async (req, res) => {
  try {
    console.log('📦 Création produit | body:', JSON.stringify(req.body));
    console.log('🖼️  Images Cloudinary reçues:', req.files?.length || 0);

    const {
      name, description, price, originalPrice,
      category, gender, sizes, colors,
      stock, material, brand, sku, tags, featured
    } = req.body;

    // ── Validation ──────────────────────────────────────
    const errors = [];
    if (!name?.trim())                                     errors.push('Le nom est requis');
    if (!description?.trim())                              errors.push('La description est requise');
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) errors.push('Le prix est invalide');
    if (!category?.trim())                                 errors.push('La catégorie est requise');

    const stockValue = parseInt(stock);
    if (stock === undefined || stock === null || stock === '' || isNaN(stockValue) || stockValue < 0)
      errors.push('Le stock est invalide');

    if (errors.length > 0) {
      // ✅ Supprimer les images déjà uploadées sur Cloudinary si validation échoue
      if (req.files?.length) {
        await deleteImages(req.files.map(f => f.filename));
      }
      return res.status(400).json({ success: false, errors });
    }

    // ── Construire le tableau images depuis Cloudinary ──
    // req.files contient : { path (url Cloudinary), filename (public_id), ... }
    const images = (req.files || []).map((file, index) => ({
      url:      file.path,       // URL sécurisée Cloudinary (https://res.cloudinary.com/...)
      publicId: file.filename,   // Public ID Cloudinary (pour suppression future)
      isMain:   index === 0,
    }));

    // ── Créer le produit ────────────────────────────────
    const product = await Product.create({
      name:          name.trim(),
      description:   description.trim(),
      price:         parseFloat(price),
      originalPrice: originalPrice && !isNaN(parseFloat(originalPrice))
                       ? parseFloat(originalPrice) : undefined,
      category:      category.trim(),
      gender:        gender || 'Unisexe',
      sizes:         safeParseArray(sizes),
      colors:        safeParseArray(colors),
      images,
      stock:         stockValue,
      material:      material?.trim() || '',
      brand:         brand?.trim() || 'Fashion Store',
      sku:           sku?.trim() || undefined,
      tags:          safeParseArray(tags),
      featured:      featured === 'true' || featured === true,
      isActive:      true,
    });

    console.log('✅ Produit créé:', product._id);
    res.status(201).json({ success: true, message: 'Produit créé avec succès !', product });

  } catch (error) {
    // Nettoyage Cloudinary si erreur après upload
    if (req.files?.length) {
      await deleteImages(req.files.map(f => f.filename));
    }

    console.error('❌ Erreur création produit:', error.name, error.message);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, errors });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'champ';
      return res.status(400).json({ success: false, errors: [`"${field}" existe déjà`] });
    }
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// PUT /api/admin/products/:id — Modifier un produit
// ════════════════════════════════════════════════════════════
router.put('/products/:id', uploadMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      if (req.files?.length) await deleteImages(req.files.map(f => f.filename));
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    const updates = { ...req.body };

    // ── Nouvelles images ────────────────────────────────
    if (req.files?.length > 0) {
      // Supprimer les anciennes images de Cloudinary
      const oldPublicIds = product.images
        .map(img => img.publicId)
        .filter(Boolean);
      if (oldPublicIds.length) await deleteImages(oldPublicIds);

      updates.images = req.files.map((file, index) => ({
        url:      file.path,
        publicId: file.filename,
        isMain:   index === 0,
      }));
    }

    // ── Parser les champs numériques / booléens ─────────
    if (updates.price)            updates.price         = parseFloat(updates.price);
    if (updates.stock !== undefined) updates.stock      = parseInt(updates.stock);
    if (updates.originalPrice)    updates.originalPrice = parseFloat(updates.originalPrice);
    if (updates.featured !== undefined)
      updates.featured = updates.featured === 'true' || updates.featured === true;

    // ── Parser les champs tableau ───────────────────────
    ['sizes', 'colors', 'tags'].forEach(field => {
      if (updates[field] && typeof updates[field] === 'string') {
        try   { updates[field] = JSON.parse(updates[field]); }
        catch { updates[field] = [updates[field]]; }
      }
    });

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    console.log('✅ Produit mis à jour:', req.params.id);
    res.json({ success: true, message: 'Produit mis à jour !', product: updated });

  } catch (error) {
    if (req.files?.length) await deleteImages(req.files.map(f => f.filename));
    console.error('❌ Erreur modification:', error.message);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/admin/products/:id — Supprimer un produit
// ════════════════════════════════════════════════════════════
router.delete('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    // ✅ Supprimer toutes les images de Cloudinary
    const publicIds = product.images.map(img => img.publicId).filter(Boolean);
    if (publicIds.length) await deleteImages(publicIds);

    await product.deleteOne();
    console.log('✅ Produit supprimé:', req.params.id);
    res.json({ success: true, message: 'Produit supprimé avec succès' });

  } catch (error) {
    console.error('❌ Erreur suppression:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/products — Liste tous les produits (admin)
// ════════════════════════════════════════════════════════════
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, sort = '-createdAt' } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;
    if (search)   query.$text    = { $search: search };

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sort)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      Product.countDocuments(query),
    ]);

    res.json({
      success: true, products, total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('❌ Erreur liste produits:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/admin/stats — Statistiques dashboard
// ════════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const [totalProducts, totalStock, outOfStock, featuredCount, categoryStats] =
      await Promise.all([
        Product.countDocuments({ isActive: true }),
        Product.aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]),
        Product.countDocuments({ stock: 0, isActive: true }),
        Product.countDocuments({ featured: true }),
        Product.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } },
          { $sort: { count: -1 } },
        ]),
      ]);

    res.json({
      success: true,
      stats: {
        totalProducts,
        totalStock:    totalStock[0]?.total || 0,
        outOfStock,
        featuredCount,
        categoryStats,
      },
    });
  } catch (error) {
    console.error('❌ Erreur stats:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
