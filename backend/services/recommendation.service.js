// ============================================================
// backend/services/recommendation.service.js
// Version corrigée - Atomique - Sans VersionError - Sans ConflictingUpdateOperators
// ============================================================

import CategoryTransitionMatrix from '../models/CategoryTransitionMatrix.js';
import UserBehavior from '../models/UserBehavior.js';
import Product from '../models/Product.js';

const INTERACTION_WEIGHTS = {
  view:     1,
  click:    2,
  cart:     3,
  purchase: 5,
};

const SCORE_WEIGHTS = {
  markovProbability: 0.45,
  popularity:        0.25,
  personalization:   0.20,
  novelty:           0.10,
};

const DEFAULT_TOP_K            = 5;
const TIME_DECAY_HALF_LIFE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 jours

// ============================================================
// 1. ENREGISTRER UNE INTERACTION
// FIX : Séparation en 2 opérations pour éviter ConflictingUpdateOperators
//       ($setOnInsert + $push sur le même champ interdit par MongoDB)
// ============================================================
export async function recordInteraction({
  sessionId,
  userId    = null,
  productId = null,
  category,
  type      = 'view',
  dwellTime = 0,
}) {
  if (!sessionId || !category) {
    console.error('[recordInteraction] sessionId et category sont obligatoires');
    return null;
  }

  const now = new Date();

  // ✅ ÉTAPE 1 : upsert de base SANS $push sur interactions
  // $setOnInsert initialise interactions:[] uniquement à la création
  // Pas de $push ici → plus de ConflictingUpdateOperators
  await UserBehavior.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        lastCategory: category,
        userId:       userId || null,
        updatedAt:    now,
      },
      $setOnInsert: {
        sessionId,
        createdAt:           now,
        interactions:        [],
        categoryTransitions: [],
        preferredCategories: [],
      },
    },
    { upsert: true }
  );

  // ✅ ÉTAPE 2 : push de l'interaction produit dans une opération séparée
  let behavior = null;

  if (productId) {
    behavior = await UserBehavior.findOneAndUpdate(
      { sessionId },
      {
        $push: {
          interactions: {
            $each:  [{ productId, category, type, dwellTime, timestamp: now }],
            $slice: -200,
          },
        },
      },
      { returnDocument: 'after' }
    );
  } else {
    behavior = await UserBehavior.findOne({ sessionId });
  }

  if (!behavior) {
    console.error('[recordInteraction] Impossible de récupérer le document UserBehavior');
    return null;
  }

  // === Gestion des transitions de catégorie ===
  // On relit le doc pour avoir la vraie valeur de lastCategory avant ce $set
  const docSnapshot = await UserBehavior.findOne({ sessionId }).select('lastCategory');
  const previousCategory = docSnapshot?.lastCategory;

  if (previousCategory && previousCategory !== category) {
    await UserBehavior.findOneAndUpdate(
      { sessionId },
      {
        $push: {
          categoryTransitions: {
            $each:  [{ from: previousCategory, to: category, count: 1, lastSeen: now }],
            $slice: -100,
          },
        },
      }
    );
    await updateGlobalTransitionMatrix(previousCategory, category, userId);
  } else if (previousCategory === category) {
    await UserBehavior.updateOne(
      {
        sessionId,
        'categoryTransitions.from': previousCategory,
        'categoryTransitions.to':   category,
      },
      {
        $inc: { 'categoryTransitions.$.count': 1 },
        $set: { 'categoryTransitions.$.lastSeen': now },
      }
    );
  }

  // Mise à jour des catégories préférées
  if (behavior.interactions?.length > 0) {
    const preferred = computePreferredCategories(behavior.interactions);
    await UserBehavior.updateOne(
      { sessionId },
      { $set: { preferredCategories: preferred } }
    );
  }

  return behavior;
}

// ============================================================
// 2. MISE À JOUR DE LA MATRICE GLOBALE
// ============================================================
async function updateGlobalTransitionMatrix(fromCategory, toCategory, userId) {
  await CategoryTransitionMatrix.findOneAndUpdate(
    { fromCategory, toCategory },
    {
      $inc: { totalCount: 1 },
      $set: { lastUpdated: new Date() },
    },
    { upsert: true, returnDocument: 'after' }
  );

  await recalculateProbabilities(fromCategory);
}

// ============================================================
// 3. RECALCUL DES PROBABILITÉS
// ============================================================
async function recalculateProbabilities(fromCategory) {
  const transitions = await CategoryTransitionMatrix.find({ fromCategory });
  if (transitions.length === 0) return;

  const totalTransitions = transitions.reduce((sum, t) => sum + (t.totalCount || 0), 0);

  const updates = transitions.map((t) =>
    CategoryTransitionMatrix.findByIdAndUpdate(
      t._id,
      { probability: totalTransitions > 0 ? t.totalCount / totalTransitions : 0 },
      { returnDocument: 'after' }
    )
  );

  await Promise.all(updates);
}

// ============================================================
// 4. getRecommendations
// ============================================================
export async function getRecommendations({
  currentCategory,
  sessionId       = null,
  userId          = null,
  topK            = DEFAULT_TOP_K,
  excludeVisited  = false,
}) {
  const markovTransitions = await CategoryTransitionMatrix.find({
    fromCategory: currentCategory.toLowerCase(),
  }).sort({ probability: -1 }).limit(20);

  if (markovTransitions.length === 0) {
    return getFallbackRecommendations(topK);
  }

  let userProfile = null;
  if (sessionId || userId) {
    const query = userId ? { userId } : { sessionId };
    userProfile = await UserBehavior.findOne(query);
  }

  const categoryPopularity = await computeCategoryPopularity();

  const scoredCategories = markovTransitions.map((transition) => {
    const category = transition.toCategory || transition.to;

    const markovScore = transition.probability || 0;

    const maxPop = Math.max(...Object.values(categoryPopularity), 1);
    const popularityScore = (categoryPopularity[category] || 0) / maxPop;

    const personalizationScore = userProfile
      ? computePersonalizationScore(category, userProfile)
      : 0;

    const visitedCategories = userProfile
      ? new Set((userProfile.interactions || []).map((i) => i.category))
      : new Set();

    const noveltyScore = visitedCategories.has(category) ? 0 : 1;

    const finalScore =
      SCORE_WEIGHTS.markovProbability * markovScore +
      SCORE_WEIGHTS.popularity        * popularityScore +
      SCORE_WEIGHTS.personalization   * personalizationScore +
      SCORE_WEIGHTS.novelty           * noveltyScore;

    return {
      category,
      score: finalScore,
      breakdown: {
        markov:          +(markovScore * 100).toFixed(1),
        popularity:      +(popularityScore * 100).toFixed(1),
        personalization: +(personalizationScore * 100).toFixed(1),
        novelty:         +(noveltyScore * 100).toFixed(1),
      },
    };
  });

  let filteredCategories = scoredCategories;
  if (excludeVisited && userProfile) {
    const visited = new Set((userProfile.interactions || []).map((i) => i.category));
    filteredCategories = scoredCategories.filter((c) => !visited.has(c.category));
  }

  const topCategories = filteredCategories
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const enriched = await enrichWithProducts(topCategories);

  return {
    currentCategory,
    recommendations: enriched,
    meta: {
      algorithm: 'markov-chain-composite',
      weights: SCORE_WEIGHTS,
      totalCandidates: markovTransitions.length,
      personalized: !!userProfile,
    },
  };
}

// ============================================================
// Fonctions utilitaires
// ============================================================

function computePersonalizationScore(category, userProfile) {
  const now = Date.now();
  let score = 0;
  let totalWeight = 0;

  for (const interaction of (userProfile.interactions || [])) {
    if (interaction.category !== category) continue;
    const typeWeight  = INTERACTION_WEIGHTS[interaction.type] || 1;
    const ageMs       = now - new Date(interaction.timestamp).getTime();
    const decayFactor = Math.exp(-Math.log(2) * (ageMs / TIME_DECAY_HALF_LIFE_MS));

    score       += typeWeight * decayFactor;
    totalWeight += typeWeight;
  }

  return totalWeight > 0 ? Math.min(score / totalWeight, 1) : 0;
}

function computePreferredCategories(interactions) {
  const categoryScores = {};
  const now = Date.now();

  for (const interaction of (interactions || [])) {
    const weight = INTERACTION_WEIGHTS[interaction.type] || 1;
    const ageMs  = now - new Date(interaction.timestamp).getTime();
    const decay  = Math.exp(-Math.log(2) * (ageMs / TIME_DECAY_HALF_LIFE_MS));

    categoryScores[interaction.category] = (categoryScores[interaction.category] || 0) + weight * decay;
  }

  return Object.entries(categoryScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat]) => cat);
}

async function computeCategoryPopularity() {
  const aggregation = await CategoryTransitionMatrix.aggregate([
    { $group: { _id: '$toCategory', totalCount: { $sum: '$totalCount' } } },
  ]);

  const popularity = {};
  for (const entry of aggregation) {
    popularity[entry._id] = entry.totalCount || 0;
  }
  return popularity;
}

async function enrichWithProducts(scoredCategories) {
  const enriched = await Promise.all(
    scoredCategories.map(async (item) => {
      const products = await Product.find({
        category: { $regex: new RegExp(`^${item.category}$`, 'i') },
        isActive: true,
      })
        .sort({ 'rating.average': -1 })
        .limit(3)
        .select('_id name price images category rating');

      return {
        ...item,
        score: +item.score.toFixed(4),
        sampleProducts: products.map((p) => ({
          _id:      p._id,
          name:     p.name,
          price:    p.price,
          category: p.category,
          rating:   p.rating,
          images:   p.images,
        })),
      };
    })
  );
  return enriched;
}

async function getFallbackRecommendations(topK) {
  const popular = await CategoryTransitionMatrix.aggregate([
    { $group: { _id: '$toCategory', totalCount: { $sum: '$totalCount' } } },
    { $sort: { totalCount: -1 } },
    { $limit: topK },
  ]);

  const categories = popular.map((p) => ({
    category:  p._id,
    score:     0,
    breakdown: { markov: 0, popularity: 100, personalization: 0, novelty: 0 },
  }));

  return {
    currentCategory: null,
    recommendations: await enrichWithProducts(categories),
    meta: { algorithm: 'fallback-popularity', personalized: false },
  };
}

export async function getPersonalizedRecommendations({ sessionId, userId, topK = DEFAULT_TOP_K }) {
  const query = userId ? { userId } : { sessionId };
  const userProfile = await UserBehavior.findOne(query);

  if (!userProfile || !(userProfile.preferredCategories || []).length) {
    return getFallbackRecommendations(topK);
  }

  const recommendationSets = await Promise.all(
    userProfile.preferredCategories.slice(0, 3).map((category) =>
      getRecommendations({ currentCategory: category, sessionId, userId, topK })
    )
  );

  const seen   = new Set();
  const merged = [];

  for (const set of recommendationSets) {
    for (const rec of set.recommendations || []) {
      if (!seen.has(rec.category)) {
        seen.add(rec.category);
        merged.push(rec);
      }
    }
  }

  return {
    recommendations: merged.slice(0, topK),
    meta: {
      algorithm: 'personalized-multi-source',
      basedOn:   userProfile.preferredCategories,
      personalized: true,
    },
  };
}
