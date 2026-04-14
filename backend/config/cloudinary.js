import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// ════════════════════════════════════════════════════════════
// CONFIGURATION CLOUDINARY
// ════════════════════════════════════════════════════════════
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// ════════════════════════════════════════════════════════════
// STORAGE MULTER → CLOUDINARY (upload direct, pas de disque local)
// ════════════════════════════════════════════════════════════
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Détecter la catégorie depuis le body pour organiser les dossiers
    const category = (req.body?.category || 'general')
      .toLowerCase()
      .replace(/\s+/g, '-');

    return {
      folder:         `fashion-store/products/${category}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        // Redimensionner automatiquement + optimiser qualité
        { width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
      ],
      // Nom public unique dans Cloudinary
      public_id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  },
});

// ════════════════════════════════════════════════════════════
// MULTER avec Cloudinary storage
// ════════════════════════════════════════════════════════════
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
    files:    5,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // ✅ CORRECTION : Ne pas passer de 2ème argument avec une Error
      // La signature est : cb(error) ou cb(null, boolean)
      cb(new Error('Format non supporté. Utilisez JPG, PNG ou WebP'));
    }
  },
});

// ════════════════════════════════════════════════════════════
// UTILITAIRES CLOUDINARY
// ════════════════════════════════════════════════════════════

/**
 * Supprimer une image de Cloudinary par son public_id
 */
export const deleteImage = async (publicId) => {
  if (!publicId) return;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`🗑️  Cloudinary DELETE: ${publicId} → ${result.result}`);
    return result;
  } catch (err) {
    console.error('❌ Erreur suppression Cloudinary:', err.message);
  }
};

/**
 * Supprimer plusieurs images en batch
 */
export const deleteImages = async (publicIds = []) => {
  const valid = publicIds.filter(Boolean);
  if (!valid.length) return;
  try {
    const result = await cloudinary.api.delete_resources(valid);
    console.log(`🗑️  Cloudinary DELETE batch: ${valid.length} images`);
    return result;
  } catch (err) {
    console.error('❌ Erreur suppression batch Cloudinary:', err.message);
  }
};

/**
 * Générer une URL optimisée avec transformations à la volée
 * @param {string} publicId - ID Cloudinary de l'image
 * @param {object} opts - Options de transformation
 */
export const getOptimizedUrl = (publicId, opts = {}) => {
  const defaults = {
    quality:      'auto',
    fetch_format: 'auto',
    width:        800,
    crop:         'limit',
  };
  return cloudinary.url(publicId, { ...defaults, ...opts });
};

/**
 * Upload depuis une URL distante (pour migrer les images Unsplash existantes)
 */
export const uploadFromUrl = async (url, folder = 'fashion-store/products/migration') => {
  try {
    const result = await cloudinary.uploader.upload(url, {
      folder,
      transformation: [
        { width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
      ],
    });
    console.log(`☁️  Cloudinary UPLOAD URL: ${result.public_id}`);
    return {
      url:      result.secure_url,
      publicId: result.public_id,
      width:    result.width,
      height:   result.height,
    };
  } catch (err) {
    console.error('❌ Erreur upload URL Cloudinary:', err.message);
    return null;
  }
};

export default cloudinary;
