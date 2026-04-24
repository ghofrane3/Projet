// backend/routes/payment.js
import express from 'express';
import Stripe from 'stripe';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { authenticateUser } from '../middleware/auth.js';
import emailService from '../services/email.service.js';
import cacheService from '../services/cache.service.js';

const router = express.Router();
const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY);

// ════════════════════════════════════════════════════════════════════════════
// POST /api/payments/webhook
// ⚠️  Le body arrive déjà en Buffer RAW (géré dans server.js avant express.json)
//     Ne PAS remettre express.raw() ici — il serait ignoré de toute façon
// ════════════════════════════════════════════════════════════════════════════
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                              // Buffer brut grâce au middleware de server.js
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature invalide :', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`🔄 Webhook reçu : ${event.type}`);

  try {
// ── Paiement réussi ──────────────────────────────────────────────────
if (event.type === 'payment_intent.succeeded') {
  const pi = event.data.object;
  console.log(`💰 Paiement réussi — PaymentIntent : ${pi.id}`);

  const order = await Order.findOneAndUpdate(
    { paymentIntentId: pi.id },
    { status: 'processing', paymentStatus: 'paid' },
    { new: true }
  ).populate('products.productId', 'name price images stock');

  if (!order) {
    console.warn('⚠️ Commande introuvable pour PaymentIntent :', pi.id);
    return res.json({ received: true });
  }

  console.log(`✅ Commande mise à jour : ${order._id}`);

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 CORRECTION : Décrémentation du stock pour chaque produit
  // ═══════════════════════════════════════════════════════════════════
  try {
    const Product = (await import('../models/Product.js')).default;

    for (const item of order.products) {
      const productId = item.productId?._id || item.productId;
      const quantity = item.quantity || 1;

      // Décrémenter le stock
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        { $inc: { stock: -quantity } },
        { new: true }
      );

      if (updatedProduct) {
        console.log(`📦 Stock mis à jour pour ${updatedProduct.name} : ${updatedProduct.stock} restant(s)`);

        // Invalider le cache du produit
        await cacheService.invalidateKey(`product-detail:id:${productId}`, 'stock_updated');
      }
    }
  } catch (stockErr) {
    console.error('❌ Erreur décrémentation stock :', stockErr.message);
    // Ne pas bloquer le webhook même si erreur stock
  }

  // Invalidation cache
  try {
    await cacheService.invalidateKey(`order:${order._id}`, 'payment_succeeded');
    await cacheService.invalidateKey(`orders:user:${order.userId}`, 'payment_succeeded');
    await cacheService.invalidate('order_updated');
  } catch (cacheErr) {
    console.warn('⚠️ Cache (non bloquant) :', cacheErr.message);
  }

  // Email de confirmation
  try {
    const user = await User.findById(order.userId).select('email firstName lastName name');
    if (user) {
      await emailService.sendOrderConfirmation(user, order);
      console.log(`📧 Email confirmation → ${user.email}`);
    }
  } catch (emailErr) {
    console.warn('⚠️ Email (non bloquant) :', emailErr.message);
  }
}

    // ── Paiement échoué ──────────────────────────────────────────────────
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      console.warn(`❌ Paiement échoué — PaymentIntent : ${pi.id}`);
      await Order.findOneAndUpdate(
        { paymentIntentId: pi.id },
        { status: 'cancelled', paymentStatus: 'failed' }
      );
    }

  } catch (err) {
    console.error('❌ Erreur webhook handler :', err.message);
  }

  res.json({ received: true });
});

// ════════════════════════════════════════════════════════════════════════════
// Authentification requise pour les routes suivantes
// ════════════════════════════════════════════════════════════════════════════
router.use(authenticateUser);

// ════════════════════════════════════════════════════════════════════════════
// POST /api/payments/create-payment-intent
// ════════════════════════════════════════════════════════════════════════════
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { products, shippingAddress, totalAmount } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({ success: false, message: 'Panier vide' });
    }
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Montant invalide' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(totalAmount * 100),
      currency: 'eur',
      metadata: { userId: req.user.userId },
      automatic_payment_methods: { enabled: true },
    });

    const order = await Order.create({
      userId:          req.user.userId,
      products,
      shippingAddress,
      totalAmount,
      status:          'pending',
      paymentStatus:   'pending',
      paymentIntentId: paymentIntent.id,
    });

    console.log(`🛒 Commande créée : ${order._id} | PI : ${paymentIntent.id}`);

    res.status(201).json({
      success:      true,
      clientSecret: paymentIntent.client_secret,
      orderId:      order._id,
    });

  } catch (error) {
    console.error('❌ create-payment-intent :', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/payments/order/:orderId
// ════════════════════════════════════════════════════════════════════════════
router.get('/order/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({
      _id:    req.params.orderId,
      userId: req.user.userId,
    }).populate('products.productId', 'name price images');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande introuvable' });
    }
    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
