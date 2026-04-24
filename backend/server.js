// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import connectDB from './config/db.js';
import { connectRedis, getRedisClientSafe } from './config/redis.js';

import authRoutes           from './routes/auth.routes.js';
import productRoutes        from './routes/product.routes.js';
import orderRoutes          from './routes/order.routes.js';
import adminRoutes          from './routes/admin.js';
import adminProductRoutes   from './routes/admin.product.routes.js';
import adminCacheRoutes     from './routes/admin.cache.routes.js';
import cartRoutes           from './routes/cart.routes.js';
import paymentRoutes        from './routes/payment.js';
import recommendationRoutes from './routes/recommendation.routes.js';
import reviewRoutes         from './routes/review.routes.js';
import wishlistRoutes       from './routes/wishlist.routes.js';
import deliveryRoutes       from './routes/delivery.routes.js';
import predictionRoutes     from './routes/prediction.routes.js'; // ✅ AJOUT

import cacheService          from './services/cache.service.js';
import { patchCacheService } from './config/cache.config.js';
import evictionEmitter       from './services/eviction.emitter.js';
import './services/cacheInvalidationListener.js';

// ✅ AJOUT : Import du service de prédiction
import { PredictionService, setPredictionService } from './services/prediction.service.js';

import Product from './models/Product.js';

dotenv.config();

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const app          = express();
const httpServer   = createServer(app);

const PORT         = process.env.PORT         || 5000;
const NODE_ENV     = process.env.NODE_ENV     || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

// ════════════════════════════════════════════════════════
// SOCKET.IO
// ════════════════════════════════════════════════════════
const io = new SocketIOServer(httpServer, {
  cors: {
    origin:      [FRONTEND_URL, 'http://localhost:4200', 'http://127.0.0.1:4200'],
    credentials: true,
    methods:     ['GET', 'POST'],
  },
  path:       '/socket.io',
  transports: ['websocket', 'polling'],
});

const cacheNsp = io.of('/cache-admin');
cacheNsp.on('connection', (socket) => {
  console.log(`🔌 [Socket] Admin connecté : ${socket.id}`);
  socket.emit('metrics:snapshot', cacheService.getMetrics?.() || {});
  socket.on('disconnect', () => console.log(`🔌 [Socket] Admin déconnecté : ${socket.id}`));
});
evictionEmitter.setIO(cacheNsp);

// ════════════════════════════════════════════════════════
// CORS
// ════════════════════════════════════════════════════════
app.use(cors({
  origin:         [FRONTEND_URL, 'http://localhost:4200', 'http://127.0.0.1:4200'],
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-session-id'],
}));

app.use(cookieParser());

// ════════════════════════════════════════════════════════
// ⚠️  WEBHOOK STRIPE — raw body AVANT express.json()
//     Uniquement pour /api/payments/webhook
//     Toutes les autres routes /api/payments reçoivent JSON normal
// ════════════════════════════════════════════════════════
app.use(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' })
);

// ════════════════════════════════════════════════════════
// ✅ express.json() GLOBAL — parsé pour TOUTES les routes
//    y compris /api/payments/create-payment-intent
// ════════════════════════════════════════════════════════
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ════════════════════════════════════════════════════════
// Health Check
// ════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    message:     '🛍️ Fashion Store API - Maison Élite',
    status:      'running',
    version:     '2.5.0',
    environment: NODE_ENV,
  });
});

// ════════════════════════════════════════════════════════
// ROUTES — toutes après express.json()
// ════════════════════════════════════════════════════════
app.use('/api/auth',            authRoutes);
app.use('/api/products',        productRoutes);
app.use('/api/orders',          orderRoutes);
app.use('/api/admin',           adminRoutes);
app.use('/api/admin',           adminProductRoutes);
app.use('/api/admin/cache',     adminCacheRoutes);
app.use('/api/cart',            cartRoutes);
app.use('/api/payments',        paymentRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/reviews',         reviewRoutes);
app.use('/api/wishlist',        wishlistRoutes);
app.use('/api/delivery',        deliveryRoutes);
app.use('/api/prediction',      predictionRoutes); // ✅ AJOUT

// ════════════════════════════════════════════════════════
// 404 / Error
// ════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} introuvable` });
});

app.use((err, req, res, next) => {
  console.error('❌ Erreur :', err.message);
  res.status(500).json({
    success: false,
    message: NODE_ENV === 'production' ? 'Erreur serveur interne' : err.message,
  });
});

// ════════════════════════════════════════════════════════
// WARMUP CACHE
// ════════════════════════════════════════════════════════
const runCacheWarmup = async () => {
  console.log('🔥 Préchauffage du cache...');
  try {
    const [featured, trending, categories] = await Promise.all([
      Product.find({ featured: true, isActive: true }).sort('-createdAt').limit(8).lean(),
      Product.find({ isActive: true }).sort('-salesCount -rating.average').limit(8).lean(),
      Product.distinct('category', { isActive: true }),
    ]);
    await Promise.all([
      cacheService.set('featured',   {}, { success: true, products: featured }, 7200),
      cacheService.set('trending',   {}, { success: true, products: trending }, 3600),
      cacheService.set('categories', {}, { success: true, categories         }, 86400),
    ]);
    console.log(`✅ Cache préchauffé : featured(${featured.length}) trending(${trending.length}) categories(${categories.length})`);
  } catch (err) {
    console.warn('⚠️  Warmup partiel :', err.message);
  }
};

// ════════════════════════════════════════════════════════
// DÉMARRAGE
// ════════════════════════════════════════════════════════
const startServer = async () => {
  try {
    console.log('\n🚀 Fashion Store - BACKEND API v2.5.0\n');

    await connectDB();
    console.log('✅ MongoDB connecté');

    await connectRedis();
    console.log('✅ Redis connecté');

    patchCacheService(cacheService, {
      strategy: process.env.CACHE_STRATEGY ?? 'LRU',
      maxSize:  Number(process.env.CACHE_MAX ?? 500),
      ttl: {
        baseTTL:      Number(process.env.CACHE_BASE_TTL      ?? 300),
        minTTL:       Number(process.env.CACHE_MIN_TTL       ?? 30),
        maxTTL:       Number(process.env.CACHE_MAX_TTL       ?? 86400),
        hotThreshold: Number(process.env.CACHE_HOT_THRESHOLD ?? 10),
        coldAfterMs:  Number(process.env.CACHE_COLD_AFTER_MS ?? 600000),
      },
    });

    evictionEmitter.attach(cacheService);
    cacheService.startSnapshotTimer?.();
    await runCacheWarmup();

    // ✅ AJOUT : Initialiser le service de prédiction
    const redisClient = getRedisClientSafe();
    if (redisClient && redisClient.isOpen) {
      const predictionService = new PredictionService(redisClient, cacheService);
      setPredictionService(predictionService);
      await predictionService.initialize();
      console.log('✅ Service de prédiction initialisé');
    } else {
      console.warn('⚠️  Redis non disponible, service de prédiction désactivé');
    }

    httpServer.listen(PORT, () => {
      console.log(`\n✅ Serveur : http://localhost:${PORT}`);
      console.log(`   Webhook  : http://localhost:${PORT}/api/payments/webhook`);
      console.log(`   Livraisons: http://localhost:${PORT}/api/delivery`);
      console.log(`   Prédiction: http://localhost:${PORT}/api/prediction/dashboard\n`);
    });

  } catch (error) {
    console.error('❌ Erreur critique :', error.message);
    process.exit(1);
  }
};

process.on('SIGINT',  () => { io.close(); process.exit(0); });
process.on('SIGTERM', () => { io.close(); process.exit(0); });

startServer();
export default app;
