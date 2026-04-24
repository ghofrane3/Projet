/**
 * cacheInvalidationListener.js
 * Écoute les événements métier et invalide automatiquement le cache
 */

import domainEmitter from './domainEventEmitter.js';
import evictionEmitter from './eviction.emitter.js';
import cacheService from './cache.service.js';

// ====================== PRODUITS ======================
domainEmitter.on('product.created', async (payload) => {
  await invalidateProductCache(payload);
  evictionEmitter.emitBatch(['products', 'trending'], 'product_created');
  console.log(`🧹 [Cache] Invalidé après création produit ID: ${payload.productId}`);
});

domainEmitter.on('product.updated', async (payload) => {
  await invalidateProductCache(payload);
  evictionEmitter.emitBatch(['products', 'trending'], 'product_updated');
  console.log(`🧹 [Cache] Invalidé après mise à jour produit ID: ${payload.productId}`);
});

domainEmitter.on('product.deleted', async (payload) => {
  await invalidateProductCache(payload);
  evictionEmitter.emitBatch(['products', 'trending'], 'product_deleted');
  console.log(`🧹 [Cache] Invalidé après suppression produit ID: ${payload.productId}`);
});

// ====================== COMMANDES ======================
domainEmitter.on('order.created', async (payload) => {
  await invalidateOrderCache(payload);
  evictionEmitter.emit(`orders:user:${payload.userId}`, 'order_created', 'L1+L2');
  console.log(`🧹 [Cache] Commandes invalidées pour user: ${payload.userId}`);
});

domainEmitter.on('order.updated', async (payload) => {
  await invalidateOrderCache(payload);
  evictionEmitter.emit(`orders:user:${payload.userId}`, 'order_updated', 'L1+L2');
});

domainEmitter.on('order.deleted', async (payload) => {
  await invalidateOrderCache(payload);
  evictionEmitter.emit(`orders:user:${payload.userId}`, 'order_deleted', 'L1+L2');
});

// ==================== FONCTIONS D'INVALIDATION ====================

async function invalidateProductCache(payload) {
  try {
    await cacheService.invalidateByTag('products');
    await cacheService.invalidateByTag('trending');
  } catch (err) {
    console.error('❌ Erreur invalidation cache produit:', err);
  }
}

async function invalidateOrderCache(payload) {
  try {
    if (payload.userId) {
      await cacheService.delete(`orders:user:${payload.userId}`);
    }
    await cacheService.invalidateByTag('stats:orders');
  } catch (err) {
    console.error('❌ Erreur invalidation cache commande:', err);
  }
}

console.log('✅ Cache Invalidation Listener chargé');
export default null;
