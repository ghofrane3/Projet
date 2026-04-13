/**
 * eviction.emitter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service singleton qui :
 *  1. S'accroche (monkey-patch) sur cacheService pour intercepter
 *     toutes les suppressions / expirations de clés.
 *  2. Émet en temps réel vers le namespace Socket.IO /cache-admin.
 *
 * Événements émis (côté client Angular) :
 *   eviction:key     → { key, reason, level, ttl, timestamp }
 *   eviction:batch   → { keys[], reason, count, timestamp }
 *   metrics:snapshot → métriques complètes
 *   cache:cleared    → { message, count, timestamp }
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ✅ FIX ÉTAPE 1 : importer directement getRedisClientSafe depuis la config Redis
// car cacheService n'expose pas de propriété redisClient publique —
// il appelle getRedisClientSafe() en interne à chaque opération.
import { getRedisClientSafe } from '../config/redis.js';

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
  }

  // ── Attacher sur cacheService (appelé APRÈS patchCacheService) ───────────
  attach(cacheService) {
    if (!cacheService) return;
    this._service = cacheService;

    // ── Intercepter delete() ─────────────────────────────────────────────
    const originalDelete = cacheService.delete?.bind(cacheService)
                        || cacheService.del?.bind(cacheService);

    if (originalDelete) {
      const methodName = cacheService.delete ? 'delete' : 'del';
      cacheService[methodName] = async (key, ...args) => {
        const result = await originalDelete(key, ...args);
        this._emitSingle({ key, reason: 'manual_delete', level: 'L1+L2' });
        return result;
      };
    }

    // ── Intercepter invalidatePattern() / deleteByPattern() ──────────────
    const originalPattern = (
      cacheService.invalidatePattern
      || cacheService.deleteByPattern
      || cacheService.clearByPattern
    );

    if (originalPattern) {
      const name = ['invalidatePattern', 'deleteByPattern', 'clearByPattern']
        .find(n => typeof cacheService[n] === 'function');
      const bound = originalPattern.bind(cacheService);

      cacheService[name] = async (pattern, ...args) => {
        const result = await bound(pattern, ...args);
        const count  = typeof result === 'number' ? result : (result?.deleted ?? 0);
        this._emitBatch({ pattern, count, reason: 'pattern_delete' });
        return result;
      };
    }

    // ── Intercepter flush() / clear() / flushAll() ────────────────────────
    const flushName = ['flush', 'clear', 'flushAll', 'clearAll']
      .find(n => typeof cacheService[n] === 'function');

    if (flushName) {
      const boundFlush = cacheService[flushName].bind(cacheService);
      cacheService[flushName] = async (...args) => {
        const result = await boundFlush(...args);
        this._emitCleared();
        return result;
      };
    }

    // ── Écoute des keyspace notifications Redis (expiration automatique) ──
    this._subscribeRedisExpiry();

    console.log('✅ [EvictionEmitter] Attaché sur cacheService');
  }

  // ── Émettre une éviction unitaire ─────────────────────────────────────────
  _emitSingle({ key, reason = 'eviction', level = 'L1', ttl = null }) {
    const event = {
      key,
      reason,
      level,
      ttl,
      timestamp: new Date().toISOString(),
    };
    this._buffer.push(event);
    this._scheduleBatch();
  }

  // ── Émettre une éviction de pattern ───────────────────────────────────────
  _emitBatch({ pattern, count, reason = 'pattern_delete' }) {
    if (!this._io) return;
    this._io.emit('eviction:batch', {
      pattern,
      count,
      reason,
      timestamp: new Date().toISOString(),
    });
    this._emitMetricsSnapshot();
  }

  // ── Émettre un flush total ─────────────────────────────────────────────────
  _emitCleared() {
    if (!this._io) return;
    this._io.emit('cache:cleared', {
      message:   'Cache entièrement vidé',
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
  // ✅ FIX ÉTAPE 1 : utiliser getRedisClientSafe() au lieu de this._service?.redisClient
  // car CacheService n'expose pas de propriété publique vers le client Redis.
  _subscribeRedisExpiry() {
    try {
      // ✅ Récupérer le client Redis via la fonction utilitaire partagée
      const redisClient = getRedisClientSafe();

      if (!redisClient) {
        console.warn('⚠️  [EvictionEmitter] Client Redis non trouvé → expiration passive non disponible');
        return;
      }

      // ✅ Dupliquer la connexion pour le mode subscriber
      // (un client Redis en mode subscribe ne peut pas faire d'autres commandes)
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
              key:    expiredKey,
              reason: 'ttl_expired',
              level:  'L2 (Redis)',
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

  // ── API publique : émettre manuellement ───────────────────────────────────
  emit(key, reason = 'manual_delete', level = 'L1+L2') {
    this._emitSingle({ key, reason, level });
  }

  emitBatch(keys = [], reason = 'batch_delete') {
    if (!this._io) return;
    this._io.emit('eviction:batch', {
      keys,
      count:     keys.length,
      reason,
      timestamp: new Date().toISOString(),
    });
    this._emitMetricsSnapshot();
  }

  emitMetrics() {
    this._emitMetricsSnapshot();
  }
}

// Singleton
const evictionEmitter = new EvictionEmitter();
export default evictionEmitter;
