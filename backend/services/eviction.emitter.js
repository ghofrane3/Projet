/**
 * eviction.emitter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service singleton qui :
 *  1. S'accroche (monkey-patch) sur cacheService pour intercepter
 *     toutes les suppressions / expirations de clés.
 *  2. Émet en temps réel vers le namespace Socket.IO /cache-admin.
 *
 * Événements émis (côté client Angular) :
 *   eviction:key     → { key, reason, label, level, ttl, context, timestamp }
 *   eviction:batch   → { keys[], pattern?, reason, label, count, context, timestamp }
 *   metrics:snapshot → métriques complètes
 *   cache:cleared    → { message, count, reason, label, context, timestamp }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getRedisClientSafe } from '../config/redis.js';

// ── Labels lisibles pour l'UI ─────────────────────────────────────────────────
export const REASON_LABELS = {
  manual_delete:   '🗑️ Suppression manuelle',
  ttl_expired:     '⏱️ TTL expiré',
  pattern_delete:  '🔍 Suppression par pattern',
  batch_eviction:  '📦 Éviction batch',
  full_flush:      '🧹 Vidage total',
  warmup:          '🔥 Préchauffage',
  reset:           '🔄 Reset métriques',
  eviction:        '⚡ Éviction automatique',
  // contextes métier
  product_created: '👔 Nouveau produit',
  product_updated: '✏️ Produit modifié',
  product_deleted: '🗑️ Produit supprimé',
  order_created:   '🛍️ Nouvelle commande',
  order_updated:   '🛒 Commande mise à jour',
  user_registered: '👋 Nouvel utilisateur',
  user_updated:    '👤 Utilisateur modifié',
  user_deleted:    '❌ Utilisateur supprimé',
};

class EvictionEmitter {
  constructor() {
    this._io         = null;   // namespace Socket.IO /cache-admin
    this._service    = null;   // référence cacheService
    this._buffer     = [];     // buffer pour batching
    this._batchTimer = null;
    this.BATCH_DELAY_MS = 200; // regrouper les évictions rapprochées
  }

  // ── Injecter le namespace Socket.IO ──────────────────────────────────────
  setIO(namespace) {
    this._io = namespace;
    console.log('✅ [EvictionEmitter] Namespace Socket.IO /cache-admin enregistré');
  }

  // ── Attacher sur cacheService (appelé APRÈS initialisation du singleton) ─
  attach(cacheService) {
    if (!cacheService) return;
    this._service = cacheService;

    // ── Intercepter invalidateKey() si elle n'appelle pas déjà emit ────────
    // Note : invalidateKey() dans cache.service.js appelle déjà evictionEmitter.emit()
    // Le monkey-patch ci-dessous sert de filet de sécurité pour les méthodes
    // qui ne le feraient pas.

    // ── Intercepter flush() ───────────────────────────────────────────────
    // Note : flush() appelle déjà _emitCleared() — pas de double-wrap ici.

    // ── Écoute des keyspace notifications Redis (expiration automatique) ──
    this._subscribeRedisExpiry();

    console.log('✅ [EvictionEmitter] Attaché sur cacheService');
  }

  // ── Émettre une éviction unitaire (API publique) ──────────────────────────
  // meta peut contenir { context, ttl }
  emit(key, reason = 'manual_delete', level = 'L1+L2', meta = {}) {
    this._emitSingle({
      key,
      reason,
      level,
      ttl:     meta.ttl     ?? null,
      context: meta.context ?? '',
    });
  }

  // ── Émettre un batch (API publique) ──────────────────────────────────────
  // meta peut contenir { context, pattern }
  emitBatch(keys = [], reason = 'batch_delete', meta = {}) {
    if (!this._io) return;
    this._io.emit('eviction:batch', {
      keys,
      count:     keys.length,
      reason,
      label:     REASON_LABELS[reason] ?? reason,
      pattern:   meta.pattern ?? '',
      context:   meta.context ?? '',
      timestamp: new Date().toISOString(),
    });
    this._emitMetricsSnapshot();
  }

  // ── Forcer un snapshot métriques (API publique) ───────────────────────────
  emitMetrics() {
    this._emitMetricsSnapshot();
  }

  // ── Émettre une éviction unitaire (interne) ───────────────────────────────
  _emitSingle({ key, reason = 'eviction', level = 'L1', ttl = null, context = '' }) {
    const event = {
      key,
      reason,
      label:     REASON_LABELS[reason] ?? reason,
      level,
      ttl,
      context,
      timestamp: new Date().toISOString(),
    };
    this._buffer.push(event);
    this._scheduleBatch();
  }

  // ── Émettre une éviction de pattern (interne) ─────────────────────────────
  _emitBatch({ pattern = '', count = 0, reason = 'pattern_delete', context = '' }) {
    if (!this._io) return;
    this._io.emit('eviction:batch', {
      pattern,
      count,
      reason,
      label:     REASON_LABELS[reason] ?? reason,
      context,
      timestamp: new Date().toISOString(),
    });
    this._emitMetricsSnapshot();
  }

  // ── Émettre un flush total (interne) ──────────────────────────────────────
  _emitCleared({ count = 0, reason = 'full_flush', context = '' } = {}) {
    if (!this._io) return;
    this._io.emit('cache:cleared', {
      message:   `Cache entièrement vidé (${count} entrée${count > 1 ? 's' : ''})`,
      count,
      reason,
      label:     REASON_LABELS[reason] ?? reason,
      context,
      timestamp: new Date().toISOString(),
    });
    this._emitMetricsSnapshot();
  }

  // ── Batching ───────────────────────────────────────────────────────────────
  _scheduleBatch() {
    if (this._batchTimer) return;
    this._batchTimer = setTimeout(() => {
      this._flushBuffer();
      this._batchTimer = null;
    }, this.BATCH_DELAY_MS);
  }

  _flushBuffer() {
    if (!this._io || this._buffer.length === 0) {
      this._buffer = [];
      return;
    }

    if (this._buffer.length === 1) {
      this._io.emit('eviction:key', this._buffer[0]);
    } else {
      this._io.emit('eviction:batch', {
        keys:      this._buffer.map(e => e.key),
        count:     this._buffer.length,
        reason:    'batch_eviction',
        label:     REASON_LABELS['batch_eviction'],
        // Regrouper les contextes uniques du buffer
        context:   [...new Set(this._buffer.map(e => e.context).filter(Boolean))].join(', '),
        timestamp: new Date().toISOString(),
      });
    }

    this._buffer = [];
    this._emitMetricsSnapshot();
  }

  // ── Émettre un snapshot des métriques ─────────────────────────────────────
  _emitMetricsSnapshot() {
    if (!this._io || !this._service) return;
    try {
      const metrics = this._service.getMetrics?.();
      if (metrics) this._io.emit('metrics:snapshot', metrics);
    } catch (_) { /* silencieux */ }
  }

  // ── Écoute des keyspace notifications Redis (expiration automatique) ───────
  _subscribeRedisExpiry() {
    try {
      const redisClient = getRedisClientSafe();

      if (!redisClient) {
        console.warn('⚠️  [EvictionEmitter] Client Redis non trouvé → expiration passive non disponible');
        return;
      }

      const subscriber = redisClient.duplicate
        ? redisClient.duplicate()
        : null;

      if (!subscriber) {
        console.warn('⚠️  [EvictionEmitter] Impossible de dupliquer le client Redis');
        return;
      }

      subscriber.connect?.()
        .then(async () => {
          // Activer keyspace notifications sur les événements d'expiration
          try {
            await subscriber.sendCommand(['CONFIG', 'SET', 'notify-keyspace-events', 'Ex']);
          } catch {
            // Redis Cloud ou config restreinte — non bloquant
          }

          // S'abonner aux expirations sur toutes les DB
          await subscriber.pSubscribe('__keyevent@*__:expired', (expiredKey) => {
            this._emitSingle({
              key:     expiredKey,
              reason:  'ttl_expired',
              level:   'L2 (Redis)',
              context: 'auto-expiry',
            });
          });

          console.log('✅ [EvictionEmitter] Abonné aux keyspace notifications Redis (TTL expiry actif)');
        })
        .catch((err) => {
          console.warn('⚠️  [EvictionEmitter] Connexion subscriber Redis échouée:', err.message);
        });

    } catch (err) {
      console.warn('⚠️  [EvictionEmitter] Redis keyspace setup error:', err.message);
    }
  }
}

// Singleton
const evictionEmitter = new EvictionEmitter();
export default evictionEmitter;
