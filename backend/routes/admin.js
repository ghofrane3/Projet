import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import User from '../models/User.js';
import Order from '../models/Order.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// MIDDLEWARE ADMIN
// ════════════════════════════════════════════════════════════

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Droits administrateur requis.'
    });
  }
  next();
};

// ════════════════════════════════════════════════════════════
// RÉCUPÉRER TOUS LES UTILISATEURS
// ════════════════════════════════════════════════════════════

router.get('/users', authenticateUser, isAdmin, async (req, res) => {
  try {
    console.log('📋 Récupération des utilisateurs...');

    const users = await User.find()
      .select('-password') // Ne pas renvoyer les mots de passe
      .sort({ createdAt: -1 }); // Trier par date de création (plus récents en premier)

    console.log(`✅ ${users.length} utilisateurs trouvés`);

    res.json({
      success: true,
      users: users,
      total: users.length
    });
  } catch (error) {
    console.error('❌ Erreur récupération utilisateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// ════════════════════════════════════════════════════════════
// RÉCUPÉRER UN UTILISATEUR PAR ID
// ════════════════════════════════════════════════════════════

router.get('/users/:userId', authenticateUser, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('❌ Erreur récupération utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ════════════════════════════════════════════════════════════
// METTRE À JOUR UN UTILISATEUR
// ════════════════════════════════════════════════════════════

router.put('/users/:userId', authenticateUser, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, role, isVerified } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable'
      });
    }

    // Mettre à jour les champs
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (typeof isVerified !== 'undefined') user.isVerified = isVerified;

    await user.save();

    res.json({
      success: true,
      message: 'Utilisateur mis à jour',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ════════════════════════════════════════════════════════════
// SUPPRIMER UN UTILISATEUR
// ════════════════════════════════════════════════════════════

router.delete('/users/:userId', authenticateUser, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ne pas permettre de supprimer son propre compte
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte'
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable'
      });
    }

    res.json({
      success: true,
      message: 'Utilisateur supprimé'
    });
  } catch (error) {
    console.error('❌ Erreur suppression utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ════════════════════════════════════════════════════════════
// STATISTIQUES ADMIN
// ════════════════════════════════════════════════════════════

router.get('/stats', authenticateUser, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find();
    const users = await User.find({ role: 'user' });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Stats du mois
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const lastMonthOrders = orders.filter(o => {
      const date = new Date(o.createdAt);
      return date >= lastMonth && date < thisMonth;
    });

    const thisMonthOrders = orders.filter(o => {
      const date = new Date(o.createdAt);
      return date >= thisMonth;
    });

    const lastMonthRevenue = lastMonthOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const thisMonthRevenue = thisMonthOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    const revenueChange = lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0;

    const ordersChange = lastMonthOrders.length > 0
      ? ((thisMonthOrders.length - lastMonthOrders.length) / lastMonthOrders.length) * 100
      : 0;

    res.json({
      success: true,
      stats: {
        totalRevenue: Math.round(totalRevenue),
        revenueChange: Math.round(revenueChange * 10) / 10,
        totalOrders,
        ordersChange: Math.round(ordersChange * 10) / 10,
        totalUsers: users.length,
        clientsChange: 0,
        averageBasket: Math.round(averageBasket),
        basketChange: 0
      }
    });
  } catch (error) {
    console.error('❌ Erreur stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

export default router;
