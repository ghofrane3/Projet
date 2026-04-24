import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// MIDDLEWARE ADMIN
// ════════════════════════════════════════════════════════════

const authenticateAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Droits administrateur requis.'
    });
  }
  next();
};

// ════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════

// GET ALL USERS
router.get('/users', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET USER BY ID
router.get('/users/:userId', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// UPDATE USER
router.put('/users/:userId', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const { name, email, role, isVerified } = req.body;

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (typeof isVerified !== 'undefined') user.isVerified = isVerified;

    await user.save();

    res.json({ success: true, message: 'Utilisateur mis à jour', user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// DELETE USER
router.delete('/users/:userId', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte'
      });
    }

    const user = await User.findByIdAndDelete(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// PRODUITS
// ════════════════════════════════════════════════════════════

// 3. Produits en stock bas (version corrigée)
router.get('/products/low-stock', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 10;

    // Vérification sécurisée du champ stock
    const products = await Product.find({
      $and: [
        { stock: { $exists: true } },           // Le champ existe
        { stock: { $gte: 0 } },                 // stock >= 0
        { stock: { $lte: threshold } }          // stock <= threshold
      ]
    })
      .select('name stock category price')
      .sort({ stock: 1 })
      .lean();

    const outOfStock = await Product.countDocuments({
      stock: { $exists: true, $eq: 0 }
    });

    res.json({
      success: true,
      products,
      outOfStock,
      threshold
    });
  } catch (error) {
    console.error('❌ low-stock ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la récupération des produits en stock bas'
    });
  }
});



// GET PRODUCT BY ID
router.get('/products/:id', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produit introuvable'
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// STATS GÉNÉRALES
// ════════════════════════════════════════════════════════════

router.get('/stats', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const orders = await Order.find();
    const users = await User.find({ role: 'user' });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    res.json({
      success: true,
      stats: {
        totalRevenue,
        totalOrders,
        totalUsers: users.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// REVENUE MENSUEL
// ════════════════════════════════════════════════════════════

router.get('/revenue/monthly', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const orders = await Order.find();

    const monthly = {};

    orders.forEach(order => {
      const month = new Date(order.createdAt).toLocaleString('default', { month: 'short' });
      if (!monthly[month]) monthly[month] = 0;
      monthly[month] += order.totalAmount || 0;
    });

    res.json({
      success: true,
      data: monthly
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// DISTRIBUTION CLIENTS (ancienne version)
// ════════════════════════════════════════════════════════════

router.get('/clients/distribution', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const total = await User.countDocuments({ role: 'user' });
    const verified = await User.countDocuments({ role: 'user', isVerified: true });

    res.json({
      success: true,
      data: {
        verified,
        nonVerified: total - verified
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// NOUVEAUX ENDPOINTS ANALYTICS (2026)
// ════════════════════════════════════════════════════════════

// 1. Revenu par catégorie
router.get('/analytics/revenue-by-category', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'products',
          localField: 'products.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$product.category', 'Autre'] },
          revenue: {
            $sum: {
              $multiply: [
                { $ifNull: ['$product.price', 0] },
                { $ifNull: ['$products.quantity', 1] }
              ]
            }
          }
        }
      },
      { $project: { _id: 0, category: '$_id', revenue: 1 } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ revenue-by-category:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Top 10 produits les plus vendus
router.get('/analytics/top-products', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const data = await Product.find({ salesCount: { $gt: 0 } })
      .select('name salesCount category')
      .sort({ salesCount: -1 })
      .limit(10)
      .lean();

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ top-products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});



// 4. Valeur du stock par catégorie
router.get('/analytics/stock-by-category', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const data = await Product.aggregate([
      { $match: { stock: { $gt: 0 } } },
      {
        $group: {
          _id: { $ifNull: ['$category', 'Autre'] },
          value: { $sum: { $multiply: ['$stock', '$price'] } }
        }
      },
      { $project: { _id: 0, category: '$_id', value: { $round: ['$value', 0] } } },
      { $sort: { value: -1 } },
      { $limit: 10 }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ stock-by-category:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Top clients par dépense
router.get('/analytics/top-clients', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled'] } } },
      {
        $group: {
          _id: '$userId',
          totalSpent: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: { $ifNull: ['$user.name', 'Anonyme'] },
          email: { $ifNull: ['$user.email', '—'] },
          totalSpent: { $round: ['$totalSpent', 2] },
          orderCount: 1
        }
      }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ top-clients:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Tendance panier moyen (4 dernières semaines)
router.get('/analytics/basket-trend', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const data = await Order.aggregate([
      {
        $match: {
          status: { $nin: ['cancelled'] },
          createdAt: { $gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { week: { $week: '$createdAt' } },
          totalRevenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          period: { $concat: ['S', { $toString: '$_id.week' }] },
          average: {
            $round: [
              {
                $cond: [
                  { $gt: ['$orderCount', 0] },
                  { $divide: ['$totalRevenue', '$orderCount'] },
                  0
                ]
              },
              2
            ]
          }
        }
      },
      { $sort: { period: 1 } },
      { $limit: 8 }
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ basket-trend:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Entonnoir de conversion
router.get('/analytics/funnel', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const [viewsResult, totalOrders, validOrders] = await Promise.all([
      Product.aggregate([
        { $group: { _id: null, total: { $sum: { $ifNull: ['$viewCount', 0] } } } }
      ]),
      Order.countDocuments({}),
      Order.countDocuments({ status: { $nin: ['cancelled'] } })
    ]);

    const views = viewsResult[0]?.total || 0;
    const cart = Math.round(views * 0.6);        // Estimation à ajuster plus tard
    const checkout = totalOrders;
    const orders = validOrders;

    res.json({
      success: true,
      data: { views, cart, checkout, orders }
    });
  } catch (error) {
    console.error('❌ funnel:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. Distribution par genre des clients
router.get('/clients/distribution-gender', authenticateUser, authenticateAdmin, async (req, res) => {
  try {
    const total = await User.countDocuments({ role: { $ne: 'admin' } });
    if (total === 0) {
      return res.json({ success: true, distribution: { femme: 0, homme: 0, autres: 0 } });
    }

    const genderGroups = await User.aggregate([
      { $match: { role: { $ne: 'admin' } } },
      {
        $group: {
          _id: { $ifNull: [{ $toLower: '$gender' }, 'autre'] },
          count: { $sum: 1 }
        }
      }
    ]);

    let femme = 0, homme = 0, autres = 0;
    for (const g of genderGroups) {
      const pct = Math.round((g.count / total) * 100);
      if (['femme', 'female', 'f'].includes(g._id)) femme = pct;
      else if (['homme', 'male', 'h', 'm'].includes(g._id)) homme = pct;
      else autres += pct;
    }

    const sum = femme + homme + autres;
    if (sum !== 100 && sum > 0) autres += (100 - sum);

    res.json({ success: true, distribution: { femme, homme, autres } });
  } catch (error) {
    console.error('❌ clients/distribution-gender:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
