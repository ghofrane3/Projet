import express from 'express';
import Stripe from 'stripe';
import Order from '../models/Order.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.use(authenticateUser);

// ── Étape 1 côté client : créer l'intention de paiement
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { products, shippingAddress, totalAmount } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({ success: false, message: 'Panier vide' });
    }

    // Créer le PaymentIntent chez Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Stripe travaille en centimes
      currency: 'eur',
      metadata: { userId: req.user.userId }
    });

    // Sauvegarder la commande en DB (statut pending)
    const order = await Order.create({
      userId: req.user.userId,
      products,
      shippingAddress,
      totalAmount,
      status: 'pending',
      paymentIntentId: paymentIntent.id
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      orderId: order._id
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Étape 2 côté client : confirmer après paiement réussi
router.post('/confirm/:orderId', async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.orderId, userId: req.user.userId },
      { status: 'processing', paymentStatus: 'paid' },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    res.json({ success: true, order });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
