import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';

import authRoutes        from './routes/auth.routes.js';
import productRoutes     from './routes/product.routes.js';
import orderRoutes       from './routes/order.routes.js';
import adminRoutes       from './routes/admin.js';
import adminProductRoutes from './routes/admin.product.routes.js';
import adminCacheRoutes  from './routes/admin.cache.routes.js';
import cartRoutes        from './routes/cart.routes.js';
import paymentRoutes     from './routes/payment.js';

import cacheService        from './services/cache.service.js';
// ════════════════════════════════════════════════════════════
// NOUVEAU  — import du patch Smart Cache
// ════════════════════════════════════════════════════════════
import { patchCacheService } from './config/cache.config.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT         = process.env.PORT         || 5000;
const NODE_ENV     = process.env.NODE_ENV     || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CORS
// ════════════════════════════════════════════════════════════
const corsOptions = {
  origin: [
    FRONTEND_URL,
    'http://localhost:4200',
    'http://localhost:5114',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:5114',
  ],
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    message:     '🛍️ Fashion Store API - Maison Élite',
    status:      'running',
    version:     '2.1.0',
    environment: NODE_ENV,
    features: [
      '✅ Cache 3 Niveaux (L1/L2/L3)',
      '✅ Redis + Mémoire',
      '✅ Invalidation Automatique',
      '✅ Dashboard Admin Cache',
      '✅ Métriques Temps Réel',
      '✅ TTL Adaptatif (chaud/froid)',
      '✅ Stratégies LRU / LFU / FIFO',
      '✅ Authentification JWT avec httpOnly Cookies',
      '✅ Variables d\'environnement sécurisées',
    ],
  });
});

// ════════════════════════════════════════════════════════════
// ROUTES API
// ════════════════════════════════════════════════════════════
app.use('/api/auth',        authRoutes);
app.use('/api/products',    productRoutes);
app.use('/api/orders',      orderRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/admin',       adminProductRoutes);
app.use('/api/admin/cache', adminCacheRoutes);
app.use('/api/cart',        cartRoutes);
app.use('/api/payment',     paymentRoutes);

// ════════════════════════════════════════════════════════════
// 404 HANDLER
// ════════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} introuvable`,
  });
});

// ════════════════════════════════════════════════════════════
// ERROR HANDLER
// ════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('❌ Erreur:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ success: false, message: 'Fichier trop grand (max 5MB)' });
  if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ success: false, message: 'Maximum 5 images' });
  res.status(500).json({
    success: false,
    message: NODE_ENV === 'production' ? 'Erreur serveur interne' : err.message || 'Erreur serveur interne',
  });
});

// ════════════════════════════════════════════════════════════
// DÉMARRAGE SERVEUR
// ════════════════════════════════════════════════════════════
const startServer = async () => {
  try {
    console.log('\n🚀 ══════════════════════════════════════');
    console.log('   Fashion Store - BACKEND API');
    console.log('🚀 ══════════════════════════════════════\n');
    console.log(`📌 Environnement : ${NODE_ENV}`);
    console.log(`📌 Frontend URL  : ${FRONTEND_URL}`);
    console.log('');

    // 1. MongoDB
    console.log('📦 Connexion MongoDB...');
    await connectDB();

    // 2. Redis
    console.log('🔴 Connexion Redis...');
    await connectRedis();

    // ════════════════════════════════════════════════════════
    // NOUVEAU — Patch Smart Cache (après Redis, avant listen)
    // ════════════════════════════════════════════════════════
    patchCacheService(cacheService, {
      strategy: process.env.CACHE_STRATEGY    ?? 'LRU',  // LRU | LFU | FIFO
      maxSize:  Number(process.env.CACHE_MAX  ?? 500),
      ttl: {
        baseTTL:      Number(process.env.CACHE_BASE_TTL      ?? 300),
        minTTL:       Number(process.env.CACHE_MIN_TTL       ?? 30),
        maxTTL:       Number(process.env.CACHE_MAX_TTL       ?? 86400),
        hotThreshold: Number(process.env.CACHE_HOT_THRESHOLD ?? 10),
        coldAfterMs:  Number(process.env.CACHE_COLD_AFTER_MS ?? 600_000),
      },
    });

    // 3. Snapshots métriques toutes les 60s
    cacheService.startSnapshotTimer();

    // 4. Démarrer le serveur
    app.listen(PORT, () => {
      console.log('\n✅ ══════════════════════════════════════');
      console.log(`   🌐 Serveur démarré  : http://localhost:${PORT}`);
      console.log(`   📁 Uploads         : http://localhost:${PORT}/uploads`);
      console.log(`   📊 Cache Stats     : http://localhost:${PORT}/api/admin/cache/stats`);
      console.log(`   📈 Cache Métriques : http://localhost:${PORT}/api/admin/cache/metrics`);
      console.log(`   ⚡ Smart Config    : http://localhost:${PORT}/api/admin/cache/smart-config`);
      console.log(`   🎛️  Dashboard       : ${FRONTEND_URL}/admin/cache`);
      console.log('✅ ══════════════════════════════════════\n');
      console.log(`💡 Cache 3 niveaux actif (L1: Mémoire, L2: Redis, L3: MongoDB)`);
      console.log(`💡 Stratégie : ${process.env.CACHE_STRATEGY ?? 'LRU'} | TTL adaptatif activé`);
      console.log(`💡 JWT stockés dans httpOnly cookies (sécurisé)`);
      console.log(`💡 Snapshots métriques démarrés (toutes les 60s)\n`);
    });

  } catch (error) {
    console.error('\n❌ Erreur démarrage serveur:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

// ════════════════════════════════════════════════════════════
// GESTION ARRÊT GRACIEUX
// ════════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Arrêt du serveur...');
  console.log('👋 Au revoir !');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Signal SIGTERM reçu, arrêt gracieux...');
  process.exit(0);
});

startServer();

export default app;
