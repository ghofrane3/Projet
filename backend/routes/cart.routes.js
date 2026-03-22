import express from 'express';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// ROUTES PANIER (avec cookies pour la session)
// ════════════════════════════════════════════════════════════

/**
 * GET /api/cart
 * Récupérer le panier de l'utilisateur
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    // Le panier est stocké dans le cookie de session
    const cart = req.cookies.cart ? JSON.parse(req.cookies.cart) : [];

    res.json({
      success: true,
      cart: cart,
      total: calculateTotal(cart)
    });
  } catch (error) {
    console.error('Erreur récupération panier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

/**
 * POST /api/cart/add
 * Ajouter un produit au panier
 */
router.post('/add', authenticateUser, async (req, res) => {
  try {
    const { productId, name, price, quantity, image, size, color } = req.body;

    // Validation
    if (!productId || !name || !price || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Données manquantes'
      });
    }

    // Récupérer le panier actuel
    let cart = req.cookies.cart ? JSON.parse(req.cookies.cart) : [];

    // Vérifier si le produit existe déjà
    const existingItemIndex = cart.findIndex(
      item => item.productId === productId &&
              item.size === size &&
              item.color === color
    );

    if (existingItemIndex > -1) {
      // Augmenter la quantité
      cart[existingItemIndex].quantity += quantity;
    } else {
      // Ajouter nouveau produit
      cart.push({
        productId,
        name,
        price,
        quantity,
        image,
        size,
        color
      });
    }

    // Sauvegarder dans un cookie
    res.cookie('cart', JSON.stringify(cart), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
    });

    res.json({
      success: true,
      message: 'Produit ajouté au panier',
      cart: cart,
      total: calculateTotal(cart)
    });
  } catch (error) {
    console.error('Erreur ajout au panier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

/**
 * PUT /api/cart/update/:productId
 * Mettre à jour la quantité
 */
router.put('/update/:productId', authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantité invalide'
      });
    }

    let cart = req.cookies.cart ? JSON.parse(req.cookies.cart) : [];

    // Trouver l'item
    const item = cart.find(i => i.productId === productId);

    if (item) {
      item.quantity = quantity;

      // Sauvegarder
      res.cookie('cart', JSON.stringify(cart), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Quantité mise à jour',
        cart: cart,
        total: calculateTotal(cart)
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Produit non trouvé dans le panier'
      });
    }
  } catch (error) {
    console.error('Erreur mise à jour panier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

/**
 * DELETE /api/cart/:productId
 * Supprimer un produit du panier
 */
router.delete('/:productId', authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;

    let cart = req.cookies.cart ? JSON.parse(req.cookies.cart) : [];

    // Filtrer pour retirer le produit
    cart = cart.filter(item => item.productId !== productId);

    // Sauvegarder
    res.cookie('cart', JSON.stringify(cart), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Produit retiré du panier',
      cart: cart,
      total: calculateTotal(cart)
    });
  } catch (error) {
    console.error('Erreur suppression panier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

/**
 * DELETE /api/cart
 * Vider le panier
 */
router.delete('/', authenticateUser, async (req, res) => {
  try {
    // Supprimer le cookie
    res.clearCookie('cart');

    res.json({
      success: true,
      message: 'Panier vidé',
      cart: [],
      total: 0
    });
  } catch (error) {
    console.error('Erreur vidage panier:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ════════════════════════════════════════════════════════════
// UTILITAIRES
// ════════════════════════════════════════════════════════════

function calculateTotal(cart) {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

export default router;
