import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';

import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import adminRoutes from './routes/admin.js';
import adminProductRoutes from './routes/admin.product.routes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ════════════════════════════════════════════════════════════
// MIDDLEWARE CORS
// ════════════════════════════════════════════════════════════
const corsOptions = {
  origin: [
    'http://localhost:4200',
    'http://localhost:5114',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:5114'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));  // ✅ CORS appliqué globalement

// ════════════════════════════════════════════════════════════
// MIDDLEWARE PARSING
// ════════════════════════════════════════════════════════════
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ════════════════════════════════════════════════════════════
// STATIC FILES
// ════════════════════════════════════════════════════════════
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    message: '🛍️ MAISON ÉLITE API',
    status: 'running',
    version: '2.0.0',
    features: [
      '✅ Cache 3 Niveaux (L1/L2/L3)',
      '✅ Redis + Mémoire',
      '✅ Invalidation Automatique',
      '✅ Métriques Temps Réel'
    ]
  });
});

// ════════════════════════════════════════════════════════════
// ROUTES API
// ════════════════════════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminProductRoutes);

// ════════════════════════════════════════════════════════════
// 404 HANDLER
// ════════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} introuvable`
  });
});

// ════════════════════════════════════════════════════════════
// ERROR HANDLER
// ════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('❌ Erreur:', err.message);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Fichier trop grand (max 5MB)'
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Maximum 5 images'
    });
  }

  res.status(500).json({
    success: false,
    message: err.message || 'Erreur serveur interne'
  });
});

// ════════════════════════════════════════════════════════════
// DÉMARRAGE SERVEUR
// ════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    console.log('\n🚀 ══════════════════════════════════════');
    console.log('   Fashion Store - BACKEND API');
    console.log('🚀 ══════════════════════════════════════\n');

    // 1. Connexion MongoDB
    console.log('📦 Connexion MongoDB...');
    await connectDB();

    // 2. Connexion Redis
    console.log('🔴 Connexion Redis...');
    await connectRedis();

    // 3. Démarrer le serveur
    app.listen(PORT, () => {
      console.log('\n✅ ══════════════════════════════════════');
      console.log(`   Serveur démarré : http://localhost:${PORT}`);
      console.log(`   Uploads        : http://localhost:${PORT}/uploads`);
      console.log(`   Cache Metrics  : http://localhost:${PORT}/api/products/admin/cache/metrics`);
      console.log('✅ ══════════════════════════════════════\n');
      console.log('💡 Cache 3 niveaux actif (L1: Mémoire, L2: Redis, L3: MongoDB)');
      console.log('💡 Métriques: GET /api/products/admin/cache/metrics\n');
    });

  } catch (error) {
    console.error('\n❌ Erreur démarrage serveur:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

// Gestion arrêt gracieux
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Arrêt du serveur...');
  process.exit(0);
});

// Démarrer
startServer();

export default app;
