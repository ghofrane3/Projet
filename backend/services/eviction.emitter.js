/**
 * eviction.emitter.js  –  VERSION AMÉLIORÉE v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Nouveautés v2 :
 *  - Alertes intelligentes via Socket.IO (hit rate, mémoire, évictions)
 *  - Intégration du buffer circulaire d'invalidations
 *  - Tracking du ratio de compression
 *  - Vérification périodique des seuils
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getRedisClientSafe } from '../config/redis.js';
import { CACHE_CONFIG, invalidationHistory } from '../config/cache.config.js';

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
  product_created: '👔 Nouveau produit',
  product_updated: '✏️ Produit modifié',
  product_deleted: '🗑️ Produit supprimé',
  order_created:   '🛍️ Nouvelle commande',
  order_updated:   '🛒 Commande mise à jour',
  user_registered: '👋 Nouvel utilisateur',
  user_updated:    '👤 Utilisateur modifié',
  user_deleted:    '❌ Utilisateur supprimé',
};

// ── Sévérités d'alerte ───────────────────────────────────────────────────────
export const ALERT_SEVERITY = {
  INFO:     'info',
  WARNING:  'warning',
  CRITICAL: 'critical',
  URGENT:   'urgent',
};

class EvictionEmitter {
  constructor() {
    this._io            = null;
    this._service       = null;
    this._buffer        = [];
    this._batchTimer    = null;
    this._alertInterval = null;
    this.BATCH_DELAY_MS = 200;

    // ── État des alertes actives ────────────────────────────────────────────
    this._activeAlerts  = new Map();  // type → alerte active
    this._alertHistory  = [];         // buffer de 100 alertes passées
    this.MAX_ALERT_HISTORY = 100;

    // ── Stats compression ────────────────────────────────────────────────────
    this._compressionStats = {
      totalCompressed:    0,
      totalRawBytes:      0,
      totalCompressBytes: 0,
    };
  }

  // ── Injecter le namespace Socket.IO ──────────────────────────────────────
  setIO(namespace) {
    this._io = namespace;
    console.log('✅ [EvictionEmitter] Namespace Socket.IO /cache-admin enregistré');
  }

  // ── Attacher sur cacheService ────────────────────────────────────────────
  attach(cacheService) {
    if (!cacheService) return;
    this._service = cacheService;
    this._subscribeRedisExpiry();
    this._startAlertChecker();
    console.log('✅ [EvictionEmitter] Attaché sur cacheService (alertes intelligentes actives)');
  }

  // ── API publique : éviction unitaire ─────────────────────────────────────
  emit(key, reason = 'manual_delete', level = 'L1+L2', meta = {}) {
    this._emitSingle({ key, reason, level, ttl: meta.ttl ?? null, context: meta.context ?? '' });

    // Enregistrer dans le buffer d'invalidations
    invalidationHistory.push(
      reason,
      key,
      1,
      meta.context ?? ''
    );
  }

  // ── API publique : batch ──────────────────────────────────────────────────
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

    // Buffer d'invalidations
    invalidationHistory.push(
      reason,
      meta.pattern ?? `${keys.length} clés`,
      keys.length,
      meta.context ?? ''
    );

    this._emitMetricsSnapshot();
  }

  // ── API publique : snapshot métriques ─────────────────────────────────────
  emitMetrics() { this._emitMetricsSnapshot(); }

  // ── API publique : enregistrer une compression ────────────────────────────
  recordCompression(rawBytes, compressedBytes) {
    this._compressionStats.totalCompressed++;
    this._compressionStats.totalRawBytes      += rawBytes;
    this._compressionStats.totalCompressBytes += compressedBytes;
  }

  // ── API publique : obtenir les stats de compression ───────────────────────
  getCompressionStats() {
    const { totalCompressed, totalRawBytes, totalCompressBytes } = this._compressionStats;
    const ratio = totalRawBytes > 0
      ? Math.round((1 - totalCompressBytes / totalRawBytes) * 100)
      : 0;
    return {
      totalCompressed,
      totalRawBytes,
      totalCompressBytes,
      reductionPercent: ratio,
      avgRawKB:         totalCompressed > 0 ? Math.round(totalRawBytes      / totalCompressed / 1024 * 10) / 10 : 0,
      avgCompressedKB:  totalCompressed > 0 ? Math.round(totalCompressBytes / totalCompressed / 1024 * 10) / 10 : 0,
    };
  }

  // ── API publique : historique alertes ─────────────────────────────────────
  getAlertHistory(limit = 50) {
    return this._alertHistory.slice(0, limit);
  }

  // ── API publique : alertes actives ────────────────────────────────────────
  getActiveAlerts() {
    return [...this._activeAlerts.values()];
  }

  // ── Démarrer le vérificateur périodique d'alertes ─────────────────────────
  _startAlertChecker() {
    const interval = CACHE_CONFIG.alerts?.checkIntervalMs ?? 30_000;
    this._alertInterval = setInterval(() => this._checkAlerts(), interval);
    // Premier check immédiat
    setTimeout(() => this._checkAlerts(), 5_000);
  }

  // ── Vérifier tous les seuils d'alerte ─────────────────────────────────────
  async _checkAlerts() {
    if (!this._service) return;
    try {
      const metrics = this._service.getMetrics?.();
      if (!metrics) return;

      const cfg = CACHE_CONFIG.alerts ?? {};

      // 1. Hit rate critique
      if (metrics.hitRate !== undefined) {
        const hr = metrics.hitRate;
        if (hr < (cfg.hitRateCritical ?? 50)) {
          this._raiseAlert('hit_rate_critical', ALERT_SEVERITY.CRITICAL,
            `🔴 Hit rate critique : ${hr.toFixed(1)}%`,
            `Le taux de cache hit est tombé à ${hr.toFixed(1)}% (seuil : ${cfg.hitRateCritical ?? 50}%). Performance dégradée.`,
            { hitRate: hr, threshold: cfg.hitRateCritical ?? 50 }
          );
        } else if (hr < (cfg.hitRateWarning ?? 65)) {
          this._raiseAlert('hit_rate_warning', ALERT_SEVERITY.WARNING,
            `⚠️ Hit rate faible : ${hr.toFixed(1)}%`,
            `Le taux de cache hit est à ${hr.toFixed(1)}% (seuil attention : ${cfg.hitRateWarning ?? 65}%).`,
            { hitRate: hr, threshold: cfg.hitRateWarning ?? 65 }
          );
        } else {
          this._clearAlert('hit_rate_critical');
          this._clearAlert('hit_rate_warning');
        }
      }

      // 2. Redis déconnecté
      const redis = getRedisClientSafe();
      const redisOk = redis && redis.isReady !== false;
      if (!redisOk) {
        this._raiseAlert('redis_disconnected', ALERT_SEVERITY.URGENT,
          '🚨 Redis déconnecté !',
          'La connexion au serveur Redis est perdue. Seul le cache L1 mémoire est actif.',
          {}
        );
      } else {
        this._clearAlert('redis_disconnected');

        // 3. Mémoire Redis (seulement si Redis est disponible)
        try {
          const info = await redis.info('memory').catch(() => '');
          const match = info.match(/used_memory:(\d+)/);
          const maxMatch = info.match(/maxmemory:(\d+)/);
          if (match && maxMatch && parseInt(maxMatch[1]) > 0) {
            const usedPct = Math.round(parseInt(match[1]) / parseInt(maxMatch[1]) * 100);
            if (usedPct > (cfg.memoryUsageWarning ?? 80)) {
              this._raiseAlert('memory_high', ALERT_SEVERITY.WARNING,
                `⚠️ Mémoire Redis : ${usedPct}%`,
                `L'utilisation mémoire Redis atteint ${usedPct}% (seuil : ${cfg.memoryUsageWarning ?? 80}%).`,
                { usedPercent: usedPct, threshold: cfg.memoryUsageWarning ?? 80 }
              );
            } else {
              this._clearAlert('memory_high');
            }
          }
        } catch (_) {}
      }

      // 4. Taux d'éviction élevé
      if (metrics.evictions !== undefined && metrics.totalRequests > 0) {
        const evictionRate = Math.round(metrics.evictions / metrics.totalRequests * 100);
        if (evictionRate > (cfg.evictionRateWarning ?? 20)) {
          this._raiseAlert('eviction_rate_high', ALERT_SEVERITY.WARNING,
            `⚠️ Évictions fréquentes : ${evictionRate}%`,
            `Le taux d'éviction LRU est de ${evictionRate}% (seuil : ${cfg.evictionRateWarning ?? 20}%). Envisagez d'augmenter maxMemoryKeys.`,
            { evictionRate, threshold: cfg.evictionRateWarning ?? 20 }
          );
        } else {
          this._clearAlert('eviction_rate_high');
        }
      }

    } catch (err) {
      console.warn('[EvictionEmitter] Erreur vérification alertes:', err.message);
    }
  }

  // ── Lever une alerte ──────────────────────────────────────────────────────
  _raiseAlert(type, severity, title, message, data = {}) {
    const existing = this._activeAlerts.get(type);
    // Ne pas re-émettre la même alerte dans la minute
    if (existing && Date.now() - new Date(existing.timestamp).getTime() < 60_000) return;

    const alert = {
      id:        `${type}_${Date.now()}`,
      type,
      severity,
      title,
      message,
      data,
      timestamp: new Date().toISOString(),
      active:    true,
    };

    this._activeAlerts.set(type, alert);
    this._alertHistory.unshift(alert);
    if (this._alertHistory.length > this.MAX_ALERT_HISTORY) this._alertHistory.length = this.MAX_ALERT_HISTORY;

    if (this._io) {
      this._io.emit('cache:alert', alert);
    }

    console.warn(`[CacheAlert][${severity.toUpperCase()}] ${title}`);
  }

  // ── Résoudre une alerte ───────────────────────────────────────────────────
  _clearAlert(type) {
    if (!this._activeAlerts.has(type)) return;
    const alert = this._activeAlerts.get(type);
    alert.active    = false;
    alert.resolvedAt = new Date().toISOString();
    this._activeAlerts.delete(type);

    if (this._io) {
      this._io.emit('cache:alert:resolved', { type, resolvedAt: alert.resolvedAt });
    }
  }

  // ── Éviction unitaire (interne) ───────────────────────────────────────────
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

  // ── Flush vidage total (interne, appelé par cache.service) ────────────────
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

    // Buffer d'invalidations
    invalidationHistory.push('full_flush', '*', count, context);

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
    if (!this._io || this._buffer.length === 0) { this._buffer = []; return; }

    if (this._buffer.length === 1) {
      this._io.emit('eviction:key', this._buffer[0]);
    } else {
      this._io.emit('eviction:batch', {
        keys:      this._buffer.map(e => e.key),
        count:     this._buffer.length,
        reason:    'batch_eviction',
        label:     REASON_LABELS['batch_eviction'],
        context:   [...new Set(this._buffer.map(e => e.context).filter(Boolean))].join(', '),
        timestamp: new Date().toISOString(),
      });
    }

    this._buffer = [];
    this._emitMetricsSnapshot();
  }

  // ── Snapshot métriques ─────────────────────────────────────────────────────
  _emitMetricsSnapshot() {
    if (!this._io || !this._service) return;
    try {
      const metrics = this._service.getMetrics?.();
      if (metrics) {
        this._io.emit('metrics:snapshot', {
          ...metrics,
          compressionStats: this.getCompressionStats(),
          activeAlerts:     this.getActiveAlerts().length,
        });
      }
    } catch (_) {}
  }

  // ── Écoute des keyspace notifications Redis (TTL expiration) ──────────────
  _subscribeRedisExpiry() {
    try {
      const redisClient = getRedisClientSafe();
      if (!redisClient) {
        console.warn('⚠️  [EvictionEmitter] Client Redis non trouvé');
        return;
      }

      const subscriber = redisClient.duplicate ? redisClient.duplicate() : null;
      if (!subscriber) return;

      subscriber.connect?.()
        .then(async () => {
          try {
            await subscriber.sendCommand(['CONFIG', 'SET', 'notify-keyspace-events', 'Ex']);
          } catch {}

          await subscriber.pSubscribe('__keyevent@*__:expired', (expiredKey) => {
            this._emitSingle({ key: expiredKey, reason: 'ttl_expired', level: 'L2 (Redis)', context: 'auto-expiry' });
            invalidationHistory.push('ttl-expired', expiredKey, 1, 'redis-auto');
          });

          console.log('✅ [EvictionEmitter] Abonné aux keyspace notifications Redis');
        })
        .catch((err) => {
          console.warn('⚠️  [EvictionEmitter] Connexion subscriber Redis échouée:', err.message);
        });
    } catch (err) {
      console.warn('⚠️  [EvictionEmitter] Redis keyspace setup error:', err.message);
    }
  }

  // ── Nettoyage ─────────────────────────────────────────────────────────────
  destroy() {
    if (this._alertInterval) clearInterval(this._alertInterval);
    if (this._batchTimer) clearTimeout(this._batchTimer);
  }
}

// Singleton
const evictionEmitter = new EvictionEmitter();
export default evictionEmitter;
