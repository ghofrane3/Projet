import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';

import authRoutes         from './routes/auth.routes.js';
import productRoutes      from './routes/product.routes.js';
import orderRoutes        from './routes/order.routes.js';
import adminRoutes        from './routes/admin.js';
import adminProductRoutes from './routes/admin.product.routes.js';
import adminCacheRoutes   from './routes/admin.cache.routes.js';
import cartRoutes         from './routes/cart.routes.js';
import paymentRoutes      from './routes/payment.js';

import cacheService           from './services/cache.service.js';
import { patchCacheService }  from './config/cache.config.js';
import evictionEmitter        from './services/eviction.emitter.js'; // NOUVEAU
import recommendationRoutes from './routes/recommendation.routes.js';


dotenv.config();

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const app          = express();
const httpServer   = createServer(app);                              // NOUVEAU — serveur HTTP natif

const PORT         = process.env.PORT         || 5000;
const NODE_ENV     = process.env.NODE_ENV     || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

// ════════════════════════════════════════════════════════════
// SOCKET.IO — Configuration CORS identique à Express
// ════════════════════════════════════════════════════════════
const io = new SocketIOServer(httpServer, {                          // NOUVEAU
  cors: {
    origin: [
      FRONTEND_URL,
      'http://localhost:4200',
      'http://127.0.0.1:4200',
    ],
    credentials: true,
    methods: ['GET', 'POST'],
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});

// ── Namespace dédié au cache admin ───────────────────────────────────────
const cacheNsp = io.of('/cache-admin');

cacheNsp.on('connection', (socket) => {
  console.log(`🔌 [Socket] Admin connecté  : ${socket.id}`);

  // Envoyer les métriques courantes dès la connexion
  socket.emit('metrics:snapshot', cacheService.getMetrics());

  socket.on('disconnect', () => {
    console.log(`🔌 [Socket] Admin déconnecté : ${socket.id}`);
  });
});

// ── Brancher le service d'éviction sur Socket.IO ─────────────────────────
evictionEmitter.setIO(cacheNsp);                                     // NOUVEAU

// Exporter io pour les autres modules si nécessaire
export { io, cacheNsp };

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CORS Express
// ════════════════════════════════════════════════════════════
const corsOptions = {
  origin: [
    FRONTEND_URL,
    'http://localhost:4200',
    'http://127.0.0.1:4200',
  ],
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-session-id'],
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
    version:     '2.2.0',
    environment: NODE_ENV,
    features: [
      '✅ Cache 3 Niveaux (L1/L2/L3)',
      '✅ Redis + Mémoire',
      '✅ Invalidation Automatique',
      '✅ Dashboard Admin Cache',
      '✅ Métriques Temps Réel',
      '✅ TTL Adaptatif (chaud/froid)',
      '✅ Stratégies LRU / LFU / FIFO',
      '✅ WebSocket Éviction Notifications', // NOUVEAU
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
app.use('/api/recommendations', recommendationRoutes);

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
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ success: false, message: 'Fichier trop grand (max 5MB)' });
  if (err.code === 'LIMIT_FILE_COUNT')
    return res.status(400).json({ success: false, message: 'Maximum 5 images' });
  res.status(500).json({
    success:  false,
    message:  NODE_ENV === 'production' ? 'Erreur serveur interne' : err.message || 'Erreur serveur interne',
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

    console.log('📦 Connexion MongoDB...');
    await connectDB();

    console.log('🔴 Connexion Redis...');
    await connectRedis();

    // Patch Smart Cache (après Redis, avant listen)
    patchCacheService(cacheService, {
      strategy: process.env.CACHE_STRATEGY    ?? 'LRU',
      maxSize:  Number(process.env.CACHE_MAX  ?? 500),
      ttl: {
        baseTTL:      Number(process.env.CACHE_BASE_TTL      ?? 300),
        minTTL:       Number(process.env.CACHE_MIN_TTL       ?? 30),
        maxTTL:       Number(process.env.CACHE_MAX_TTL       ?? 86400),
        hotThreshold: Number(process.env.CACHE_HOT_THRESHOLD ?? 10),
        coldAfterMs:  Number(process.env.CACHE_COLD_AFTER_MS ?? 600_000),
      },
    });

    // Brancher l'émetteur d'éviction sur cacheService APRÈS le patch
    evictionEmitter.attach(cacheService);                            // NOUVEAU

    // Snapshots métriques toutes les 60s
    cacheService.startSnapshotTimer();

    // ── Démarrer le serveur HTTP (et non app.listen)
    httpServer.listen(PORT, () => {                                  // MODIFIÉ
      console.log('\n✅ ══════════════════════════════════════');
      console.log(`   🌐 Serveur démarré  : http://localhost:${PORT}`);
      console.log(`   🔌 WebSocket        : ws://localhost:${PORT}/cache-admin`);
      console.log(`   📁 Uploads         : http://localhost:${PORT}/uploads`);
      console.log(`   📊 Cache Stats     : http://localhost:${PORT}/api/admin/cache/stats`);
      console.log(`   📈 Cache Métriques : http://localhost:${PORT}/api/admin/cache/metrics`);
      console.log(`   ⚡ Smart Config    : http://localhost:${PORT}/api/admin/cache/smart-config`);
      console.log(`   🎛️  Dashboard       : ${FRONTEND_URL}/admin/cache`);
      console.log('✅ ══════════════════════════════════════\n');
      console.log(`💡 Cache 3 niveaux actif (L1: Mémoire, L2: Redis, L3: MongoDB)`);
      console.log(`💡 Stratégie : ${process.env.CACHE_STRATEGY ?? 'LRU'} | TTL adaptatif activé`);
      console.log(`💡 WebSocket éviction notifications actif`);
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
  io.close();
  console.log('👋 Au revoir !');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Signal SIGTERM reçu, arrêt gracieux...');
  io.close();
  process.exit(0);
});

startServer();

export default app;
