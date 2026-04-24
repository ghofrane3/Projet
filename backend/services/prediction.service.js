// prediction.service.js
// Service de prédiction de charge et pré-warmup intelligent
// Stocke le profil horaire sur 7 jours et prédit les pics de trafic

import cron from 'node-cron';

const SLOT_DURATION_MIN = 30;       // tranches de 30 minutes
const SLOTS_PER_DAY = 48;           // 24h / 30min
const HISTORY_DAYS = 7;             // 7 jours d'historique
const WARMUP_THRESHOLD = 1.5;       // seuil : moyenne > 1.5 × médiane globale
const WARMUP_ADVANCE_MIN = 10;      // déclencher 10 min avant le pic

class PredictionService {
  constructor(redisClient, cacheService) {
    this.redis = redisClient;
    this.cacheService = cacheService; // ton MultiLevelCache singleton
    this.isInitialized = false;
  }

  // ─── Utilitaires ────────────────────────────────────────────────

  /** Retourne l'index de tranche pour une date donnée (0–47) */
  getSlotIndex(date = new Date()) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return Math.floor((hours * 60 + minutes) / SLOT_DURATION_MIN);
  }

  /** Clé Redis pour stocker le compteur d'un slot d'un jour donné */
  getSlotKey(dayOffset = 0, slotIndex) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return `prediction:slot:${dateStr}:${slotIndex}`;
  }

  /** Heure lisible depuis un slot index (ex: 14 → "07:00") */
  slotToTime(slotIndex) {
    const totalMinutes = slotIndex * SLOT_DURATION_MIN;
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // ─── Collecte des données ────────────────────────────────────────

  /** Incrémenter le compteur de requêtes pour le slot courant */
  async recordRequest() {
    try {
      const slotIndex = this.getSlotIndex();
      const key = this.getSlotKey(0, slotIndex);
      await this.redis.incr(key);
      // TTL de 8 jours pour nettoyer automatiquement
      await this.redis.expire(key, 8 * 24 * 3600);
    } catch (err) {
      // silencieux pour ne pas impacter les perf
    }
  }

  // ─── Calcul du profil horaire ────────────────────────────────────

  /**
   * Construit le profil horaire moyen sur les 7 derniers jours
   * Retourne un tableau de 48 valeurs (moyenne par slot)
   */
  async buildHourlyProfile() {
    const profile = new Array(SLOTS_PER_DAY).fill(0);
    const counts = new Array(SLOTS_PER_DAY).fill(0);

    for (let day = 1; day <= HISTORY_DAYS; day++) {
      for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        const key = this.getSlotKey(day, slot);
        const val = await this.redis.get(key);
        if (val !== null) {
          profile[slot] += parseInt(val, 10);
          counts[slot]++;
        }
      }
    }

    // Calculer la moyenne par slot
    return profile.map((total, i) =>
      counts[i] > 0 ? Math.round(total / counts[i]) : 0
    );
  }

  /**
   * Calcule la médiane d'un tableau
   */
  median(arr) {
    const sorted = [...arr].filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // ─── Prédiction ─────────────────────────────────────────────────

  /**
   * Retourne les slots prédits comme pics de trafic
   * (slots où la moyenne historique > WARMUP_THRESHOLD × médiane globale)
   */
  async getPredictedPeaks() {
    const profile = await this.buildHourlyProfile();
    const globalMedian = this.median(profile);
    const peaks = [];

    profile.forEach((avgRequests, slotIndex) => {
      if (avgRequests > WARMUP_THRESHOLD * globalMedian) {
        peaks.push({
          slotIndex,
          time: this.slotToTime(slotIndex),
          avgRequests,
          confidence: Math.min(100, Math.round((avgRequests / (globalMedian * WARMUP_THRESHOLD)) * 70)),
        });
      }
    });

    return peaks.sort((a, b) => b.avgRequests - a.avgRequests);
  }

  /**
   * Données complètes pour le dashboard Angular
   */
  async getDashboardData() {
    const profile = await this.buildHourlyProfile();
    const globalMedian = this.median(profile);
    const currentSlot = this.getSlotIndex();

    // Données du jour en cours
    const today = [];
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const key = this.getSlotKey(0, slot);
      const val = await this.redis.get(key);
      today.push(val !== null ? parseInt(val, 10) : null);
    }

    const peaks = await this.getPredictedPeaks();

    // Prochain pic prédit
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const nextPeak = peaks.find(p => {
      const peakMinutes = p.slotIndex * SLOT_DURATION_MIN;
      return peakMinutes > currentMinutes;
    });

    return {
      profile,           // moyenne 7 jours par slot (48 valeurs)
      today,             // données réelles d'aujourd'hui (48 valeurs, null = pas encore)
      peaks,             // slots identifiés comme pics
      globalMedian,
      currentSlot,
      nextPeak: nextPeak || null,
      labels: Array.from({ length: SLOTS_PER_DAY }, (_, i) => this.slotToTime(i)),
      warmupHistory: await this.getWarmupHistory(),
    };
  }

  // ─── Warmup préventif ────────────────────────────────────────────

  /**
   * Lance le pré-warmup : récupère les produits populaires et les charge dans L1
   */
  async triggerWarmup(slotIndex) {
    console.log(`[Prediction] 🔥 Warmup préventif pour slot ${this.slotToTime(slotIndex)}`);

    try {
      // Patterns réels de ton cacheService (MultiLevelCache)
      // Les clés Redis n'ont pas de préfixe "cache:" — elles utilisent directement le cacheType
      const patterns = [
        'featured*',
        'trending*',
        'categories*',
        'products*',
        'product-detail*',
        'category*',
        'search*',
        'products:*',
        'recommendation*',
        'user:*',
      ];

      const warmupKeys = [];
      for (const pattern of patterns) {
        try {
          const keys = await this.redis.keys(pattern);
          // Exclure les clés internes de prédiction
          const filtered = keys.filter(k => !k.startsWith('prediction:'));
          warmupKeys.push(...filtered.slice(0, 15));
        } catch (_) {}
      }

      // Dédupliquer
      const uniqueKeys = [...new Set(warmupKeys)];
      let warmedCount = 0;

      for (const key of uniqueKeys) {
        try {
          const ttl = await this.redis.ttl(key);
          // ttl > 0 : clé avec expiry, ttl === -1 : pas d'expiry (garder), ttl === -2 : expirée
          if (ttl !== -2) {
            await this.redis.expire(key, 3600); // Étendre à 1h pour absorber le pic
            warmedCount++;
          }
        } catch (_) {}
      }

      // Logger le warmup
      await this.logWarmup(slotIndex, warmedCount);

      console.log(`[Prediction] ✅ ${warmedCount}/${uniqueKeys.length} clés réchauffées pour le pic de ${this.slotToTime(slotIndex)}`);
      return { warmedCount, keysScanned: uniqueKeys.length, slotIndex, time: this.slotToTime(slotIndex) };
    } catch (err) {
      console.error('[Prediction] Warmup error:', err);
      return { warmedCount: 0, error: err.message };
    }
  }

  async logWarmup(slotIndex, keysWarmed) {
    const log = {
      timestamp: new Date().toISOString(),
      slotIndex,
      time: this.slotToTime(slotIndex),
      keysWarmed,
    };
    const key = `prediction:warmup:history`;
    const existing = await this.redis.get(key);
    const history = existing ? JSON.parse(existing) : [];
    history.unshift(log);
    // Garder les 20 derniers warmups
    await this.redis.set(key, JSON.stringify(history.slice(0, 20)), { EX: 30 * 24 * 3600 });
  }

  async getWarmupHistory() {
    const key = `prediction:warmup:history`;
    const val = await this.redis.get(key);
    return val ? JSON.parse(val) : [];
  }

  // ─── Cron Jobs ───────────────────────────────────────────────────

  /**
   * Démarre les deux crons :
   * 1. Toutes les minutes → vérifie si un warmup est nécessaire dans 10 min
   * 2. Toutes les 30 min  → log le slot courant pour l'historique
   */
  startCronJobs() {
    // Vérification warmup toutes les minutes
    cron.schedule('* * * * *', async () => {
      try {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const targetMinutes = currentMinutes + WARMUP_ADVANCE_MIN;
        const targetSlot = Math.floor(targetMinutes / SLOT_DURATION_MIN);

        if (targetSlot >= SLOTS_PER_DAY) return;

        const peaks = await this.getPredictedPeaks();
        const isPeak = peaks.some(p => p.slotIndex === targetSlot);

        if (isPeak) {
          // Éviter de lancer deux warmups pour le même slot
          const lockKey = `prediction:warmup:lock:${targetSlot}`;
          const locked = await this.redis.get(lockKey);
          if (!locked) {
            await this.redis.set(lockKey, '1', { EX: SLOT_DURATION_MIN * 60 });
            await this.triggerWarmup(targetSlot);
          }
        }
      } catch (err) {
        console.error('[Prediction] Cron error:', err);
      }
    });

    console.log('[Prediction] ✅ Cron jobs démarrés (warmup + collecte)');
  }

  async initialize() {
    if (this.isInitialized) return;
    this.startCronJobs();
    this.isInitialized = true;
    console.log('[Prediction] 🚀 Service de prédiction initialisé');
  }
}

// Singleton via globalThis (même pattern que ton cache.service.js)
const _sym = Symbol.for('app.predictionService');
if (!globalThis[_sym]) {
  globalThis[_sym] = null;
}

export { PredictionService };
export const getPredictionService = () => globalThis[_sym];
export const setPredictionService = (instance) => { globalThis[_sym] = instance; };
