// routes/prediction.routes.js
import express from 'express';
import { getPredictionService } from '../services/prediction.service.js';
import { authenticateUser } from '../middleware/auth.js'; // ✅ export correct

const router = express.Router();

// GET /api/prediction/dashboard
router.get('/dashboard', authenticateUser, async (req, res) => {
  try {
    const predictionService = getPredictionService();
    if (!predictionService) {
      return res.status(503).json({ error: 'Prediction service not initialized' });
    }
    const data = await predictionService.getDashboardData();
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Prediction Route] /dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prediction/peaks
router.get('/peaks', authenticateUser, async (req, res) => {
  try {
    const predictionService = getPredictionService();
    const peaks = await predictionService.getPredictedPeaks();
    res.json({ success: true, peaks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prediction/warmup/trigger
router.post('/warmup/trigger', authenticateUser, async (req, res) => {
  try {
    const predictionService = getPredictionService();
    const { slotIndex } = req.body;
    const result = await predictionService.triggerWarmup(
      slotIndex ?? predictionService.getSlotIndex()
    );
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
