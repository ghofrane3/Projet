import express from 'express';
import Review from '../models/Review.model.js';
import { authenticateUser, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// GET /api/reviews/featured  — avis en vedette (5★, les plus utiles)
// ════════════════════════════════════════════════════════════
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const reviews = await Review.find({ isApproved: true, rating: { $gte: 4 } })
      .populate('user', 'name avatar')
      .populate('product', 'name')
      .sort({ helpful: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, reviews });
  } catch (error) {
    console.error('Erreur featured reviews:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/reviews/product/:productId  — avis d'un produit
// ════════════════════════════════════════════════════════════
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ product: productId, isApproved: true })
        .populate('user', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ product: productId, isApproved: true })
    ]);

    res.json({
      success: true,
      reviews,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Erreur product reviews:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/reviews  — créer un avis (authentifié)
// ════════════════════════════════════════════════════════════
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { product, rating, comment, title } = req.body;

    // Utiliser l'utilisateur du token JWT (plus sécurisé que req.body.user)
    const userId = req.user.userId; // ✅ CORRECT

    if (!product || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: 'product, rating et comment sont requis'
      });
    }

    // Vérifier si l'utilisateur a déjà laissé un avis pour ce produit
    const existing = await Review.findOne({ user: userId, product });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà laissé un avis pour ce produit'
      });
    }

    const review = await Review.create({
      user: userId, // ✅ maintenant OK
      product,
      rating,
      comment,
      title,
      isApproved: true   // auto-approuvé ; mettez false si vous voulez modérer
    });

    const populated = await review.populate([
      { path: 'user',    select: 'name avatar' },
      { path: 'product', select: 'name' }
    ]);

    res.status(201).json({ success: true, review: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà laissé un avis pour ce produit'
      });
    }
    console.error('Erreur création review:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/reviews/:id/helpful  — marquer utile (optionnel auth)
// ════════════════════════════════════════════════════════════
router.post('/:id/helpful', optionalAuth, async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $inc: { helpful: 1 } },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ success: false, message: 'Avis introuvable' });
    }

    res.json({ success: true, helpful: review.helpful });
  } catch (error) {
    console.error('Erreur helpful:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

export default router;
