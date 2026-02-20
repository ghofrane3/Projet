import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  // Informations de base
  name: {
    type: String,
    required: [true, 'Le nom du produit est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  description: {
    type: String,
    required: [true, 'La description est requise'],
    trim: true,
    maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères']
  },
  price: {
    type: Number,
    required: [true, 'Le prix est requis'],
    min: [0, 'Le prix doit être positif']
  },
  originalPrice: {
    type: Number,
    default: null // Prix avant promotion
  },

  // Catégorie et type
  category: {
    type: String,
    required: [true, 'La catégorie est requise'],
    enum: {
      values: ['T-shirts', 'Robes', 'Pantalons', 'Vestes', 'Pulls', 'Shorts', 'Jupes', 'Manteaux', 'Accessoires', 'Chaussures'],
      message: 'Catégorie invalide'
    }
  },
  gender: {
    type: String,
    enum: ['Homme', 'Femme', 'Enfant', 'Unisexe'],
    default: 'Unisexe'
  },

  // Variantes
  sizes: {
    type: [String],
    enum: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
           '34', '36', '38', '40', '42', '44', '46', '48',
           '36EU', '37EU', '38EU', '39EU', '40EU', '41EU', '42EU', '43EU', '44EU', '45EU'],
    default: []
  },
  colors: [{
    name: { type: String, required: true },  // ex: "Rouge", "Bleu nuit"
    hex: { type: String, default: '#000000' } // Code couleur hex
  }],

  // Images
  images: [{
    url: { type: String, required: true },
    publicId: { type: String },   // ID Cloudinary si utilisé
    isMain: { type: Boolean, default: false }
  }],

  // Stock
  stock: {
    type: Number,
    required: true,
    min: [0, 'Le stock ne peut pas être négatif'],
    default: 0
  },

  // Statistiques
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  salesCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },

  // SEO et affichage
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  tags: [String],
  featured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  // Informations supplémentaires
  material: { type: String, default: '' },
  brand: { type: String, default: 'Fashion Store' },
  sku: { type: String, unique: true, sparse: true }, // Code produit unique

}, {
  timestamps: true // createdAt et updatedAt automatiques
});

// ==========================================
// MIDDLEWARE - Auto-générer le slug
// ==========================================
productSchema.pre('save', function(next) {
  if (this.isModified('name') || this.isNew) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      + '-' + Date.now();
  }
  next();
});

// ==========================================
// MÉTHODES VIRTUELLES
// ==========================================
productSchema.virtual('mainImage').get(function() {
  const main = this.images.find(img => img.isMain);
  return main ? main.url : (this.images[0]?.url || null);
});

productSchema.virtual('isOnSale').get(function() {
  return this.originalPrice && this.originalPrice > this.price;
});

productSchema.virtual('discountPercent').get(function() {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round((1 - this.price / this.originalPrice) * 100);
  }
  return 0;
});

productSchema.virtual('isInStock').get(function() {
  return this.stock > 0;
});

// Inclure les virtuels dans JSON
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// ==========================================
// INDEX pour les performances
// ==========================================
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ featured: 1, isActive: 1 });
productSchema.index({ createdAt: -1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
