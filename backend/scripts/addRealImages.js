import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const productSchema = new mongoose.Schema({}, { strict: false });
const Product = mongoose.model('Product', productSchema);

// ════════════════════════════════════════════════════════════
// IMAGES PAR CATÉGORIE - Toutes les catégories du JSON
// ════════════════════════════════════════════════════════════

const imagesByCategory = {
  // BAGS - Sacs
  'Sacs': [
    'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800&q=80',
    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80',
    'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800&q=80',
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&q=80',
    'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800&q=80',
    'https://images.unsplash.com/photo-1564222195116-8a74a96b2c8c?w=800&q=80'
  ],

  // T-SHIRTS
  'T-shirts': [
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
    'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80',
    'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80',
    'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=800&q=80',
    'https://images.unsplash.com/photo-1503341338985-a0fb6b6244b9?w=800&q=80',
    'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=800&q=80'
  ],

  // SHIRTS - Chemises
  'Chemises': [
    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80',
    'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&q=80',
    'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&q=80',
    'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=800&q=80',
    'https://images.unsplash.com/photo-1598032895397-b9372144ac5d?w=800&q=80',
    'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800&q=80'
  ],

  // SHOES - Chaussures
  'Chaussures': [
    'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80',
    'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=800&q=80',
    'https://images.unsplash.com/photo-1605348532760-6753d2c43329?w=800&q=80',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80',
    'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80',
    'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&q=80'
  ],

  // ACCESSORIES - Accessoires
  'Accessoires': [
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80',
    'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=800&q=80',
    'https://images.unsplash.com/photo-1585487000143-6392b53310ba?w=800&q=80',
    'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=800&q=80',
    'https://images.unsplash.com/photo-1509941943102-10c232535736?w=800&q=80',
    'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&q=80'
  ],

  // DRESSES - Robes
  'Robes': [
    'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80',
    'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&q=80',
    'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80',
    'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&q=80',
    'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800&q=80',
    'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=800&q=80'
  ],

  // SKIRTS - Jupes
  'Jupes': [
    'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=800&q=80',
    'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&q=80',
    'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&q=80',
    'https://images.unsplash.com/photo-1583496663440-2e33ffc2e56f?w=800&q=80',
    'https://images.unsplash.com/photo-1594633313593-bab3825d0caf?w=800&q=80'
  ],

  // SWEATERS - Pulls
  'Pulls': [
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&q=80',
    'https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?w=800&q=80',
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800&q=80',
    'https://images.unsplash.com/photo-1609873814058-a8928d7ef31a?w=800&q=80',
    'https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=800&q=80',
    'https://images.unsplash.com/photo-1620799139834-6b8f844fbe61?w=800&q=80'
  ],

  // JACKETS - Vestes
  'Vestes': [
    'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80',
    'https://images.unsplash.com/photo-1544923408-75c5cef46f14?w=800&q=80',
    'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=800&q=80',
    'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800&q=80',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80'
  ],

  // SHORTS
  'Shorts': [
    'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&q=80',
    'https://images.unsplash.com/photo-1591195850446-34c271d0b9b1?w=800&q=80',
    'https://images.unsplash.com/photo-1519235106638-30cc49b5dbc5?w=800&q=80',
    'https://images.unsplash.com/photo-1591195845219-d3eebdfd8321?w=800&q=80',
    'https://images.unsplash.com/photo-1598522325074-042db73aa4e6?w=800&q=80'
  ],

  // PANTS - Pantalons
  'Pantalons': [
    'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80',
    'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80',
    'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800&q=80',
    'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=800&q=80',
    'https://images.unsplash.com/photo-1541840031508-326b77c9a17e?w=800&q=80',
    'https://images.unsplash.com/photo-1517438476312-10d79c077509?w=800&q=80'
  ]
};

// Images par défaut
const defaultImages = [
  'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80'
];

// ════════════════════════════════════════════════════════════
// FONCTION : Sélectionner des images aléatoires
// ════════════════════════════════════════════════════════════
function getRandomImages(category, count = 3) {
  const images = imagesByCategory[category] || defaultImages;
  const selected = [];
  const usedIndices = new Set();

  for (let i = 0; i < count && i < images.length; i++) {
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * images.length);
    } while (usedIndices.has(randomIndex));

    usedIndices.add(randomIndex);
    selected.push({
      url: images[randomIndex],
      isMain: i === 0
    });
  }

  return selected;
}

// ════════════════════════════════════════════════════════════
// SCRIPT PRINCIPAL
// ════════════════════════════════════════════════════════════
async function addImagesToProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connecté\n');

    const products = await Product.find({});
    console.log(`📦 ${products.length} produits trouvés\n`);

    let updated = 0;
    const categoryStats = {};

    for (const product of products) {
      const images = getRandomImages(product.category, 3);

      // Statistiques par catégorie
      categoryStats[product.category] = (categoryStats[product.category] || 0) + 1;

      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            images: images,
            sizes: product.sizes || ['XS', 'S', 'M', 'L', 'XL'],
            name: `${product.category} ${product.brand} ${product.color}`.trim()
          }
        }
      );

      updated++;

      if (updated % 10 === 0) {
        process.stdout.write(`\r✅ ${updated}/${products.length} produits mis à jour...`);
      }
    }

    console.log(`\n\n🎉 ${updated} produits mis à jour avec succès !\n`);

    // Afficher les statistiques
    console.log('📊 Répartition par catégorie :');
    console.log('═'.repeat(50));
    Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        const hasImages = imagesByCategory[cat] ? '✅' : '⚠️ ';
        console.log(`${hasImages} ${cat.padEnd(20)} : ${count} produits`);
      });

    // Afficher quelques exemples
    console.log('\n📸 Exemples de produits :');
    console.log('═'.repeat(50));
    const samples = await Product.find({}).limit(5);
    samples.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.name}`);
      console.log(`   Catégorie: ${p.category}`);
      console.log(`   Images: ${p.images.length}`);
      console.log(`   URL: ${p.images[0]?.url.substring(0, 60)}...`);
    });

    mongoose.disconnect();
    console.log('\n✅ Import terminé ! Les produits ont maintenant de vraies images.\n');

  } catch (error) {
    console.error('\n❌ Erreur:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}

// Exécuter
addImagesToProducts();
