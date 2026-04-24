import express from 'express';
import Wishlist from '../models/Wishlist.js';
import { authenticateUser } from '../middleware/auth.js';
import cacheService from '../services/cache.service.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// GET /api/wishlist  — récupérer la wishlist complète
// ════════════════════════════════════════════════════════════
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId   = req.user.userId;
    const cacheKey = `wishlist:${userId}`;

    // ── Tentative cache L1/L2 ──────────────────────────────
    const cached = await cacheService.getByKey(cacheKey, 300);
    if (cached) {
      return res.json({ success: true, wishlist: cached, source: 'cache' });
    }

    // ── L3 : MongoDB ────────────────────────────────────────
    const doc = await Wishlist.findOne({ userId })
      .populate('productIds', 'name price images stock category brand');

    const products = doc?.productIds || [];
    await cacheService.setWithTTL(cacheKey, products, 300);

    res.json({ success: true, wishlist: products });
  } catch (error) {
    console.error('❌ GET /api/wishlist :', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/wishlist/:productId  — ajouter un produit
// ════════════════════════════════════════════════════════════
router.post('/:productId', authenticateUser, async (req, res) => {
  try {
    const { userId }    = req.user;
    const { productId } = req.params;

    await Wishlist.findOneAndUpdate(
      { userId },
      { $addToSet: { productIds: productId } },
      { upsert: true, new: true }
    );

    // Invalider le cache pour que le prochain GET soit frais
    await cacheService.invalidateKey(`wishlist:${userId}`, 'wishlist_add');

    res.json({ success: true, message: 'Produit ajouté aux favoris' });
  } catch (error) {
    console.error('❌ POST /api/wishlist/:productId :', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/wishlist/:productId  — retirer un produit
// ════════════════════════════════════════════════════════════
router.delete('/:productId', authenticateUser, async (req, res) => {
  try {
    const { userId }    = req.user;
    const { productId } = req.params;

    await Wishlist.findOneAndUpdate(
      { userId },
      { $pull: { productIds: productId } }
    );

    await cacheService.invalidateKey(`wishlist:${userId}`, 'wishlist_remove');

    res.json({ success: true, message: 'Produit retiré des favoris' });
  } catch (error) {
    console.error('❌ DELETE /api/wishlist/:productId :', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
