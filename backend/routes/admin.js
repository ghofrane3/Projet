import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import Order from '../models/Order.js';
import User from '../models/User.js';

const router = express.Router();

// Middleware pour vérifier que l'utilisateur est admin
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
// STATISTIQUES PRINCIPALES
// ════════════════════════════════════════════════════════════

router.get('/stats', authenticateUser, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find();
    const users = await User.find({ role: 'user' });

    // Calcul des stats
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Stats du mois précédent pour calculer les changements
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
        clientsChange: 0, // À calculer si besoin
        averageBasket: Math.round(averageBasket),
        basketChange: 0 // À calculer si besoin
      }
    });
  } catch (error) {
    console.error('Erreur stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ════════════════════════════════════════════════════════════
// REVENU MENSUEL (12 derniers mois)
// ════════════════════════════════════════════════════════════

router.get('/revenue/monthly', authenticateUser, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find();

    const now = new Date();
    const monthlyData = [];

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthOrders = orders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= monthStart && orderDate <= monthEnd;
      });

      const revenue = monthOrders.reduce((sum, o) => sum + o.totalAmount, 0);

      monthlyData.push({
        month: monthStart.getMonth() + 1,
        revenue: Math.round(revenue)
      });
    }

    res.json({
      success: true,
      data: monthlyData
    });
  } catch (error) {
    console.error('Erreur revenu mensuel:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ════════════════════════════════════════════════════════════
// DISTRIBUTION CLIENTS
// ════════════════════════════════════════════════════════════

router.get('/clients/distribution', authenticateUser, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' });

    // Si vous avez un champ gender dans votre modèle User
    const distribution = {
      femme: users.filter(u => u.gender === 'femme').length,
      homme: users.filter(u => u.gender === 'homme').length,
      autres: users.filter(u => !u.gender || (u.gender !== 'femme' && u.gender !== 'homme')).length
    };

    res.json({
      success: true,
      distribution
    });
  } catch (error) {
    console.error('Erreur distribution clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

export default router;
