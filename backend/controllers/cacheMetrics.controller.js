/**
 * cacheMetrics.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les routes /api/admin/cache/*
 * Chaque action destructive notifie le dashboard via evictionEmitter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import cacheService    from '../services/cache.service.js';
import evictionEmitter from '../services/eviction.emitter.js';

// ════════════════════════════════════════════════════════════
// GET /api/admin/cache/stats
// ════════════════════════════════════════════════════════════
export const getStats = async (req, res) => {
  try {
    const stats = await cacheService.getStats?.() ?? {};
    res.json({ success: true, stats });
  } catch (error) {
    console.error('❌ getStats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/admin/cache/info
// ════════════════════════════════════════════════════════════
export const getRedisInfo = async (req, res) => {
  try {
    const redis = await cacheService.getRedisInfo?.() ?? {};
    res.json({ success: true, redis });
  } catch (error) {
    console.error('❌ getRedisInfo error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/admin/cache/metrics
// ════════════════════════════════════════════════════════════
export const getMetrics = (req, res) => {
  try {
    const data = cacheService.getMetrics();
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ getMetrics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/admin/cache/metrics/history
// ════════════════════════════════════════════════════════════
export const getHistory = (req, res) => {
  try {
    const data = cacheService.getHistory();
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ getHistory error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/admin/cache/metrics/reset
// ════════════════════════════════════════════════════════════
export const resetMetrics = (req, res) => {
  try {
    cacheService.resetMetrics();
    // ── Notification WebSocket ────────────────────────────────────────────
    evictionEmitter.emitMetrics();
    res.json({ success: true, message: 'Métriques réinitialisées avec succès' });
  } catch (error) {
    console.error('❌ resetMetrics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// DELETE /api/admin/cache/key/:key
// ════════════════════════════════════════════════════════════
export const deleteKey = async (req, res) => {
  try {
    const { key } = req.params;
    const decoded = decodeURIComponent(key);
    await cacheService.delete(decoded);

    // ── Notification WebSocket ────────────────────────────────────────────
    evictionEmitter.emit(decoded, 'manual_delete', 'L1+L2');

    res.json({ success: true, message: `Clé "${decoded}" supprimée` });
  } catch (error) {
    console.error('❌ deleteKey error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// DELETE /api/admin/cache/pattern
// ════════════════════════════════════════════════════════════
export const deleteByPattern = async (req, res) => {
  try {
    const { pattern } = req.body;
    if (!pattern) return res.status(400).json({ success: false, message: 'Pattern requis' });

    const result  = await cacheService.invalidatePattern?.(pattern) ?? 0;
    const deleted = typeof result === 'number' ? result : (result?.deleted ?? 0);

    // ── Notification WebSocket ────────────────────────────────────────────
    evictionEmitter.emitBatch([pattern], 'pattern_delete');

    res.json({ success: true, deleted, message: `${deleted} clés supprimées` });
  } catch (error) {
    console.error('❌ deleteByPattern error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// DELETE /api/admin/cache/all
// ════════════════════════════════════════════════════════════
export const clearAll = async (req, res) => {
  try {
    await cacheService.flush?.() ?? cacheService.clear?.();

    // ── Notification WebSocket ────────────────────────────────────────────
    evictionEmitter.emitBatch(['*'], 'full_flush');

    res.json({ success: true, message: 'Cache entièrement vidé' });
  } catch (error) {
    console.error('❌ clearAll error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/admin/cache/warmup
// ════════════════════════════════════════════════════════════
export const warmupCache = async (req, res) => {
  try {
    const { types = ['products', 'categories'] } = req.body;
    await cacheService.warmup?.(types);

    // ── Notification WebSocket ────────────────────────────────────────────
    evictionEmitter.emitMetrics();

    res.json({ success: true, message: 'Cache préchauffé', types });
  } catch (error) {
    console.error('❌ warmupCache error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/admin/cache/smart-config
// ════════════════════════════════════════════════════════════
export const getSmartConfig = (req, res) => {
  try {
    const data = cacheService.getAdaptiveTTLConfig?.()
              ?? cacheService.smartConfig
              ?? null;
    if (!data) return res.status(404).json({ success: false, message: 'Smart config non disponible' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ getSmartConfig error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/admin/cache/smart-config
// ════════════════════════════════════════════════════════════
export const saveSmartConfig = (req, res) => {
  try {
    const { baseTTL, minTTL, maxTTL, hotThreshold, coldAfterMs } = req.body;
    const updated = cacheService.setAdaptiveTTLConfig?.({
      baseTTL, minTTL, maxTTL, hotThreshold, coldAfterMs,
    }) ?? null;

    evictionEmitter.emitMetrics();
    res.json({ success: true, data: updated ?? req.body });
  } catch (error) {
    console.error('❌ saveSmartConfig error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/admin/cache/strategy/popular
// ════════════════════════════════════════════════════════════
export const getPopularKeys = (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const data  = cacheService.getTopKeys?.(limit) ?? [];
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ getPopularKeys error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/admin/cache/inspect/:key
// ════════════════════════════════════════════════════════════
export const inspectKey = async (req, res) => {
  try {
    const key    = decodeURIComponent(req.params.key);
    const result = await cacheService.inspectKey?.(key) ?? null;
    if (!result) return res.status(404).json({ success: false, message: 'Clé non trouvée' });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ inspectKey error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
