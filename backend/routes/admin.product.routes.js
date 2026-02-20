import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Product from '../models/Product.js';
import { authenticateUser, authorizeAdmin } from '../middleware/auth.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==========================================
// CONFIGURATION MULTER (Upload d'images)
// ==========================================

// Créer le dossier uploads s'il n'existe pas
const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Dossier uploads créé:', uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2)}-${file.originalname.replace(/\s+/g, '-')}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format non supporté. Utilisez JPG, PNG ou WebP'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max par image
    files: 5                    // Max 5 images
  }
});

// ==========================================
// MIDDLEWARE AUTH - Toutes les routes admin
// ==========================================
router.use(authenticateUser);
router.use(authorizeAdmin);

// ==========================================
// ROUTES PRODUITS
// ==========================================

// ─────────────────────────────────────────
// POST /api/admin/products - Créer produit
// ─────────────────────────────────────────
router.post('/products', upload.array('images', 5), async (req, res) => {
  try {
    console.log('📦 Création de produit');
    console.log('📋 Body reçu:', JSON.stringify(req.body, null, 2));
    console.log('🖼️ Fichiers reçus:', req.files?.length || 0);

    const {
      name, description, price, originalPrice,
      category, gender, sizes, colors,
      stock, material, brand, sku,
      tags, featured
    } = req.body;

    // ── Validation ──────────────────────────
    const errors = [];
    if (!name || name.trim() === '') errors.push('Le nom est requis');
    if (!description || description.trim() === '') errors.push('La description est requise');
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) errors.push('Le prix est invalide');
    if (!category || category.trim() === '') errors.push('La catégorie est requise');

    // FIX: stock peut être "0" (string) — vérification corrigée
    const stockValue = parseInt(stock);
    if (stock === undefined || stock === null || stock === '' || isNaN(stockValue) || stockValue < 0) {
      errors.push('Le stock est invalide');
    }

    // FIX: Images rendues optionnelles — l'erreur 500 venait souvent d'ici
    // Si vous voulez les rendre obligatoires, décommentez la ligne ci-dessous :
    // if (!req.files || req.files.length === 0) errors.push('Au moins une image est requise');

    if (errors.length > 0) {
      // Supprimer les fichiers uploadés si validation échoue
      req.files?.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
      console.warn('⚠️ Erreurs de validation:', errors);
      return res.status(400).json({ success: false, errors });
    }

    // ── Construire les images ────────────────
    const images = (req.files && req.files.length > 0)
      ? req.files.map((file, index) => ({
          url: `/uploads/products/${file.filename}`,
          publicId: file.filename,
          isMain: index === 0
        }))
      : []; // Tableau vide si pas d'images

    // ── Parser les données JSON en toute sécurité ──
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

    const parsedSizes  = safeParseArray(sizes);
    const parsedColors = safeParseArray(colors);
    const parsedTags   = safeParseArray(tags);

    console.log('📐 Tailles parsées:', parsedSizes);
    console.log('🎨 Couleurs parsées:', parsedColors);

    // ── Construire l'objet produit ───────────
    const productData = {
      name:          name.trim(),
      description:   description.trim(),
      price:         parseFloat(price),
      originalPrice: originalPrice && !isNaN(parseFloat(originalPrice)) ? parseFloat(originalPrice) : undefined,
      category:      category.trim(),
      gender:        gender || 'Unisexe',
      sizes:         parsedSizes,
      colors:        parsedColors,
      images,
      stock:         stockValue,
      material:      material ? material.trim() : '',
      brand:         brand ? brand.trim() : 'Fashion Store',
      sku:           sku && sku.trim() !== '' ? sku.trim() : undefined,
      tags:          parsedTags,
      featured:      featured === 'true' || featured === true,
      isActive:      true
    };

    console.log('📝 Données produit à créer:', JSON.stringify(productData, null, 2));

    // ── Créer le produit ─────────────────────
    const product = await Product.create(productData);

    console.log('✅ Produit créé avec succès, ID:', product._id);

    res.status(201).json({
      success: true,
      message: 'Produit créé avec succès !',
      product
    });

  } catch (error) {
    // Nettoyer les fichiers uploadés si erreur
    req.files?.forEach(f => {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    });

    // Log détaillé pour identifier la cause exacte du 500
    console.error('❌ Erreur création produit:');
    console.error('   Nom:', error.name);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      console.error('   Erreurs de validation Mongoose:', errors);
      return res.status(400).json({ success: false, errors });
    }

    if (error.code === 11000) {
      // Erreur de doublon (ex: SKU unique)
      const field = Object.keys(error.keyValue || {})[0] || 'champ';
      return res.status(400).json({
        success: false,
        errors: [`La valeur du champ "${field}" existe déjà.`]
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création du produit',
      error: error.message
    });
  }
});

// ─────────────────────────────────────────
// PUT /api/admin/products/:id - Modifier
// ─────────────────────────────────────────
router.put('/products/:id', upload.array('images', 5), async (req, res) => {
  try {
    console.log('✏️ Modification produit:', req.params.id);

    const product = await Product.findById(req.params.id);
    if (!product) {
      req.files?.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    // Si nouvelles images uploadées
    if (req.files && req.files.length > 0) {
      // Supprimer les anciennes images locales
      product.images.forEach(img => {
        const filePath = path.join(__dirname, '..', img.url);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) { console.warn('⚠️ Impossible de supprimer:', filePath); }
        }
      });

      req.body.images = req.files.map((file, index) => ({
        url: `/uploads/products/${file.filename}`,
        publicId: file.filename,
        isMain: index === 0
      }));
    }

    const updates = { ...req.body };

    if (updates.price) updates.price = parseFloat(updates.price);
    if (updates.stock !== undefined) updates.stock = parseInt(updates.stock);
    if (updates.originalPrice) updates.originalPrice = parseFloat(updates.originalPrice);
    if (updates.featured !== undefined) updates.featured = updates.featured === 'true' || updates.featured === true;

    if (updates.sizes && typeof updates.sizes === 'string') {
      try { updates.sizes = JSON.parse(updates.sizes); } catch { updates.sizes = [updates.sizes]; }
    }
    if (updates.colors && typeof updates.colors === 'string') {
      try { updates.colors = JSON.parse(updates.colors); } catch { updates.colors = [updates.colors]; }
    }
    if (updates.tags && typeof updates.tags === 'string') {
      try { updates.tags = JSON.parse(updates.tags); } catch { updates.tags = [updates.tags]; }
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    console.log('✅ Produit mis à jour:', req.params.id);
    res.json({ success: true, message: 'Produit mis à jour !', product: updated });

  } catch (error) {
    req.files?.forEach(f => {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    });
    console.error('❌ Erreur modification:', error.name, error.message);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, errors });
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// DELETE /api/admin/products/:id - Supprimer
// ─────────────────────────────────────────
router.delete('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    // Supprimer les images locales
    product.images.forEach(img => {
      const filePath = path.join(__dirname, '..', img.url);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.warn('⚠️ Impossible de supprimer:', filePath); }
      }
    });

    await product.deleteOne();
    console.log('✅ Produit supprimé:', req.params.id);

    res.json({ success: true, message: 'Produit supprimé avec succès' });

  } catch (error) {
    console.error('❌ Erreur suppression:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/admin/products - Liste tous les produits
// ─────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, sort = '-createdAt' } = req.query;

    let query = {};
    if (category) query.category = category;
    if (search) query.$text = { $search: search };

    const products = await Product.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      products,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('❌ Erreur liste produits:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/admin/stats - Statistiques
// ─────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [
      totalProducts,
      totalStock,
      outOfStock,
      featuredCount,
      categoryStats
    ] = await Promise.all([
      Product.countDocuments({ isActive: true }),
      Product.aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]),
      Product.countDocuments({ stock: 0, isActive: true }),
      Product.countDocuments({ featured: true }),
      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalProducts,
        totalStock: totalStock[0]?.total || 0,
        outOfStock,
        featuredCount,
        categoryStats
      }
    });
  } catch (error) {
    console.error('❌ Erreur stats:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
