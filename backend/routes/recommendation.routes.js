// ============================================================
// backend/routes/recommendation.routes.js
// CORRECTION : Gestion des navigations sans productId
// ============================================================

import express from 'express';
import {
  getRecommendations,
  getPersonalizedRecommendations,
  recordInteraction,
} from '../services/recommendation.service.js';

import {
  withCache,
  buildCacheKey,
  invalidateCategoryCache,
  TTL,
} from '../services/recommendation.cache.js';

import CategoryTransitionMatrix from '../models/CategoryTransitionMatrix.js';

const router = express.Router();

function extractSession(req, res, next) {
  req.sessionId =
    req.cookies?.sessionId ||
    req.headers['x-session-id'] ||
    `anon-${req.ip}-${Date.now()}`;
  req.currentUserId = req.user?._id || null;
  next();
}

router.use(extractSession);

// ============================================================
// GET /api/recommendations
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { category, topK = 5, excludeVisited = 'false' } = req.query;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre "category" est requis',
      });
    }

    const topKInt  = Math.min(parseInt(topK, 10) || 5, 20);
    const cacheKey = buildCacheKey({ type: 'global', category, topK: topKInt });
    const ttl      = req.currentUserId ? TTL.personalized : TTL.global;

    const result = await withCache(cacheKey, ttl, () =>
      getRecommendations({
        currentCategory: category,
        sessionId: req.sessionId,
        userId: req.currentUserId,
        topK: topKInt,
        excludeVisited: excludeVisited === 'true',
      })
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[RecoRoute] GET / :', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ============================================================
// GET /api/recommendations/personalized
// ============================================================
router.get('/personalized', async (req, res) => {
  try {
    const { topK = 5 } = req.query;
    const topKInt  = Math.min(parseInt(topK, 10) || 5, 20);
    const cacheKey = buildCacheKey({
      type: 'personalized',
      sessionId: req.sessionId,
      userId: req.currentUserId,
      topK: topKInt,
    });

    const result = await withCache(cacheKey, TTL.personalized, () =>
      getPersonalizedRecommendations({
        sessionId: req.sessionId,
        userId: req.currentUserId,
        topK: topKInt,
      })
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[RecoRoute] GET /personalized :', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ============================================================
// POST /api/recommendations/track
// ✅ CORRECTION : productId nullable pour navigations catégorie
// ============================================================
router.post('/track', async (req, res) => {
  try {
    const { productId, category, type = 'view', dwellTime = 0 } = req.body;

    // category est toujours requis
    if (!category) {
      return res.status(400).json({
        success: false,
        message: '"category" est requis',
      });
    }

    const validTypes = ['view', 'click', 'cart', 'purchase'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `"type" doit être parmi : ${validTypes.join(', ')}`,
      });
    }

    // ✅ Normalise la catégorie en minuscules
    const normalizedCategory = category.toLowerCase().trim();

    // ✅ Vérifie si productId est valide (ObjectId MongoDB)
    const isValidObjectId = productId &&
                           typeof productId === 'string' &&
                           /^[0-9a-fA-F]{24}$/.test(productId);

    if (isValidObjectId) {
      // Tracking complet avec produit
      await recordInteraction({
        sessionId: req.sessionId,
        userId: req.currentUserId,
        productId,
        category: normalizedCategory,
        type,
        dwellTime: parseInt(dwellTime, 10) || 0,
      });
    } else {
      // ✅ Tracking de navigation (sans produit spécifique)
      // Enregistre juste la catégorie visitée pour la matrice Markov
      await recordInteraction({
        sessionId: req.sessionId,
        userId: req.currentUserId,
        productId: null,   // ← pas de produit
        category: normalizedCategory,
        type: 'view',      // ← forcé à 'view' pour les navigations
        dwellTime: 0,
      });
    }

    await invalidateCategoryCache(normalizedCategory);

    return res.json({ success: true, message: 'Interaction enregistrée' });
  } catch (err) {
    console.error('[RecoRoute] POST /track :', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ============================================================
// GET /api/recommendations/popular
// ============================================================
router.get('/popular', async (req, res) => {
  try {
    const { topK = 10 } = req.query;
    const cacheKey = buildCacheKey({ type: 'popularity', topK });

    const result = await withCache(cacheKey, TTL.popularity, async () => {
      const popular = await CategoryTransitionMatrix.aggregate([
        { $group: { _id: '$toCategory', totalVisits: { $sum: '$totalCount' } } },
        { $sort: { totalVisits: -1 } },
        { $limit: parseInt(topK, 10) || 10 },
      ]);
      return {
        categories: popular.map((p) => ({
          category: p._id,
          totalVisits: p.totalVisits,
        })),
      };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[RecoRoute] GET /popular :', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ============================================================
// GET /api/recommendations/matrix (ADMIN)
// ============================================================
router.get('/matrix', async (req, res) => {
  try {
    const { from } = req.query;
    const query = from ? { fromCategory: from.toLowerCase() } : {};

    const matrix = await CategoryTransitionMatrix.find(query)
      .sort({ fromCategory: 1, probability: -1 })
      .limit(200);

    const nodes = new Set();
    const edges = [];

    for (const entry of matrix) {
      nodes.add(entry.fromCategory);
      nodes.add(entry.toCategory);
      edges.push({
        from       : entry.fromCategory,
        to         : entry.toCategory,
        probability: +entry.probability.toFixed(4),
        count      : entry.totalCount,
      });
    }

    return res.json({
      success: true,
      data: {
        nodes: Array.from(nodes),
        edges,
        totalTransitions: edges.length,
      },
    });
  } catch (err) {
    console.error('[RecoRoute] GET /matrix :', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

export default router;
