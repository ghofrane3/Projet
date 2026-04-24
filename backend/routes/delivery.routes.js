// backend/routes/delivery.routes.js
import express from 'express';
import Order   from '../models/Order.js';
import User    from '../models/User.js';
import { authenticateUser, authorizeAdmin } from '../middleware/auth.js';
import cacheService from '../services/cache.service.js';
import emailService from '../services/email.service.js';

const router = express.Router();

// Toutes les routes livraison nécessitent admin
router.use(authenticateUser, authorizeAdmin);

// ════════════════════════════════════════════════════════
// GET /api/delivery
// Liste toutes les commandes avec leur état de livraison
// ════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const skip   = (parseInt(page) - 1) * parseInt(limit);
    const total  = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('userId',              'name email firstName lastName')
      .populate('products.productId',  'name images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      total,
      page:    parseInt(page),
      pages:   Math.ceil(total / parseInt(limit)),
      orders
    });
  } catch (err) {
    console.error('❌ GET /delivery:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════
// GET /api/delivery/stats
// Compteurs par statut pour le tableau de bord
// ════════════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const [pending, processing, shipped, delivered, cancelled] = await Promise.all([
      Order.countDocuments({ status: 'pending'    }),
      Order.countDocuments({ status: 'processing' }),
      Order.countDocuments({ status: 'shipped'    }),
      Order.countDocuments({ status: 'delivered'  }),
      Order.countDocuments({ status: 'cancelled'  }),
    ]);

    const total = pending + processing + shipped + delivered + cancelled;

    res.status(200).json({
      success: true,
      stats: { total, pending, processing, shipped, delivered, cancelled }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════
// GET /api/delivery/:orderId
// Détail d'une commande avec historique livraison
// ════════════════════════════════════════════════════════
router.get('/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('userId',             'name email firstName lastName phone')
      .populate('products.productId', 'name images price')
      .lean();

    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    res.status(200).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════
// PUT /api/delivery/:orderId/assign
// Assigner un transporteur + numéro de suivi
// ════════════════════════════════════════════════════════
router.put('/:orderId/assign', async (req, res) => {
  try {
    const { carrier, trackingNumber, estimatedDate, notes } = req.body;

    if (!carrier || !trackingNumber) {
      return res.status(400).json({ success: false, message: 'Transporteur et numéro de suivi requis' });
    }

    const historyEntry = {
      status:    'assigned',
      message:   `Livraison confiée à ${carrier} — Suivi : ${trackingNumber}`,
      location:  'Entrepôt',
      timestamp: new Date()
    };

    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      {
        $set: {
          'delivery.carrier':        carrier,
          'delivery.trackingNumber': trackingNumber,
          'delivery.estimatedDate':  estimatedDate ? new Date(estimatedDate) : undefined,
          'delivery.notes':          notes || '',
        },
        $push: { 'delivery.history': historyEntry }
      },
      { new: true }
    ).populate('userId', 'email name firstName lastName')
     .populate('products.productId', 'name price images');

    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    // Invalidation cache
    await cacheService.invalidateKey(`order:${order._id}`, 'delivery_assigned');
    await cacheService.invalidateKey(`orders:user:${order.userId._id}`, 'delivery_assigned');

    res.status(200).json({ success: true, message: 'Transporteur assigné', order });
  } catch (err) {
    console.error('❌ PUT /delivery/assign:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════
// PUT /api/delivery/:orderId/ship
// Marquer comme expédiée (shipped) + email client
// ════════════════════════════════════════════════════════
router.put('/:orderId/ship', async (req, res) => {
  try {
    const { location = 'Dépôt principal', message = 'Colis pris en charge par le transporteur' } = req.body;

    const historyEntry = {
      status:    'shipped',
      message,
      location,
      timestamp: new Date()
    };

    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      {
        $set: {
          status:               'shipped',
          'delivery.shippedAt': new Date()
        },
        $push: { 'delivery.history': historyEntry }
      },
      { new: true }
    ).populate('userId', 'email name firstName lastName')
     .populate('products.productId', 'name price images');

    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    // Email client
    try {
      if (order.userId?.email) {
        await emailService.sendOrderShipped(order.userId, order);
        console.log(`📧 Email expédition → ${order.userId.email}`);
      }
    } catch (emailErr) {
      console.warn('⚠️ Email expédition non envoyé :', emailErr.message);
    }

    // Invalidation cache
    await cacheService.invalidateKey(`order:${order._id}`, 'order_shipped');
    await cacheService.invalidateKey(`orders:user:${order.userId._id}`, 'order_shipped');
    await cacheService.invalidate('order_updated');

    res.status(200).json({ success: true, message: 'Commande marquée expédiée', order });
  } catch (err) {
    console.error('❌ PUT /delivery/ship:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════
// PUT /api/delivery/:orderId/deliver
// Marquer comme livrée (delivered) + email client
// ════════════════════════════════════════════════════════
router.put('/:orderId/deliver', async (req, res) => {
  try {
    const { location = 'Adresse client', message = 'Colis livré avec succès' } = req.body;

    const historyEntry = {
      status:    'delivered',
      message,
      location,
      timestamp: new Date()
    };

    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      {
        $set: {
          status:                  'delivered',
          'delivery.deliveredAt':  new Date()
        },
        $push: { 'delivery.history': historyEntry }
      },
      { new: true }
    ).populate('userId', 'email name firstName lastName')
     .populate('products.productId', 'name price images');

    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    // Email client
    try {
      if (order.userId?.email) {
        await emailService.sendOrderDelivered(order.userId, order);
        console.log(`📧 Email livraison → ${order.userId.email}`);
      }
    } catch (emailErr) {
      console.warn('⚠️ Email livraison non envoyé :', emailErr.message);
    }

    // Invalidation cache
    await cacheService.invalidateKey(`order:${order._id}`, 'order_delivered');
    await cacheService.invalidateKey(`orders:user:${order.userId._id}`, 'order_delivered');
    await cacheService.invalidate('order_updated');

    res.status(200).json({ success: true, message: 'Commande marquée livrée', order });
  } catch (err) {
    console.error('❌ PUT /delivery/deliver:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════
// POST /api/delivery/:orderId/history
// Ajouter une étape dans le suivi de livraison
// ════════════════════════════════════════════════════════
router.post('/:orderId/history', async (req, res) => {
  try {
    const { status, message, location } = req.body;

    if (!status || !message) {
      return res.status(400).json({ success: false, message: 'status et message requis' });
    }

    const historyEntry = { status, message, location: location || '', timestamp: new Date() };

    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { $push: { 'delivery.history': historyEntry } },
      { new: true }
    ).lean();

    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    await cacheService.invalidateKey(`order:${order._id}`, 'delivery_updated');

    res.status(200).json({ success: true, message: 'Étape ajoutée', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
