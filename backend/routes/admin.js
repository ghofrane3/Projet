
import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

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
// USERS
// ════════════════════════════════════════════════════════════

// GET ALL USERS
router.get('/users', authenticateUser, isAdmin, async (req, res) => {
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
router.get('/users/:userId', authenticateUser, isAdmin, async (req, res) => {
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
router.put('/users/:userId', authenticateUser, isAdmin, async (req, res) => {
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
router.delete('/users/:userId', authenticateUser, isAdmin, async (req, res) => {
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

// GET PRODUCT BY ID
router.get('/products/:id', authenticateUser, isAdmin, async (req, res) => {
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
// STATS
// ════════════════════════════════════════════════════════════

router.get('/stats', authenticateUser, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find();
    const users = await User.find({ role: 'user' });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);

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

router.get('/revenue/monthly', authenticateUser, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find();

    const monthly = {};

    orders.forEach(order => {
      const month = new Date(order.createdAt).toLocaleString('default', { month: 'short' });

      if (!monthly[month]) monthly[month] = 0;

      monthly[month] += order.totalAmount;
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
// DISTRIBUTION CLIENTS
// ════════════════════════════════════════════════════════════

router.get('/clients/distribution', authenticateUser, isAdmin, async (req, res) => {
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

export default router;
