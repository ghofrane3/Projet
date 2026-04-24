// backend/routes/order.routes.js
import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { authenticateUser } from '../middleware/auth.js';
import cacheService from '../services/cache.service.js';
import Product from '../models/Product.js';
import emailService from '../services/email.service.js';

const router = express.Router();

router.use(authenticateUser);

// ════════════════════════════════════════════════════════════════════════════
// Helper : récupère l'utilisateur complet depuis MongoDB
// req.user ne contient que { userId, role } extrait du JWT — pas l'email
// ════════════════════════════════════════════════════════════════════════════
const getFullUser = async (userId) => {
  return User.findById(userId).select('email name firstName lastName').lean();
};

// ════════════════════════════════════════════════════════════════════════════
// GET /api/orders/admin/all  —  TOUTES les commandes (admin uniquement)
// ⚠️ DOIT rester AVANT /my-orders et /:id
// ════════════════════════════════════════════════════════════════════════════
router.get('/admin/all', async (req, res) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès refusé - Admin requis' });
    }

    const cacheKey = 'orders:admin:all';

    const cached = await cacheService.getByKey(cacheKey, 60);
    if (cached) {
      console.log(`✅ [Cache HIT] Admin orders (${cached.length} commandes)`);
      return res.status(200).json({
        success: true,
        count: cached.length,
        orders: cached,
        source: 'cache'
      });
    }

    console.log('⏳ [Cache MISS] Récupération de toutes les commandes...');

    // Récupérer TOUTES les commandes de TOUS les utilisateurs
    const orders = await Order.find({})
      .populate('products.productId', 'name price images stock')
      .populate('userId', 'email name firstName lastName')
      .sort({ createdAt: -1 });

    await cacheService.setWithTTL(cacheKey, orders, 60);

    console.log(`✅ ${orders.length} commandes récupérées (admin)`);
    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Erreur admin all orders:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération commandes admin',
      error: error.message
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/orders/my-orders  —  DOIT rester AVANT /:id
// ════════════════════════════════════════════════════════════════════════════
router.get('/my-orders', async (req, res) => {
  try {
    const userId   = req.user.userId;
    const cacheKey = `orders:user:${userId}`;

    const cached = await cacheService.getByKey(cacheKey, 120);
    if (cached) {
      return res.status(200).json({ success: true, count: cached.length, orders: cached, source: 'cache' });
    }

    const orders = await Order.find({ userId })
      .populate('products.productId')
      .sort({ createdAt: -1 });

    await cacheService.setWithTTL(cacheKey, orders, 120);
    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Erreur my-orders:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des commandes', error: error.message });
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
      return res.status(200).json({ success: true, count: cached.length, orders: cached, source: 'cache' });
    }

    const orders = await Order.find({ userId })
      .populate('products.productId')
      .sort({ createdAt: -1 });

    await cacheService.setWithTTL(cacheKey, orders, 120);
    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des commandes' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/orders
// ════════════════════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { products, shippingAddress, totalAmount } = req.body;
    const userId = req.user.userId;

    if (!products || products.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun produit dans la commande' });
    }

    // ── Vérification stock ──────────────────────────────────────────────────
    for (const item of products) {
      const productId = item.productId || item._id;
      const quantity  = item.quantity  || 1;
      const product   = await Product.findById(productId).select('name stock');

      if (!product) {
        return res.status(404).json({ success: false, message: `Produit introuvable : ${productId}` });
      }
      if (product.stock !== undefined && product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Stock insuffisant pour "${product.name}" : ${product.stock} unité(s) disponible(s), ${quantity} demandée(s)`,
        });
      }
    }

    // ── Création commande ───────────────────────────────────────────────────
    const order = await Order.create({ userId, products, shippingAddress, totalAmount, status: 'pending' });

    // ── Décrémentation stock ────────────────────────────────────────────────
    for (const item of products) {
      const productId = item.productId || item._id;
      const quantity  = item.quantity  || 1;
      await Product.updateOne({ _id: productId }, { $inc: { stock: -quantity } });
      await cacheService.invalidateKey(`product-detail:id:${productId}`, 'stock_updated');
    }

    // ── Email de confirmation ───────────────────────────────────────────────
    try {
      const fullUser = await getFullUser(userId);
      if (fullUser) {
        const populatedOrder = await Order.findById(order._id)
          .populate('products.productId', 'name price images');
        await emailService.sendOrderConfirmation(fullUser, populatedOrder);
        console.log(`📧 Email confirmation envoyé à : ${fullUser.email}`);
      } else {
        console.warn('⚠️  Utilisateur introuvable pour email confirmation — commande quand même créée');
      }
    } catch (emailErr) {
      console.error('⚠️  Email confirmation non envoyé (non bloquant):', emailErr.message);
    }

    // ── Invalidation cache ──────────────────────────────────────────────────
    await cacheService.invalidateKey(`orders:user:${userId}`, 'order_created');
    await cacheService.invalidateKey('orders:admin:all', 'order_created'); // ✅ Cache admin

    res.status(201).json({ success: true, message: 'Commande créée avec succès', order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la création de la commande', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/orders/:id  —  DOIT rester après /my-orders et /admin/all
// ════════════════════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const userId   = req.user.userId;
    const orderId  = req.params.id;
    const cacheKey = `order:${orderId}`;

    const cached = await cacheService.getByKey(cacheKey, 120);
    if (cached) {
      return res.status(200).json({ success: true, order: cached, source: 'cache' });
    }

    const order = await Order.findOne({ _id: orderId, userId }).populate('products.productId');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    await cacheService.setWithTTL(cacheKey, order, 120);
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('❌ Erreur get order by id:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération de la commande', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/orders/:id/status  —  changement de statut (admin / système)
// ════════════════════════════════════════════════════════════════════════════
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const orderId    = req.params.id;

    const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true })
      .populate('products.productId', 'name price images');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    // ── Email selon statut ──────────────────────────────────────────────────
    try {
      const fullUser = await getFullUser(order.userId);
      if (fullUser) {
        switch (status) {
          case 'processing':
            await emailService.sendOrderStatusUpdate(fullUser, order, 'processing');
            break;
          case 'shipped':
            await emailService.sendOrderShipped(fullUser, order);
            break;
          case 'delivered':
            await emailService.sendOrderDelivered(fullUser, order);
            break;
          case 'cancelled':
            await emailService.sendOrderCancelled(fullUser, order);
            break;
          default:
            break;
        }
        console.log(`📧 Email statut "${status}" envoyé à : ${fullUser.email}`);
      }
    } catch (emailErr) {
      console.error('⚠️  Email statut non envoyé (non bloquant):', emailErr.message);
    }

    // ── Invalidation cache ──────────────────────────────────────────────────
    await cacheService.invalidateKey(`order:${orderId}`, 'order_updated');
    await cacheService.invalidateKey(`orders:user:${order.userId}`, 'order_updated');
    await cacheService.invalidateKey('orders:admin:all', 'order_updated'); // ✅ Cache admin

    res.status(200).json({ success: true, message: 'Statut mis à jour', order });
  } catch (error) {
    console.error('❌ Erreur update order status:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du statut', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/orders/:id/cancel  —  annulation par l'utilisateur
// ════════════════════════════════════════════════════════════════════════════
router.put('/:id/cancel', async (req, res) => {
  try {
    const userId  = req.user.userId;
    const orderId = req.params.id;

    const order = await Order.findOne({ _id: orderId, userId })
      .populate('products.productId', 'name price images');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Impossible d'annuler cette commande (statut non pending)" });
    }

    order.status = 'cancelled';
    await order.save();

    // ── Réintégration stock ─────────────────────────────────────────────────
    for (const item of order.products) {
      const productId = item.productId?._id || item.productId;
      const quantity  = item.quantity || 1;
      await Product.updateOne({ _id: productId }, { $inc: { stock: quantity } });
      await cacheService.invalidateKey(`product-detail:id:${productId}`, 'stock_restored');
    }

    // ── Email d'annulation ──────────────────────────────────────────────────
    try {
      const fullUser = await getFullUser(userId);
      if (fullUser) {
        await emailService.sendOrderCancelled(fullUser, order);
        console.log(`📧 Email annulation envoyé à : ${fullUser.email}`);
      }
    } catch (emailErr) {
      console.error('⚠️  Email annulation non envoyé (non bloquant):', emailErr.message);
    }

    // ── Invalidation cache ──────────────────────────────────────────────────
    await cacheService.invalidateKey(`order:${orderId}`, 'order_updated');
    await cacheService.invalidateKey(`orders:user:${userId}`, 'order_updated');
    await cacheService.invalidateKey('orders:admin:all', 'order_updated'); // ✅ Cache admin

    res.status(200).json({ success: true, message: 'Commande annulée avec succès', order });
  } catch (error) {
    console.error('❌ Erreur cancel order:', error);
    res.status(500).json({ success: false, message: "Erreur lors de l'annulation", error: error.message });
  }
});

export default router;
