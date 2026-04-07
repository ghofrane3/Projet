import cacheService from '../services/cache.service.js';

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
    res.json({ success: true, message: 'Métriques réinitialisées avec succès' });
  } catch (error) {
    console.error('❌ resetMetrics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
