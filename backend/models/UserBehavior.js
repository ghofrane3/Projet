// ============================================================
// models/UserBehavior.js
// Schéma MongoDB pour stocker le comportement utilisateur
// Historique de navigation + interactions (clics, panier, achats)
// ============================================================

import mongoose from 'mongoose';

// ─── Sous-schéma : une interaction unique ───────────────────
const InteractionSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  category: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  // Type d'interaction avec poids associé (pour le scoring)
  // view=1, click=2, cart=3, purchase=5
  type: {
    type: String,
    enum: ['view', 'click', 'cart', 'purchase'],
    default: 'view',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  // Durée passée sur la page (en secondes) — enrichit le scoring
  dwellTime: {
    type: Number,
    default: 0,
  },
}, { _id: false });

// ─── Sous-schéma : transition entre deux catégories ─────────
// Ex: l'utilisateur est passé de "chemises" → "vestes"
const CategoryTransitionSchema = new mongoose.Schema({
  from: { type: String, lowercase: true, trim: true },
  to:   { type: String, lowercase: true, trim: true },
  count: { type: Number, default: 1 },      // combien de fois cette transition
  lastSeen: { type: Date, default: Date.now },
}, { _id: false });

// ─── Schéma principal : comportement d'un utilisateur ───────
const UserBehaviorSchema = new mongoose.Schema({
  // Peut être un utilisateur connecté ou un visiteur anonyme
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
  },

  // Historique complet de navigation (limité aux 200 dernières)
  interactions: {
    type: [InteractionSchema],
    default: [],
  },

  // Transitions entre catégories extraites des interactions
  // Mises à jour en temps réel à chaque nouvelle navigation
  categoryTransitions: {
    type: [CategoryTransitionSchema],
    default: [],
  },

  // Catégories préférées calculées (top 5)
  preferredCategories: {
    type: [String],
    default: [],
  },

  // Dernière catégorie visitée (utile pour prédiction immédiate)
  lastCategory: {
    type: String,
    default: null,
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Index composé pour retrouver rapidement un utilisateur/session
UserBehaviorSchema.index({ userId: 1, sessionId: 1 });
UserBehaviorSchema.index({ 'interactions.category': 1 });

export default mongoose.model('UserBehavior', UserBehaviorSchema);
