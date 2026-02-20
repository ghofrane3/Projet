import express from 'express';
import Order from '../models/Order.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateUser);

// GET /api/orders - Récupérer les commandes de l'utilisateur
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.userId })
      .populate('products.productId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des commandes'
    });
  }
});

// POST /api/orders - Créer une commande
router.post('/', async (req, res) => {
  try {
    const { products, shippingAddress, totalAmount } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun produit dans la commande'
      });
    }

    const order = await Order.create({
      userId: req.user.userId,
      products,
      shippingAddress,
      totalAmount,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Commande créée avec succès',
      order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la commande',
      error: error.message
    });
  }
});

// GET /api/orders/:id - Récupérer une commande spécifique
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      userId: req.user.userId
    }).populate('products.productId');

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
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la commande'
    });
  }
});

export default router;
