import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdByIp: {
    type: String
  },
  revokedAt: {
    type: Date
  },
  revokedByIp: {
    type: String
  },
  replacedByToken: {
    type: String
  }
}, {
  timestamps: true
});

// Index pour supprimer automatiquement les tokens expirés
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Méthode pour vérifier si le token est actif
refreshTokenSchema.methods.isActive = function() {
  return !this.revokedAt && new Date() < this.expiresAt;
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
