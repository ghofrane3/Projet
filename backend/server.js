import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';

import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import adminRoutes from './routes/admin.js';
import adminProductRoutes from './routes/admin.product.routes.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({
  origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('/', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.json({ message: '🛍️ Fashion Store API', status: 'running', version: '2.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminProductRoutes);

app.use('/', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} introuvable` });
});

app.use((err, req, res, next) => {
  console.error('Erreur:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'Fichier trop grand (max 5MB)' });
  if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ success: false, message: 'Max 5 images' });
  res.status(500).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 5000;
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log('\n🚀 ══════════════════════════════════════');
      console.log(`✅ Serveur démarré : http://localhost:${PORT}`);
      console.log(`📁 Uploads        : http://localhost:${PORT}/uploads`);
      console.log('🚀 ══════════════════════════════════════\n');
    });
  } catch (error) {
    console.error('Erreur démarrage:', error.message);
    process.exit(1);
  }
};
startServer();
export default app;
