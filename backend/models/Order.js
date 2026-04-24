// backend/models/Order.js
import mongoose from 'mongoose';
import domainEmitter from '../services/domainEventEmitter.js';

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  products: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: { type: Number, required: true, min: 1 },
    price:    { type: Number, required: true }
  }],
  shippingAddress: {
    street:  String,
    city:    String,
    zipCode: String,
    country: String
  },
  totalAmount:           { type: Number, required: true },
  status: {
    type:    String,
    enum:    ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentIntentId: { type: String },
  paymentStatus:   { type: String },

  // ══════════════════════════════════════════════════════
  // LIVRAISON
  // ══════════════════════════════════════════════════════
  delivery: {
    carrier:          { type: String, default: '' },          // ex: "DHL", "ARAMEX"
    trackingNumber:   { type: String, default: '' },
    estimatedDate:    { type: Date },
    shippedAt:        { type: Date },
    deliveredAt:      { type: Date },
    notes:            { type: String, default: '' },
    history: [{
      status:    { type: String },
      message:   { type: String },
      location:  { type: String },
      timestamp: { type: Date, default: Date.now }
    }]
  }

}, { timestamps: true });

// ── Domain Events ──────────────────────────────────────
orderSchema.post('save', function(doc) {
  const eventName = doc.isNew ? 'order.created' : 'order.updated';
  domainEmitter.emit(eventName, { orderId: doc._id, userId: doc.userId });
});

orderSchema.post('findOneAndUpdate', function(doc) {
  if (doc) domainEmitter.emit('order.updated', { orderId: doc._id, userId: doc.userId });
});

orderSchema.post('findOneAndDelete', function(doc) {
  if (doc) domainEmitter.emit('order.deleted', { orderId: doc._id, userId: doc.userId });
});

const Order = mongoose.model('Order', orderSchema);
export default Order;
