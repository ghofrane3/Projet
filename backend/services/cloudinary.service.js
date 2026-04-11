const cloudinary = require('../config/cloudinary');
const axios = require('axios');

class CloudinaryService {

  /**
   * Upload une image depuis une URL vers Cloudinary
   * @param {string} imageUrl - URL de l'image à uploader
   * @param {object} options - Options d'upload
   * @returns {Promise<object>} - Résultat de l'upload
   */
  async uploadFromUrl(imageUrl, options = {}) {
    try {
      const defaultOptions = {
        folder: process.env.CLOUDINARY_FOLDER || 'products',
        transformation: [
          { width: 1000, height: 1000, crop: 'limit' },
          { quality: 'auto:best' },
          { fetch_format: 'auto' }
        ],
        ...options
      };

      const result = await cloudinary.uploader.upload(imageUrl, defaultOptions);

      return {
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format
      };
    } catch (error) {
      console.error('Erreur upload Cloudinary:', error.message);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Upload plusieurs images en parallèle
   * @param {Array<string>} imageUrls - Tableau d'URLs
   * @param {string} category - Catégorie pour organisation
   * @returns {Promise<Array>} - Résultats des uploads
   */
  async uploadMultipleFromUrls(imageUrls, category = 'general') {
    try {
      const uploadPromises = imageUrls.map((url, index) =>
        this.uploadFromUrl(url, {
          folder: `${process.env.CLOUDINARY_FOLDER}/${category}`,
          public_id: `${category}_${Date.now()}_${index}`
        })
      );

      const results = await Promise.allSettled(uploadPromises);

      return results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
    } catch (error) {
      console.error('Erreur upload multiple:', error);
      throw error;
    }
  }

  /**
   * Supprimer une image de Cloudinary
   * @param {string} publicId - ID public de l'image
   */
  async deleteImage(publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
      console.log(`✅ Image supprimée: ${publicId}`);
    } catch (error) {
      console.error('Erreur suppression:', error);
    }
  }

  /**
   * Générer des transformations d'image
   * @param {string} publicId - ID de l'image
   * @param {object} transformations - Transformations à appliquer
   */
  getTransformedUrl(publicId, transformations = {}) {
    return cloudinary.url(publicId, {
      transformation: [
        { quality: 'auto' },
        { fetch_format: 'auto' },
        ...Object.entries(transformations)
      ]
    });
  }

  /**
   * Créer plusieurs versions d'une image
   * @param {string} publicId - ID de l'image source
   */
  createImageVariants(publicId) {
    return {
      thumbnail: cloudinary.url(publicId, {
        transformation: [
          { width: 200, height: 200, crop: 'fill' },
          { quality: 'auto' }
        ]
      }),
      small: cloudinary.url(publicId, {
        transformation: [
          { width: 400, height: 400, crop: 'limit' },
          { quality: 'auto' }
        ]
      }),
      medium: cloudinary.url(publicId, {
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto' }
        ]
      }),
      large: cloudinary.url(publicId, {
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto:best' }
        ]
      }),
      original: cloudinary.url(publicId)
    };
  }
}

module.exports = new CloudinaryService();
