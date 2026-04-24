import mongoose from 'mongoose';

const wishlistSchema = new mongoose.Schema({
  userId:     {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true   // Un seul document wishlist par utilisateur
  },
  productIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'Product'
  }]
}, { timestamps: true });

export default mongoose.model('Wishlist', wishlistSchema);
