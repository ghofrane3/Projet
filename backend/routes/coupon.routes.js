// backend/routes/coupon.routes.js
const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Valider un coupon (accessible à tous les utilisateurs authentifiés)
router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const { code, orderAmount } = req.body;

    if (!code) {
      return res.status(400).json({
        valid: false,
        message: 'Code promo requis'
      });
    }

    if (!orderAmount || orderAmount <= 0) {
      return res.status(400).json({
        valid: false,
        message: 'Montant de commande invalide'
      });
    }

    // Rechercher le coupon
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true
    });

    if (!coupon) {
      return res.status(404).json({
        valid: false,
        message: 'Code promo invalide'
      });
    }

    // Vérifier la date d'expiration
    if (new Date() > coupon.expiresAt) {
      return res.status(400).json({
        valid: false,
        message: 'Ce code promo a expiré'
      });
    }

    // Vérifier le nombre maximum d'utilisations
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({
        valid: false,
        message: 'Ce code promo a atteint sa limite d\'utilisation'
      });
    }

    // Vérifier le montant minimum de commande
    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({
        valid: false,
        message: `Montant minimum de ${coupon.minOrderAmount} TND requis pour ce code promo`
      });
    }

    // Calculer la réduction
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = (orderAmount * coupon.value) / 100;
    } else {
      discountAmount = coupon.value;
    }

    // S'assurer que la réduction ne dépasse pas le montant total
    if (discountAmount > orderAmount) {
      discountAmount = orderAmount;
    }

    res.json({
      valid: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discountAmount: discountAmount.toFixed(2)
      },
      message: 'Code promo valide'
    });

  } catch (error) {
    console.error('Erreur validation coupon:', error);
    res.status(500).json({
      valid: false,
      message: 'Erreur lors de la validation du code promo'
    });
  }
});

// Créer un coupon (admin seulement)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { code, type, value, minOrderAmount, maxUses, expiresAt } = req.body;

    // Validation
    if (!code || !type || !value || !expiresAt) {
      return res.status(400).json({
        message: 'Tous les champs obligatoires doivent être remplis'
      });
    }

    if (!['percentage', 'fixed'].includes(type)) {
      return res.status(400).json({
        message: 'Type invalide. Utilisez "percentage" ou "fixed"'
      });
    }

    if (type === 'percentage' && (value < 0 || value > 100)) {
      return res.status(400).json({
        message: 'Le pourcentage doit être entre 0 et 100'
      });
    }

    // Vérifier si le code existe déjà
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({
        message: 'Ce code promo existe déjà'
      });
    }

    const coupon = new Coupon({
      code: code.toUpperCase(),
      type,
      value,
      minOrderAmount: minOrderAmount || 0,
      maxUses: maxUses || null,
      expiresAt: new Date(expiresAt),
      createdBy: req.user.userId
    });

    await coupon.save();

    res.status(201).json({
      message: 'Coupon créé avec succès',
      coupon
    });

  } catch (error) {
    console.error('Erreur création coupon:', error);
    res.status(500).json({
      message: 'Erreur lors de la création du coupon'
    });
  }
});

// Obtenir tous les coupons (admin seulement)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username email');

    res.json(coupons);
  } catch (error) {
    console.error('Erreur récupération coupons:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des coupons'
    });
  }
});

// Obtenir un coupon par ID (admin seulement)
router.get('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('createdBy', 'username email');

    if (!coupon) {
      return res.status(404).json({
        message: 'Coupon non trouvé'
      });
    }

    res.json(coupon);
  } catch (error) {
    console.error('Erreur récupération coupon:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération du coupon'
    });
  }
});

// Mettre à jour un coupon (admin seulement)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { code, type, value, minOrderAmount, maxUses, expiresAt, isActive } = req.body;

    const updateData = {};
    if (code) updateData.code = code.toUpperCase();
    if (type) updateData.type = type;
    if (value !== undefined) updateData.value = value;
    if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount;
    if (maxUses !== undefined) updateData.maxUses = maxUses;
    if (expiresAt) updateData.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) updateData.isActive = isActive;

    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(404).json({
        message: 'Coupon non trouvé'
      });
    }

    res.json({
      message: 'Coupon mis à jour avec succès',
      coupon
    });

  } catch (error) {
    console.error('Erreur mise à jour coupon:', error);
    res.status(500).json({
      message: 'Erreur lors de la mise à jour du coupon'
    });
  }
});

// Supprimer un coupon (admin seulement)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        message: 'Coupon non trouvé'
      });
    }

    res.json({
      message: 'Coupon supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression coupon:', error);
    res.status(500).json({
      message: 'Erreur lors de la suppression du coupon'
    });
  }
});

module.exports = router;
