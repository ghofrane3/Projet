import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Schéma Product
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  gender: { type: String, default: 'Unisexe' },
  size: { type: String },
  color: { type: String },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  brand: { type: String },
  condition: { type: String },
  stock: { type: Number, default: 10 },
  description: String,
  images: [{ url: String, isMain: Boolean }],
  sizes: [String],
  colors: [{ name: String, hex: String }],
  featured: { type: Boolean, default: false },
  trending: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// Mapping catégories
const categoryMapping = {
  'bags': { fr: 'Sacs', gender: 'Unisexe' },
  't-shirts': { fr: 'T-shirts', gender: 'Unisexe' },
  'shirts': { fr: 'Chemises', gender: 'Homme' },
  'shoes': { fr: 'Chaussures', gender: 'Unisexe' },
  'accessories': { fr: 'Accessoires', gender: 'Unisexe' },
  'dresses': { fr: 'Robes', gender: 'Femme' },
  'skirts': { fr: 'Jupes', gender: 'Femme' },
  'sweaters': { fr: 'Pulls', gender: 'Unisexe' },
  'jackets': { fr: 'Vestes', gender: 'Unisexe' },
  'shorts': { fr: 'Shorts', gender: 'Unisexe' },
  'pants': { fr: 'Pantalons', gender: 'Unisexe' }
};

// Mapping couleurs avec hex
const colorMapping = {
  'gray': { name: 'Gris', hex: '#808080' },
  'white': { name: 'Blanc', hex: '#FFFFFF' },
  'red': { name: 'Rouge', hex: '#FF0000' },
  'blue': { name: 'Bleu', hex: '#0000FF' },
  'black': { name: 'Noir', hex: '#000000' },
  'green': { name: 'Vert', hex: '#008000' },
  'brown': { name: 'Marron', hex: '#8B4513' },
  'yellow': { name: 'Jaune', hex: '#FFFF00' }
};

// Images placeholder
const generateImages = (category, color) => {
  return [
    {
      url: `https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800`,
      isMain: true
    },
    {
      url: `https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=800`,
      isMain: false
    }
  ];
};

async function importProducts() {
  try {
    // Connexion MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connecté');

    // Lire le fichier JSON
    const jsonData = fs.readFileSync('./clothes_import.json', 'utf8');
    const clothesData = JSON.parse(jsonData);

    console.log(`📦 ${clothesData.length} produits à importer...`);

    // Supprimer les anciens produits (optionnel)
    await Product.deleteMany({});
    console.log('🗑️  Anciens produits supprimés');

    // Transformer et insérer
    const products = clothesData.map(item => {
      const catInfo = categoryMapping[item.category] || { fr: item.category, gender: 'Unisexe' };
      const colorInfo = colorMapping[item.color] || { name: item.color, hex: '#000000' };

      return {
        name: item.name,
        category: catInfo.fr,
        gender: catInfo.gender,
        size: item.size.toUpperCase(),
        color: colorInfo.name,
        price: Math.round(item.price),
        originalPrice: item.condition === 'new' ? null : Math.round(item.price * 1.3),
        brand: item.brand,
        condition: item.condition,
        stock: Math.floor(Math.random() * 50) + 5,
        description: `${item.name} de la marque ${item.brand}. Condition: ${item.condition}. Taille: ${item.size.toUpperCase()}.`,
        images: generateImages(item.category, item.color),
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
        colors: [colorInfo],
        featured: Math.random() > 0.8,
        trending: Math.random() > 0.85,
        createdAt: new Date(item.date_added)
      };
    });

    // Insertion en masse
    const result = await Product.insertMany(products);
    console.log(`✅ ${result.length} produits importés avec succès !`);

    // Statistiques
    const stats = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📊 Statistiques par catégorie:');
    stats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count} produits`);
    });

    mongoose.disconnect();
    console.log('\n✅ Import terminé !');

  } catch (error) {
    console.error('❌ Erreur:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}

// Exécuter
importProducts();
