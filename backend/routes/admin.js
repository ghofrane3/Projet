import express from 'express';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';  // ✅ AJOUT OBLIGATOIRE - C'ÉTAIT LE PROBLÈME !
import { authenticateUser, authorizeAdmin } from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes nécessitent authentification + rôle admin
router.use(authenticateUser);
router.use(authorizeAdmin);

// ═══════════════════════════════════════════════════════════
// GESTION DES UTILISATEURS
// ═══════════════════════════════════════════════════════════

// GET /api/admin/users - Liste tous les utilisateurs
router.get('/users', async (req, res) => {
  try {
    console.log('📋 Récupération des utilisateurs...');

    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    console.log(`✅ ${users.length} utilisateurs trouvés`);

    res.json({
      success: true,
      users,
      total: users.length
    });
  } catch (error) {
    console.error('❌ Erreur récupération users:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/admin/users/:id/verify - Vérifier manuellement un utilisateur
router.patch('/users/:id/verify', async (req, res) => {
  try {
    console.log('✅ Vérification utilisateur:', req.params.id);

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Cet utilisateur est déjà vérifié'
      });
    }

    // Vérifier le compte
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    console.log('✅ Utilisateur vérifié manuellement par admin:', user.email);

    res.json({
      success: true,
      message: 'Utilisateur vérifié avec succès',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('❌ Erreur vérification admin:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/admin/users/:id/role - Changer le rôle d'un utilisateur
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;

    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rôle invalide'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    console.log('✅ Rôle changé:', user.email, '→', role);

    res.json({
      success: true,
      message: 'Rôle mis à jour',
      user
    });
  } catch (error) {
    console.error('❌ Erreur changement rôle:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/users/:id - Supprimer un utilisateur
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    console.log('✅ Utilisateur supprimé:', user.email);

    res.json({
      success: true,
      message: 'Utilisateur supprimé'
    });
  } catch (error) {
    console.error('❌ Erreur suppression:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// GESTION DES PRODUITS
// ============================================

// POST /api/admin/products - Créer un produit
router.post('/products', async (req, res) => {
  try {
    console.log('📦 Admin - Création de produit');
    console.log('📋 Body:', req.body);

    const { name, description, price, category, stock, images } = req.body;

    // Validation
    if (!name || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Nom, description, prix et catégorie sont requis'
      });
    }

    const product = await Product.create({
      name,
      description,
      price,
      category,
      stock: stock || 0,
      images: images || []
    });

    console.log('✅ Produit créé:', product._id);

    res.status(201).json({
      success: true,
      message: 'Produit créé avec succès',
      product
    });
  } catch (error) {
    console.error('❌ Erreur création produit:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du produit',
      error: error.message
    });
  }
});

// PUT /api/admin/products/:id - Mettre à jour un produit
router.put('/products/:id', async (req, res) => {
  try {
    console.log('✏️ Admin - Mise à jour produit:', req.params.id);
    console.log('📋 Body:', req.body);

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

    console.log('✅ Produit mis à jour:', product._id);

    res.status(200).json({
      success: true,
      message: 'Produit mis à jour avec succès',
      product
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour produit:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du produit',
      error: error.message
    });
  }
});

// DELETE /api/admin/products/:id - Supprimer un produit
router.delete('/products/:id', async (req, res) => {
  try {
    console.log('🗑️ Admin - Suppression produit:', req.params.id);

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produit non trouvé'
      });
    }

    console.log('✅ Produit supprimé:', product._id);

    res.status(200).json({
      success: true,
      message: 'Produit supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression produit:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du produit',
      error: error.message
    });
  }
});

// ============================================
// GESTION DES COMMANDES
// ============================================

// GET /api/admin/orders - Récupérer toutes les commandes
router.get('/orders', async (req, res) => {
  try {
    console.log('📋 Admin - Récupération de toutes les commandes');

    const orders = await Order.find()
      .populate('userId', 'name email')
      .populate('products.productId')
      .sort({ createdAt: -1 });

    console.log(`✅ ${orders.length} commandes récupérées`);

    res.status(200).json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('❌ Erreur récupération commandes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des commandes',
      error: error.message
    });
  }
});

// GET /api/admin/orders/:id - Récupérer une commande spécifique
router.get('/orders/:id', async (req, res) => {
  try {
    console.log('📋 Admin - Récupération commande:', req.params.id);

    const order = await Order.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('products.productId');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée'
      });
    }

    res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error('❌ Erreur récupération commande:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la commande',
      error: error.message
    });
  }
});

// PATCH /api/admin/orders/:id/status - Mettre à jour le statut d'une commande
router.patch('/orders/:id/status', async (req, res) => {
  try {
    console.log('📦 Admin - Mise à jour statut commande:', req.params.id);
    console.log('📋 Nouveau statut:', req.body.status);

    const { status } = req.body;

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Statut invalide. Valeurs autorisées: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('products.productId');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée'
      });
    }

    console.log('✅ Statut mis à jour:', status);

    res.status(200).json({
      success: true,
      message: 'Statut de la commande mis à jour',
      order
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut',
      error: error.message
    });
  }
});

// GET /api/admin/stats - Statistiques générales
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Admin - Récupération des statistiques');

    const [totalOrders, totalProducts, totalUsers, pendingOrders, totalRevenue] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments(),
      User.countDocuments(),  // ✅ Fonctionne maintenant avec l'import User
      Order.countDocuments({ status: 'pending' }),
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    const stats = {
      totalOrders,
      totalProducts,
      totalUsers,  // ✅ Ajouté
      pendingOrders,
      totalRevenue: totalRevenue[0]?.total || 0
    };

    console.log('✅ Statistiques:', stats);

    res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Erreur récupération stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

export default router;
