import express from 'express';
import Order from '../models/Order.js';
import { authenticateUser } from '../middleware/auth.js';
import cacheService from '../services/cache.service.js';

const router = express.Router();

router.use(authenticateUser);

// ════════════════════════════════════════════════════════════════════════════
// GET /api/orders/my-orders
// ✅ DOIT rester AVANT /:id pour éviter le conflit de route
// ════════════════════════════════════════════════════════════════════════════
router.get('/my-orders', async (req, res) => {
  try {
    const userId   = req.user.userId;
    const cacheKey = `orders:user:${userId}`;

    // ── Tentative L1/L2 ────────────────────────────────────────────────────
    const cached = await cacheService.getByKey(cacheKey, 120);
    if (cached) {
      return res.status(200).json({
        success: true,
        count:   cached.length,
        orders:  cached,
        source:  'cache',
      });
    }

    // ── L3 : MongoDB ────────────────────────────────────────────────────────
    const orders = await Order.find({ userId })
      .populate('products.productId')
      .sort({ createdAt: -1 });

    await cacheService.setWithTTL(cacheKey, orders, 120);

    res.status(200).json({
      success: true,
      count:   orders.length,
      orders,
    });
  } catch (error) {
    console.error('❌ Erreur my-orders:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des commandes',
      error:   error.message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/orders
// ════════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const userId   = req.user.userId;
    const cacheKey = `orders:user:${userId}`;

    const cached = await cacheService.getByKey(cacheKey, 120);
    if (cached) {
      return res.status(200).json({
        success: true,
        count:   cached.length,
        orders:  cached,
        source:  'cache',
      });
    }

    const orders = await Order.find({ userId })
      .populate('products.productId')
      .sort({ createdAt: -1 });

    await cacheService.setWithTTL(cacheKey, orders, 120);

    res.status(200).json({
      success: true,
      count:   orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des commandes',
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/orders
// ✅ Invalide le cache commandes de l'utilisateur + notification "order_created"
// ════════════════════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { products, shippingAddress, totalAmount } = req.body;
    const userId = req.user.userId;

    if (!products || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun produit dans la commande',
      });
    }

    const order = await Order.create({
      userId,
      products,
      shippingAddress,
      totalAmount,
      status: 'pending',
    });

    // ✅ Invalide le cache commandes de cet utilisateur
    // + invalide le cache global commandes (admin)
    // → notification éviction "order_created" émise par invalidate()
    await cacheService.invalidate('order_created');
    // Invalide aussi la clé spécifique de l'utilisateur
    await cacheService.invalidateKey(`orders:user:${userId}`, 'order_created');

    res.status(201).json({
      success: true,
      message: 'Commande créée avec succès',
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la commande',
      error:   error.message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/orders/:id — DOIT rester après /my-orders
// ════════════════════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const userId   = req.user.userId;
    const orderId  = req.params.id;
    const cacheKey = `order:${orderId}`;

    const cached = await cacheService.getByKey(cacheKey, 120);
    if (cached) {
      return res.status(200).json({
        success: true,
        order:   cached,
        source:  'cache',
      });
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate('products.productId');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée',
      });
    }

    await cacheService.setWithTTL(cacheKey, order, 120);

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('❌ Erreur get order by id:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la commande',
      error:   error.message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/orders/:id/status — mise à jour du statut (admin ou système)
// ✅ Invalide le cache commandes + notification "order_updated"
// ════════════════════════════════════════════════════════════════════════════
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const orderId    = req.params.id;

    const order = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée',
      });
    }

    // ✅ Invalide la clé unitaire + le cache de la liste utilisateur
    await cacheService.invalidateKey(`order:${orderId}`, 'order_updated');
    await cacheService.invalidateKey(`orders:user:${order.userId}`, 'order_updated');
    await cacheService.invalidate('order_updated');

    res.status(200).json({
      success: true,
      message: 'Statut mis à jour',
      order,
    });
  } catch (error) {
    console.error('❌ Erreur update order status:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut',
      error:   error.message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/orders/:id/cancel — annulation par l'utilisateur
// ✅ Invalide le cache commandes + notification "order_updated"
// ════════════════════════════════════════════════════════════════════════════
router.put('/:id/cancel', async (req, res) => {
  try {
    const userId  = req.user.userId;
    const orderId = req.params.id;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée',
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Impossible d\'annuler cette commande (statut non pending)',
      });
    }

    order.status = 'cancelled';
    await order.save();

    // ✅ Invalide la clé unitaire + la liste utilisateur
    await cacheService.invalidateKey(`order:${orderId}`, 'order_updated');
    await cacheService.invalidateKey(`orders:user:${userId}`, 'order_updated');
    await cacheService.invalidate('order_updated');

    res.status(200).json({
      success: true,
      message: 'Commande annulée avec succès',
      order,
    });
  } catch (error) {
    console.error('❌ Erreur cancel order:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'annulation',
      error:   error.message,
    });
  }
});

export default router;
