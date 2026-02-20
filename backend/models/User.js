import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ══════════════════════════════════════════════════════════════
// SCHÉMA UTILISATEUR
// ══════════════════════════════════════════════════════════════
const userSchema = new mongoose.Schema({

  // ────────────────────────────────────────────────────────────
  // INFORMATIONS DE BASE
  // ────────────────────────────────────────────────────────────
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    minlength: [2, 'Le nom doit contenir au moins 2 caractères'],
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },

  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Format d\'email invalide']
  },

  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères']
  },

  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer'
  },

  // ────────────────────────────────────────────────────────────
  // VÉRIFICATION PAR EMAIL
  // ────────────────────────────────────────────────────────────
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },

  verificationToken: {
    type: String,
    default: null,
    index: true
  },

  verificationTokenExpires: {
    type: Date,
    default: null
  },

  // ────────────────────────────────────────────────────────────
  // RÉINITIALISATION DU MOT DE PASSE
  // ────────────────────────────────────────────────────────────
  resetPasswordToken: {
    type: String,
    default: null
  },

  resetPasswordExpires: {
    type: Date,
    default: null
  },

  // ────────────────────────────────────────────────────────────
  // INFORMATIONS SUPPLÉMENTAIRES
  // ────────────────────────────────────────────────────────────
  phone: {
    type: String,
    default: null
  },

  address: {
    street: {
      type: String,
      default: null
    },
    city: {
      type: String,
      default: null
    },
    postalCode: {
      type: String,
      default: null
    },
    country: {
      type: String,
      default: 'Tunisie'
    }
  },

  // ────────────────────────────────────────────────────────────
  // SÉCURITÉ ET SUIVI
  // ────────────────────────────────────────────────────────────
  lastLogin: {
    type: Date,
    default: null
  },

  loginAttempts: {
    type: Number,
    default: 0
  },

  lockUntil: {
    type: Date,
    default: null
  }

}, {
  // Options du schéma
  timestamps: true  // Ajoute automatiquement createdAt et updatedAt
});

// ══════════════════════════════════════════════════════════════
// MIDDLEWARE : Hash le mot de passe avant de sauvegarder
// ══════════════════════════════════════════════════════════════
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});


// ══════════════════════════════════════════════════════════════
// MÉTHODE : Comparer le mot de passe lors de la connexion
// ══════════════════════════════════════════════════════════════
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Erreur lors de la comparaison du mot de passe');
  }
};

// ══════════════════════════════════════════════════════════════
// MÉTHODE : Vérifier si le compte est verrouillé
// ══════════════════════════════════════════════════════════════
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// ══════════════════════════════════════════════════════════════
// MÉTHODE : Incrémenter les tentatives de connexion
// ══════════════════════════════════════════════════════════════
userSchema.methods.incLoginAttempts = function() {
  // Si le compte est déjà verrouillé et que la période est expirée
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  // Sinon, incrémenter les tentatives
  const updates = { $inc: { loginAttempts: 1 } };

  // Verrouiller le compte après 5 tentatives
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 heures

  if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + LOCK_TIME };
  }

  return this.updateOne(updates);
};

// ══════════════════════════════════════════════════════════════
// MÉTHODE : Réinitialiser les tentatives de connexion
// ══════════════════════════════════════════════════════════════
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// ══════════════════════════════════════════════════════════════
// INDEX pour améliorer les performances
// ══════════════════════════════════════════════════════════════

userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ createdAt: -1 });

// ══════════════════════════════════════════════════════════════
// EXPORTER LE MODÈLE
// ══════════════════════════════════════════════════════════════
const User = mongoose.model('User', userSchema);

export default User;
