/**
 * Import produits avec vraies images Unsplash API → Cloudinary
 * 1. Chaque produit cherche une image correspondant à son nom+couleur+catégorie
 * 2. Upload direct dans Cloudinary
 * 3. URLs Cloudinary sauvegardées en MongoDB
 *
 * Prérequis dans .env :
 *   UNSPLASH_ACCESS_KEY=...   (gratuit sur unsplash.com/developers)
 *   CLOUDINARY_CLOUD_NAME=...
 *   CLOUDINARY_API_KEY=...
 *   CLOUDINARY_API_SECRET=...
 *   MONGODB_URI=...
 */

import fs                from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';
import mongoose          from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import dotenv            from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ════════════════════════════════════════════════════════════
// CONFIG CLOUDINARY
// ════════════════════════════════════════════════════════════
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// ════════════════════════════════════════════════════════════
// SCHÉMA MONGOOSE
// ════════════════════════════════════════════════════════════
const productSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  description:   { type: String, required: true },
  price:         { type: Number, required: true },
  originalPrice: { type: Number, default: null },
  category:      { type: String, required: true },
  gender:        { type: String, default: 'Unisexe' },
  sizes:         [String],
  colors:        [{ name: String, hex: String }],
  images:        [{ url: String, publicId: String, isMain: Boolean }],
  stock:         { type: Number, default: 10 },
  brand:         { type: String, default: 'Fashion Store' },
  material:      { type: String, default: '' },
  tags:          [String],
  featured:      { type: Boolean, default: false },
  trending:      { type: Boolean, default: false },
  isActive:      { type: Boolean, default: true },
  slug:          { type: String },
  rating:        {
    average: { type: Number, default: 0 },
    count:   { type: Number, default: 0 },
  },
  salesCount: { type: Number, default: 0 },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// ════════════════════════════════════════════════════════════
// MAPPINGS
// ════════════════════════════════════════════════════════════
const CATEGORY_MAP = {
  bags:        { fr: 'Sacs',        gender: 'Femme'   },
  't-shirts':  { fr: 'T-shirts',    gender: 'Unisexe' },
  shirts:      { fr: 'Chemises',    gender: 'Homme'   },
  shoes:       { fr: 'Chaussures',  gender: 'Unisexe' },
  accessories: { fr: 'Accessoires', gender: 'Unisexe' },
  dresses:     { fr: 'Robes',       gender: 'Femme'   },
  skirts:      { fr: 'Jupes',       gender: 'Femme'   },
  sweaters:    { fr: 'Pulls',       gender: 'Unisexe' },
  jackets:     { fr: 'Vestes',      gender: 'Unisexe' },
  shorts:      { fr: 'Shorts',      gender: 'Unisexe' },
  pants:       { fr: 'Pantalons',   gender: 'Unisexe' },
};

const COLOR_MAP = {
  gray:   { name: 'Gris',   hex: '#808080' },
  white:  { name: 'Blanc',  hex: '#FFFFFF' },
  red:    { name: 'Rouge',  hex: '#FF0000' },
  blue:   { name: 'Bleu',   hex: '#0000FF' },
  black:  { name: 'Noir',   hex: '#000000' },
  green:  { name: 'Vert',   hex: '#008000' },
  brown:  { name: 'Marron', hex: '#8B4513' },
  yellow: { name: 'Jaune',  hex: '#FFD700' },
};

// ════════════════════════════════════════════════════════════
// TERMES DE RECHERCHE UNSPLASH — précis par catégorie + couleur
// La clé = "catégorie:couleur" ou juste "catégorie"
// ════════════════════════════════════════════════════════════
const SEARCH_TERMS = {
  // ── Sacs ──────────────────────────────────────────────
  'bags:gray':   ['gray leather handbag fashion', 'grey shoulder bag woman'],
  'bags:white':  ['white leather bag fashion', 'white handbag elegant'],
  'bags:red':    ['red leather handbag', 'red fashion bag woman'],
  'bags:blue':   ['blue handbag fashion', 'navy blue bag woman'],
  'bags:black':  ['black leather handbag', 'black designer bag'],
  'bags:green':  ['green leather bag', 'green fashion handbag'],
  'bags:brown':  ['brown leather bag', 'tan leather handbag'],
  'bags:yellow': ['yellow handbag fashion', 'yellow bag woman'],
  'bags':        ['fashion handbag', 'leather bag woman'],

  // ── T-shirts ──────────────────────────────────────────
  't-shirts:gray':   ['gray t-shirt model fashion', 'grey tshirt man'],
  't-shirts:white':  ['white t-shirt fashion model', 'white tshirt clean'],
  't-shirts:red':    ['red t-shirt fashion', 'red tshirt model'],
  't-shirts:blue':   ['blue t-shirt fashion', 'navy tshirt model'],
  't-shirts:black':  ['black t-shirt fashion', 'black tshirt model'],
  't-shirts:green':  ['green t-shirt fashion', 'green tshirt model'],
  't-shirts:brown':  ['brown t-shirt fashion', 'beige tshirt model'],
  't-shirts:yellow': ['yellow t-shirt fashion', 'yellow tshirt model'],
  't-shirts':        ['fashion t-shirt model', 'casual tshirt'],

  // ── Chemises ──────────────────────────────────────────
  'shirts:gray':   ['gray dress shirt man fashion', 'grey shirt man'],
  'shirts:white':  ['white dress shirt man', 'white button shirt fashion'],
  'shirts:red':    ['red shirt man fashion', 'red button shirt'],
  'shirts:blue':   ['blue dress shirt man', 'light blue shirt fashion'],
  'shirts:black':  ['black shirt man fashion', 'black button down shirt'],
  'shirts:green':  ['green shirt man fashion', 'olive shirt man'],
  'shirts:brown':  ['brown shirt man', 'beige dress shirt'],
  'shirts:yellow': ['yellow shirt man', 'mustard shirt fashion'],
  'shirts':        ['dress shirt man fashion', 'button shirt man'],

  // ── Chaussures ────────────────────────────────────────
  'shoes:gray':   ['gray sneakers fashion', 'grey running shoes'],
  'shoes:white':  ['white sneakers fashion', 'white shoes clean'],
  'shoes:red':    ['red shoes fashion', 'red sneakers woman'],
  'shoes:blue':   ['blue sneakers fashion', 'navy shoes man'],
  'shoes:black':  ['black leather shoes', 'black dress shoes man'],
  'shoes:green':  ['green sneakers fashion', 'olive shoes'],
  'shoes:brown':  ['brown leather shoes', 'tan boots fashion'],
  'shoes:yellow': ['yellow sneakers fashion', 'yellow shoes'],
  'shoes':        ['fashion sneakers', 'stylish shoes'],

  // ── Accessoires ───────────────────────────────────────
  'accessories:gray':   ['gray fashion accessories', 'grey scarf fashion'],
  'accessories:white':  ['white fashion accessories', 'white belt fashion'],
  'accessories:red':    ['red fashion accessories', 'red scarf woman'],
  'accessories:blue':   ['blue fashion accessories', 'blue scarf fashion'],
  'accessories:black':  ['black fashion accessories', 'black belt leather'],
  'accessories:green':  ['green fashion accessories', 'green scarf'],
  'accessories:brown':  ['brown leather belt', 'brown leather accessories'],
  'accessories:yellow': ['yellow fashion accessories', 'yellow scarf'],
  'accessories':        ['fashion accessories', 'clothing accessories'],

  // ── Robes ─────────────────────────────────────────────
  'dresses:gray':   ['gray dress woman fashion', 'grey midi dress'],
  'dresses:white':  ['white dress woman fashion', 'white summer dress'],
  'dresses:red':    ['red dress woman fashion', 'red elegant dress'],
  'dresses:blue':   ['blue dress woman fashion', 'navy dress elegant'],
  'dresses:black':  ['black dress woman fashion', 'little black dress'],
  'dresses:green':  ['green dress woman fashion', 'emerald dress woman'],
  'dresses:brown':  ['brown dress woman', 'camel dress fashion'],
  'dresses:yellow': ['yellow dress woman fashion', 'yellow summer dress'],
  'dresses':        ['woman dress fashion', 'elegant dress model'],

  // ── Jupes ─────────────────────────────────────────────
  'skirts:gray':   ['gray skirt fashion woman', 'grey midi skirt'],
  'skirts:white':  ['white skirt woman fashion', 'white mini skirt'],
  'skirts:red':    ['red skirt woman fashion', 'red midi skirt'],
  'skirts:blue':   ['blue skirt woman fashion', 'denim skirt woman'],
  'skirts:black':  ['black skirt woman fashion', 'black midi skirt'],
  'skirts:green':  ['green skirt woman fashion', 'olive skirt'],
  'skirts:brown':  ['brown skirt woman', 'camel skirt fashion'],
  'skirts:yellow': ['yellow skirt woman', 'yellow mini skirt'],
  'skirts':        ['fashion skirt woman', 'woman skirt model'],

  // ── Pulls ─────────────────────────────────────────────
  'sweaters:gray':   ['gray knit sweater fashion', 'grey wool sweater'],
  'sweaters:white':  ['white sweater fashion', 'cream knit sweater'],
  'sweaters:red':    ['red sweater fashion', 'red knit pullover'],
  'sweaters:blue':   ['blue sweater fashion', 'navy knit sweater'],
  'sweaters:black':  ['black sweater fashion', 'black knit pullover'],
  'sweaters:green':  ['green sweater fashion', 'olive knit sweater'],
  'sweaters:brown':  ['brown sweater fashion', 'camel knit sweater'],
  'sweaters:yellow': ['yellow sweater fashion', 'mustard knit sweater'],
  'sweaters':        ['knit sweater fashion', 'wool pullover model'],

  // ── Vestes ────────────────────────────────────────────
  'jackets:gray':   ['gray jacket fashion', 'grey blazer man woman'],
  'jackets:white':  ['white jacket fashion', 'white blazer fashion'],
  'jackets:red':    ['red jacket fashion', 'red blazer woman'],
  'jackets:blue':   ['blue jacket fashion', 'navy blazer man'],
  'jackets:black':  ['black jacket fashion', 'black blazer model'],
  'jackets:green':  ['green jacket fashion', 'olive bomber jacket'],
  'jackets:brown':  ['brown leather jacket', 'brown jacket fashion'],
  'jackets:yellow': ['yellow jacket fashion', 'mustard jacket'],
  'jackets':        ['fashion jacket model', 'stylish blazer'],

  // ── Shorts ────────────────────────────────────────────
  'shorts:gray':   ['gray shorts fashion', 'grey chino shorts man'],
  'shorts:white':  ['white shorts fashion', 'white summer shorts'],
  'shorts:red':    ['red shorts fashion', 'red shorts man'],
  'shorts:blue':   ['blue shorts fashion', 'denim shorts woman'],
  'shorts:black':  ['black shorts fashion', 'black shorts man'],
  'shorts:green':  ['green shorts fashion', 'olive shorts man'],
  'shorts:brown':  ['khaki shorts man', 'brown chino shorts'],
  'shorts:yellow': ['yellow shorts fashion', 'yellow summer shorts'],
  'shorts':        ['fashion shorts model', 'summer shorts'],

  // ── Pantalons ─────────────────────────────────────────
  'pants:gray':   ['gray trousers fashion', 'grey dress pants man'],
  'pants:white':  ['white trousers fashion', 'white pants man woman'],
  'pants:red':    ['red trousers fashion', 'red pants fashion'],
  'pants:blue':   ['blue jeans fashion', 'denim jeans model'],
  'pants:black':  ['black trousers fashion', 'black dress pants'],
  'pants:green':  ['green trousers fashion', 'olive pants man'],
  'pants:brown':  ['brown trousers fashion', 'khaki pants man'],
  'pants:yellow': ['yellow trousers fashion', 'mustard pants fashion'],
  'pants':        ['fashion trousers model', 'jeans fashion model'],
};

// ════════════════════════════════════════════════════════════
// NOMS RÉELS DES PRODUITS
// ════════════════════════════════════════════════════════════
const PRODUCT_NAMES = {
  'Sacs':        ['Sac Cabas Cuir', 'Sac à Main Élégant', 'Sac Bandoulière Premium', 'Pochette Soirée', 'Sac Tote Luxe', 'Sac Shopping Chic', 'Mini Sac Tendance', 'Sac Baguette'],
  'T-shirts':    ['T-shirt Essentiel', 'T-shirt Col Rond', 'T-shirt Oversize', 'T-shirt Slim Fit', 'Tee Premium', 'T-shirt Graphique', 'T-shirt Basique Chic', 'T-shirt Sport'],
  'Chemises':    ['Chemise Oxford Classic', 'Chemise Lin Premium', 'Chemise Business', 'Chemise Casual Chic', 'Chemise Flanelle', 'Chemise Popeline'],
  'Chaussures':  ['Sneakers Running', 'Boots Chelsea', 'Mocassins Cuir', 'Sandales Été', 'Baskets Lifestyle', 'Bottines Talon', 'Derby Cuir', 'Sneakers Plateforme'],
  'Accessoires': ['Ceinture Cuir', 'Écharpe Laine', 'Casquette Streetwear', 'Bonnet Tricoté', 'Gants Cuir', 'Montre Bracelet', 'Lunettes de Soleil', 'Chapeau Paille'],
  'Robes':       ['Robe Midi Élégante', 'Robe Portefeuille', 'Robe Cocktail', 'Robe Bohème', 'Robe Été Légère', 'Robe Soirée Glamour', 'Robe Fleurie'],
  'Jupes':       ['Jupe Midi Plissée', 'Jupe Crayon', 'Mini Jupe Jean', 'Jupe Longue Fluide', 'Jupe Trapèze', 'Jupe Asymétrique'],
  'Pulls':       ['Pull Col V Laine', 'Cardigan Oversize', 'Pull Torsadé', 'Sweat Molleton', 'Pull Fine Maille', 'Cardigan Boutonné', 'Pull Col Roulé'],
  'Vestes':      ['Veste Blazer Structuré', 'Veste Denim', 'Veste Cuir', 'Veste Zippée', 'Veste Sport Chic', 'Bomber Premium'],
  'Shorts':      ['Short Chino', 'Short Running', 'Short Jean Délavé', 'Short Bermuda', 'Short Sport', 'Short Cycliste'],
  'Pantalons':   ['Pantalon Chino', 'Jean Slim Premium', 'Pantalon Large', 'Jean Droit', 'Pantalon de Ville', 'Jogging Coton', 'Pantalon Cargo'],
};

// ════════════════════════════════════════════════════════════
// UNSPLASH API — chercher une image précise
// ════════════════════════════════════════════════════════════
const unsplashCache = new Map(); // éviter les requêtes dupliquées

async function searchUnsplash(category, color) {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null;

  const key        = `${category}:${color}`;
  const keyGeneric = category;

  // Termes de recherche spécifiques couleur+catégorie, sinon catégorie seule
  const terms = SEARCH_TERMS[key] || SEARCH_TERMS[keyGeneric] || [`${color} ${category} fashion clothing`];

  // Alterner entre les termes pour avoir de la variété
  const term = terms[Math.floor(Math.random() * terms.length)];

  // Cache local pour ne pas refaire la même recherche
  if (unsplashCache.has(term)) {
    const cached = unsplashCache.get(term);
    // Retourner une URL aléatoire parmi les résultats cachés
    return cached[Math.floor(Math.random() * cached.length)];
  }

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(term)}&per_page=10&orientation=portrait&content_filter=high`;
    const res  = await fetch(url, {
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
    });

    if (!res.ok) {
      if (res.status === 403) {
        console.warn('\n⚠️  Limite Unsplash atteinte — utilisation fallback URLs');
        return null;
      }
      return null;
    }

    const data    = await res.json();
    const results = data.results || [];

    if (!results.length) return null;

    // Stocker les URLs dans le cache
    const urls = results.map(r => r.urls.regular); // 1080px max, parfait pour Cloudinary
    unsplashCache.set(term, urls);

    return urls[Math.floor(Math.random() * urls.length)];

  } catch (err) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// FALLBACK — URLs Unsplash statiques fiables si API indisponible
// ════════════════════════════════════════════════════════════
const FALLBACK_URLS = {
  'Sacs':        ['https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=90', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800&q=90', 'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800&q=90'],
  'T-shirts':    ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=90', 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=90', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=90'],
  'Chemises':    ['https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=90', 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&q=90', 'https://images.unsplash.com/photo-1598032895397-b9372144ac5d?w=800&q=90'],
  'Chaussures':  ['https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=90', 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=800&q=90', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=90'],
  'Accessoires': ['https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=90', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=800&q=90', 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=800&q=90'],
  'Robes':       ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=90', 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800&q=90', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800&q=90'],
  'Jupes':       ['https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=800&q=90', 'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&q=90', 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=800&q=90'],
  'Pulls':       ['https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&q=90', 'https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?w=800&q=90', 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800&q=90'],
  'Vestes':      ['https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=90', 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=90', 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=800&q=90'],
  'Shorts':      ['https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&q=90', 'https://images.unsplash.com/photo-1519235106638-30cc49b5dbc5?w=800&q=90', 'https://images.unsplash.com/photo-1598522325074-042db73aa4e6?w=800&q=90'],
  'Pantalons':   ['https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=90', 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=90', 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800&q=90'],
};

// Compteurs par catégorie pour varier les fallback
const fallbackCounters = {};

function getFallbackUrl(catFr) {
  const urls = FALLBACK_URLS[catFr] || FALLBACK_URLS['T-shirts'];
  fallbackCounters[catFr] = fallbackCounters[catFr] || 0;
  const url = urls[fallbackCounters[catFr] % urls.length];
  fallbackCounters[catFr]++;
  return url;
}

// ════════════════════════════════════════════════════════════
// UPLOAD VERS CLOUDINARY (avec retry)
// ════════════════════════════════════════════════════════════
async function uploadToCloudinary(imageUrl, folder, productName) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await cloudinary.uploader.upload(imageUrl, {
        folder,
        use_filename:    false,
        unique_filename: true,
        transformation: [
          {
            width:        900,
            height:       1100,
            crop:         'fill',     // recadrage intelligent centré sur le sujet
            gravity:      'auto',     // Cloudinary détecte automatiquement le sujet
            quality:      'auto:best',
            fetch_format: 'auto',     // WebP si possible
          }
        ],
        // Tags pour organisation dans Cloudinary
        tags: ['fashion-store', 'product', folder.split('/').pop()],
      });

      return {
        url:      result.secure_url,
        publicId: result.public_id,
      };

    } catch (err) {
      if (attempt === 3) {
        console.error(`    ❌ Cloudinary upload échoué [${productName}]: ${err.message}`);
        return null;
      }
      // Attendre avant retry
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

// ════════════════════════════════════════════════════════════
// GÉNÉRER SLUG UNIQUE
// ════════════════════════════════════════════════════════════
function generateSlug(name, id) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() + '-' + id;
}

// ════════════════════════════════════════════════════════════
// SCRIPT PRINCIPAL
// ════════════════════════════════════════════════════════════
async function importProducts() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   Fashion Store — Import avec images réelles via Unsplash API');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ── Vérifications ────────────────────────────────────
  const required = ['MONGODB_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('❌ Variables manquantes dans .env :', missing.join(', '));
    process.exit(1);
  }

  const hasUnsplash = !!process.env.UNSPLASH_ACCESS_KEY;
  if (!hasUnsplash) {
    console.warn('⚠️  UNSPLASH_ACCESS_KEY non définie → fallback sur URLs statiques');
    console.warn('   Pour de meilleures images : créez un compte sur unsplash.com/developers');
    console.warn('');
  } else {
    console.log('✅ Unsplash API configurée — recherche d\'images précises activée');
  }

  // ── Test Cloudinary ───────────────────────────────────
  try {
    await cloudinary.api.ping();
    console.log('✅ Cloudinary connecté — cloud:', process.env.CLOUDINARY_CLOUD_NAME);
  } catch {
    console.error('❌ Connexion Cloudinary échouée');
    process.exit(1);
  }

  // ── MongoDB ───────────────────────────────────────────
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connecté');
  console.log('');

  // ── Lire JSON ─────────────────────────────────────────
  const jsonPath = path.join(__dirname, '..', 'clothes_import.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Fichier non trouvé : ${jsonPath}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`📦 ${rawData.length} produits à importer`);

  // ── Nettoyer l'ancien contenu ─────────────────────────
  const existing    = await Product.find({}, 'images');
  const oldPubIds   = existing.flatMap(p => p.images).map(i => i.publicId).filter(Boolean);
  if (oldPubIds.length) {
    process.stdout.write(`🗑️  Suppression ${oldPubIds.length} images Cloudinary...`);
    for (let i = 0; i < oldPubIds.length; i += 100) {
      await cloudinary.api.delete_resources(oldPubIds.slice(i, i + 100));
    }
    console.log(' OK');
  }
  await Product.deleteMany({});
  console.log('🗑️  Base nettoyée');
  console.log('');
  console.log('🚀 Début de l\'import...');
  console.log('');

  // ── Traiter chaque produit ────────────────────────────
  const products   = [];
  let countSuccess = 0;
  let countFallback = 0;

  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];

    const catInfo   = CATEGORY_MAP[item.category] || { fr: 'Accessoires', gender: 'Unisexe' };
    const colorInfo = COLOR_MAP[item.color]        || { name: item.color, hex: '#000000' };
    const catFr     = catInfo.fr;
    const catSlug   = catFr.toLowerCase().replace(/\s+/g, '-');
    const folder    = `fashion-store/products/${catSlug}`;

    // Nom du produit réel
    const namePool  = PRODUCT_NAMES[catFr] || [`Article ${catFr}`];
    const baseName  = namePool[i % namePool.length];
    const fullName  = `${baseName} ${colorInfo.name} — ${item.brand}`;

    process.stdout.write(`  [${String(i + 1).padStart(2)}/${rawData.length}] ${fullName.slice(0, 55).padEnd(55)} `);

    // ── Chercher image via Unsplash API ──────────────────
    let imageUrl = null;
    let source   = 'fallback';

    if (hasUnsplash) {
      imageUrl = await searchUnsplash(item.category, item.color);
      if (imageUrl) source = 'unsplash';
      // Petit délai pour respecter le rate limit Unsplash (50 req/heure en démo)
      await new Promise(r => setTimeout(r, 300));
    }

    // Fallback si Unsplash indisponible ou sans clé
    if (!imageUrl) {
      imageUrl = getFallbackUrl(catFr);
    }

    // ── Upload vers Cloudinary ───────────────────────────
    const uploaded = await uploadToCloudinary(imageUrl, folder, fullName);

    let images;
    if (uploaded) {
      images = [{ url: uploaded.url, publicId: uploaded.publicId, isMain: true }];
      countSuccess++;
      process.stdout.write(`✅ [${source}]\n`);
    } else {
      // En cas d'échec total : stocker l'URL brute sans Cloudinary
      images = [{ url: imageUrl, publicId: null, isMain: true }];
      countFallback++;
      process.stdout.write(`⚠️  [url brute]\n`);
    }

    // ── Construire le produit ────────────────────────────
    const isNew         = item.condition === 'new';
    const price         = Math.round(item.price);
    const originalPrice = !isNew ? Math.round(price * (1.2 + Math.random() * 0.15)) : null;

    products.push({
      name:          fullName,
      description:   buildDescription(baseName, colorInfo.name, item.brand, item.condition, item.size, catFr),
      price,
      originalPrice,
      category:      catFr,
      gender:        catInfo.gender,
      sizes:         buildSizes(item.category),
      colors:        [colorInfo],
      images,
      stock:         Math.floor(Math.random() * 45) + 5,
      brand:         item.brand,
      material:      getMaterial(catFr),
      tags:          [catFr.toLowerCase(), item.brand.toLowerCase(), colorInfo.name.toLowerCase(), item.condition],
      featured:      Math.random() > 0.75,
      trending:      Math.random() > 0.80,
      isActive:      true,
      slug:          generateSlug(fullName, item.id),
      rating: {
        average: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
        count:   Math.floor(Math.random() * 300) + 10,
      },
      salesCount: Math.floor(Math.random() * 200),
    });
  }

  // ── Insertion MongoDB ─────────────────────────────────
  console.log('');
  console.log('💾 Insertion en base...');
  const result = await Product.insertMany(products, { ordered: false });

  // ── Rapport final ─────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅ ${result.length} produits importés`);
  console.log(`☁️  ${countSuccess} images uploadées sur Cloudinary`);
  if (countFallback > 0) console.log(`⚠️  ${countFallback} images en URL brute (upload échoué)`);
  console.log('');

  const stats = await Product.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } },
    { $sort: { count: -1 } },
  ]);

  console.log('📊 Répartition :');
  console.log('─'.repeat(50));
  stats.forEach(s => {
    console.log(`   ${s._id.padEnd(14)} : ${String(s.count).padStart(2)} produits | moy. ${Math.round(s.avgPrice)} €`);
  });

  const sample = await Product.findOne().lean();
  if (sample) {
    console.log('');
    console.log('📸 Exemple :');
    console.log(`   Nom   : ${sample.name}`);
    console.log(`   Image : ${sample.images[0]?.url}`);
    console.log(`   Prix  : ${sample.price} €`);
  }

  console.log('');
  console.log('✅ Import terminé !');
  console.log('═══════════════════════════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function buildDescription(baseName, color, brand, condition, size, category) {
  const conditionFr = {
    new:      'Neuf avec étiquette',
    'like new': 'Comme neuf, porté une fois',
    good:     'Bon état général',
    fair:     'État correct, légères traces d\'usage',
  }[condition] || condition;

  return `${baseName} ${color} de la marque ${brand}. ${conditionFr}. Taille ${size.toUpperCase()} disponible. Idéal pour compléter votre garde-robe avec un style ${category.toLowerCase()} tendance et élégant.`;
}

function buildSizes(rawCategory) {
  if (rawCategory === 'shoes') {
    return ['36EU', '37EU', '38EU', '39EU', '40EU', '41EU', '42EU'];
  }
  if (['accessories', 'bags'].includes(rawCategory)) {
    return ['Taille unique'];
  }
  return ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
}

function getMaterial(catFr) {
  const map = {
    'T-shirts': 'Coton 100%',
    'Chemises': 'Coton Oxford',
    'Pulls':    'Laine mélangée',
    'Vestes':   'Polyester',
    'Shorts':   'Coton',
    'Pantalons':'Denim / Coton',
    'Robes':    'Viscose',
    'Jupes':    'Polyester',
    'Sacs':     'Cuir synthétique',
    'Chaussures':'Cuir / Textile',
    'Accessoires':'Matières mixtes',
  };
  return map[catFr] || '';
}

// ════════════════════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════════════════════
importProducts().catch(err => {
  console.error('\n❌ Erreur fatale :', err.message);
  mongoose.disconnect();
  process.exit(1);
});
