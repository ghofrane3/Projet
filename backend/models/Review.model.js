import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  // Utilisateur qui a laissé l'avis
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'utilisateur est requis']
  },

  // Produit concerné
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Le produit est requis']
  },

  // Note (1-5 étoiles)
  rating: {
    type: Number,
    required: [true, 'La note est requise'],
    min: [1, 'La note minimale est 1'],
    max: [5, 'La note maximale est 5']
  },

  // Commentaire
  comment: {
    type: String,
    required: [true, 'Le commentaire est requis'],
    trim: true,
    minlength: [10, 'Le commentaire doit contenir au moins 10 caractères'],
    maxlength: [1000, 'Le commentaire ne peut pas dépasser 1000 caractères']
  },

  // Titre de l'avis (optionnel)
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères']
  },

  // Images attachées à l'avis
  images: [{
    url: String,
    publicId: String
  }],

  // Nombre de personnes qui ont trouvé l'avis utile
  helpful: {
    type: Number,
    default: 0,
    min: 0
  },

  // Statut de modération
  isApproved: {
    type: Boolean,
    default: false
  },

  // Réponse du vendeur (optionnel)
  vendorResponse: {
    text: String,
    date: Date
  },

  // Achat vérifié
  verifiedPurchase: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// ════════════════════════════════════════════════════════════
// INDEX
// ════════════════════════════════════════════════════════════
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ helpful: -1 });
reviewSchema.index({ isApproved: 1 });

// Un utilisateur ne peut laisser qu'un seul avis par produit
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

export default Review;
