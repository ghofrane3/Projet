// ============================================================
// models/CategoryTransitionMatrix.js
// Matrice de transition globale (Chaîne de Markov agrégée)
// Stocke les probabilités de transition entre toutes les catégories
// pour TOUS les utilisateurs — sert de base pour les nouveaux visiteurs
// ============================================================

import mongoose from 'mongoose';

// Une entrée = une transition FROM → TO avec ses statistiques
const TransitionEntrySchema = new mongoose.Schema({
  fromCategory: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  toCategory: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },

  // Nombre total de fois que cette transition a été observée
  totalCount: {
    type: Number,
    default: 0,
  },

  // Probabilité de transition (calculée : count / sum_all_transitions_from_source)
  probability: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },

  // Nombre d'utilisateurs uniques ayant effectué cette transition
  uniqueUsers: {
    type: Number,
    default: 0,
  },

  // Poids du contexte temporel (transitions récentes = plus importantes)
  recencyScore: {
    type: Number,
    default: 1.0,
  },

  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Index unique sur la paire (from, to) pour les upserts rapides
TransitionEntrySchema.index({ fromCategory: 1, toCategory: 1 }, { unique: true });

export default mongoose.model('CategoryTransitionMatrix', TransitionEntrySchema);
