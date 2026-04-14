/**
 * Import produits avec images locales → Cloudinary → MongoDB
 * Mapping DÉTERMINISTE par GENRE + CATÉGORIE + COULEUR
 * Chaque catégorie JSON pointe vers le bon dossier assets (Femme/ ou homme/)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose             from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import dotenv               from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ASSETS_ROOT = path.resolve(__dirname, '../../src/assets');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key   : process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure    : true,
});

// ════════════════════════════════════════════════════════════
// MAPPING CATÉGORIE JSON → dossier assets + genre + libellé FR
// ════════════════════════════════════════════════════════════
const CATEGORY_MAP = {
  // ── Sacs ─────────────────────────────────────────────────
  bags              : { fr: 'Sacs',        folder: 'Femme/bags',              gender: 'Femme'  },

  // ── Chemises ──────────────────────────────────────────────
  shirts_femme      : { fr: 'Chemises',    folder: 'Femme/chemise',           gender: 'Femme'  },
  shirts_homme      : { fr: 'Chemises',    folder: 'homme/chemise',           gender: 'Homme'  },

  // ── T-shirts / Pulls ──────────────────────────────────────
  tshirts_femme     : { fr: 'T-shirts',    folder: 'Femme/T-shirt',           gender: 'Femme'  },
  tshirts_homme     : { fr: 'T-shirts',    folder: 'homme/T-shirt',           gender: 'Homme'  },

  // ── Sweaters ──────────────────────────────────────────────
  sweaters_femme    : { fr: 'Pulls',       folder: 'Femme/sweaters',          gender: 'Femme'  },
  sweaters_homme    : { fr: 'Pulls',       folder: 'homme/sweaters',          gender: 'Homme'  },

  // ── Sneakers / Chaussures ─────────────────────────────────
  shoes_femme       : { fr: 'Chaussures',  folder: 'Femme/sneakers',          gender: 'Femme'  },
  shoes_homme       : { fr: 'Chaussures',  folder: 'homme/sneakers',          gender: 'Homme'  },

  // ── Accessoires ───────────────────────────────────────────
  accessories_femme : { fr: 'Accessoires', folder: 'Femme/accessoires',       gender: 'Femme'  },
  accessories_homme : { fr: 'Accessoires', folder: 'homme/accessoire',        gender: 'Homme'  },

  // ── Robes (Femme uniquement) ──────────────────────────────
  dresses           : { fr: 'Robes',       folder: 'Femme/robes',             gender: 'Femme'  },

  // ── Jupes (Femme uniquement) ──────────────────────────────
  skirts            : { fr: 'Jupes',       folder: 'Femme/jupe',              gender: 'Femme'  },

  // ── Pantalons ─────────────────────────────────────────────
  pants_femme       : { fr: 'Pantalons',   folder: 'Femme/pontallons',        gender: 'Femme'  },
  pants_homme       : { fr: 'Pantalons',   folder: 'homme/pants',             gender: 'Homme'  },

  // ── Shorts ────────────────────────────────────────────────
  shorts_femme      : { fr: 'Shorts',      folder: 'Femme/short',             gender: 'Femme'  },
  shorts_homme      : { fr: 'Shorts',      folder: 'homme/short',             gender: 'Homme'  },

  // ── Vestes ────────────────────────────────────────────────
  jackets_femme     : { fr: 'Vestes',      folder: 'Femme/chemise',           gender: 'Femme'  },
  jackets_homme     : { fr: 'Vestes',      folder: 'homme/vestes',            gender: 'Homme'  },
};

// ════════════════════════════════════════════════════════════
// MAPPING DÉTERMINISTE  "folder:color" → fichier(s) exact(s)
// Chemins RELATIFS à ASSETS_ROOT
// ════════════════════════════════════════════════════════════
const IMAGE_MAP = {

  // ── SACS (Femme/bags) ─────────────────────────────────────
  'Femme/bags:gray'   : ['bag_gray.jpeg'],
  'Femme/bags:white'  : ['bag_white.jpeg'],
  'Femme/bags:red'    : ['bag_red.jpeg'],
  'Femme/bags:blue'   : ['bag_blue.jpeg'],
  'Femme/bags:black'  : ['bag_black.jpeg'],
  'Femme/bags:green'  : ['bag_green.jpeg'],
  'Femme/bags:brown'  : ['bag_brown.jpeg'],
  'Femme/bags:yellow' : ['bag_yellow.jpeg'],

  // ── CHEMISES FEMME (Femme/chemise) ───────────────────────
  'Femme/chemise:gray'   : ['chemise_gray.jpeg'],
  'Femme/chemise:white'  : ['chemise_blue1.jpeg'],   // pas de blanc femme → fallback
  'Femme/chemise:red'    : ['chemise_red.jpeg'],
  'Femme/chemise:blue'   : ['chemise_blue1.jpeg', 'chemise_blue2.jpeg'],
  'Femme/chemise:black'  : ['chemise_black.jpeg'],
  'Femme/chemise:green'  : ['chemise_green.jpeg', 'chemise_green1.jpeg'],
  'Femme/chemise:brown'  : ['chemise_brown.jpeg'],
  'Femme/chemise:yellow' : ['chemise_yellow.jpeg'],

  // ── CHEMISES HOMME (homme/chemise) ────────────────────────
  'homme/chemise:gray'   : ['chemise_gray1.jpeg', 'chemise_gray3.jpeg'],
  'homme/chemise:white'  : ['chemise_white3.jpeg'],
  'homme/chemise:red'    : ['chemise_red3.jpeg'],
  'homme/chemise:blue'   : ['chemise_blue.jpeg'],
  'homme/chemise:black'  : ['chemise_black1.jpeg', 'chemise_black1 (2).jpeg', 'chemise_black3.jpeg'],
  'homme/chemise:green'  : ['chemise_green3.jpeg'],
  'homme/chemise:brown'  : ['chemise_brown1.jpeg'],
  'homme/chemise:beige'  : ['chemise_beige1.jpeg'],
  'homme/chemise:yellow' : ['chemise_white3.jpeg'],  // pas de jaune → fallback blanc

  // ── T-SHIRTS FEMME (Femme/T-shirt) ────────────────────────
  'Femme/T-shirt:gray'   : ['T-shirt-gray.jpeg'],
  'Femme/T-shirt:white'  : ['pull_white.jpeg'],
  'Femme/T-shirt:red'    : ['pull_red.jpeg'],
  'Femme/T-shirt:blue'   : ['pull_blue.jpeg', 'pull_blue1.jpeg'],
  'Femme/T-shirt:black'  : ['T-shirt-black.jpeg'],
  'Femme/T-shirt:green'  : ['T-shirt-green.jpeg'],
  'Femme/T-shirt:brown'  : ['T-shirt-brown.jpeg'],
  'Femme/T-shirt:yellow' : ['T-shirt-gray.jpeg'],   // pas de jaune → fallback gris

  // ── T-SHIRTS HOMME (homme/T-shirt) ────────────────────────
  'homme/T-shirt:gray'   : ['pull_gray.jpeg', 'pull_gray_homme.jpeg', 'sweaters_gray1.jpeg'],
  'homme/T-shirt:white'  : ['pull_white1.jpeg', 'sweaters_white2_homme.jpeg'],
  'homme/T-shirt:red'    : ['pull-red.jpeg'],
  'homme/T-shirt:blue'   : ['pull_blue12.jpeg', 'pull_blue2.jpeg', 'pull_blue_homme.jpeg'],
  'homme/T-shirt:black'  : ['pull_black.jpeg', 'pull_black22.jpeg'],
  'homme/T-shirt:green'  : ['pull_green.jpeg'],
  'homme/T-shirt:brown'  : ['pull_brown.jpeg'],
  'homme/T-shirt:yellow' : ['pull_white1.jpeg'],    // pas de jaune → fallback blanc

  // ── SWEATERS FEMME (Femme/sweaters) ───────────────────────
  'Femme/sweaters:gray'   : ['sweater_gray.jpeg', 'pull_gray_femme.jpeg'],
  'Femme/sweaters:white'  : ['sweater_white_polo.jpeg'],
  'Femme/sweaters:red'    : ['sweater_red.jpeg'],
  'Femme/sweaters:blue'   : ['sweater_blue.jpeg'],
  'Femme/sweaters:black'  : ['sweater_black.jpeg'],
  'Femme/sweaters:green'  : ['sweater_green.jpeg'],
  'Femme/sweaters:brown'  : ['sweater_brown.jpeg'],   // absent → auto-fallback
  'Femme/sweaters:yellow' : ['sweater_yellow.jpeg'],

  // ── SWEATERS HOMME (homme/sweaters) ───────────────────────
  'homme/sweaters:gray'   : ['sweaters_gray.jpeg'],
  'homme/sweaters:white'  : ['sweaters_white.jpeg'],
  'homme/sweaters:red'    : ['sweaters_red.jpeg'],
  'homme/sweaters:blue'   : ['sweaters_blue.jpeg'],
  'homme/sweaters:black'  : ['sweaters_black.jpeg'],
  'homme/sweaters:green'  : ['sweaters_green.jpeg'],
  'homme/sweaters:brown'  : ['sweater_brown.jpeg'],
  'homme/sweaters:yellow' : ['sweaters_white.jpeg'],  // pas de jaune → fallback blanc

  // ── SNEAKERS FEMME (Femme/sneakers) ───────────────────────
  'Femme/sneakers:gray'   : ['addidas_gray.jpeg'],
  'Femme/sneakers:white'  : ['samba_white.jpeg', 'tallon_white.jpeg', 'demi-tallon-white.jpeg'],
  'Femme/sneakers:red'    : ['samba_red.jpeg'],
  'Femme/sneakers:blue'   : ['tallon_bue.jpeg'],
  'Femme/sneakers:black'  : ['boutinne_black.jpeg'],
  'Femme/sneakers:green'  : ['chaussure_green.jpeg'],
  'Femme/sneakers:brown'  : ['chaussure_brown.jpeg'],
  'Femme/sneakers:yellow' : ['tallon_yellow.jpeg'],

  // ── SNEAKERS HOMME (homme/sneakers) ───────────────────────
  'homme/sneakers:gray'   : ['sneakers_gray.jpeg'],
  'homme/sneakers:white'  : ['sneakers_white.jpeg'],
  'homme/sneakers:red'    : ['sneakers_red.jpeg'],
  'homme/sneakers:blue'   : ['sneakers_blue.jpeg'],
  'homme/sneakers:black'  : ['Sandales Été black— Nike.jpeg'],
  'homme/sneakers:green'  : ['sneakers_green.jpeg'],
  'homme/sneakers:brown'  : ['sneakers_brown.jpeg'],
  'homme/sneakers:yellow' : ['sneakers_white.jpeg'],  // pas de jaune → fallback blanc

  // ── ACCESSOIRES FEMME (Femme/accessoires) ─────────────────
  'Femme/accessoires:gray'   : ['casque_gray.jpeg'],
  'Femme/accessoires:white'  : ['accessoire_white.jpeg', 'gants_white.jpeg', 'watch_white.jpeg'],
  'Femme/accessoires:red'    : ['watch_red.jpeg', 'ceintures_red.jpeg', 'follare_red1.jpeg', 'papion_red.jpeg'],
  'Femme/accessoires:blue'   : ['casquette_blue.jpeg', 'lunette_blue.jpeg', 'watch_blue.jpeg'],
  'Femme/accessoires:black'  : ['ceinture_black.jpeg', 'lunette_black.jpeg'],
  'Femme/accessoires:green'  : ['ring_green.jpeg', 'chapeau_green.jpeg'],
  'Femme/accessoires:brown'  : ['ceinture_brown.jpeg', 'watch_brown.jpeg'],
  'Femme/accessoires:yellow' : ['follare_yellow.jpeg'],

  // ── ACCESSOIRES HOMME (homme/accessoire) ──────────────────
  'homme/accessoire:brown'  : ['belt_brown.jpeg'],
  'homme/accessoire:white'  : ['bounet_white.jpeg'],
  'homme/accessoire:black'  : ['braclet_black.jpeg'],
  'homme/accessoire:red'    : ['caravatte_red.jpeg'],
  'homme/accessoire:gray'   : ['casquette_gray.jpeg'],
  'homme/accessoire:green'  : ['green_bouton_de_chemise.jpeg'],
  'homme/accessoire:blue'   : ['watch_blue.jpeg'],
  'homme/accessoire:yellow' : ['belt_brown.jpeg'],   // pas de jaune → fallback brown

  // ── ROBES (Femme/robes) ────────────────────────────────────
  'Femme/robes:gray'   : ['robe_gray.jpeg'],
  'Femme/robes:white'  : ['robe_white.jpeg'],
  'Femme/robes:red'    : ['robe_red.jpeg'],
  'Femme/robes:blue'   : ['robe_blue.jpeg'],
  'Femme/robes:black'  : ['robe_black.jpeg'],
  'Femme/robes:green'  : ['robe_green.jpeg'],
  'Femme/robes:brown'  : ['robe_brown.jpeg'],
  'Femme/robes:yellow' : ['robe_yellow.jpeg'],

  // ── JUPES (Femme/jupe) ─────────────────────────────────────
  'Femme/jupe:gray'   : ['jupe_gray.jpeg'],
  'Femme/jupe:white'  : ['jupe_white.jpeg', 'jupe_white1.jpeg'],
  'Femme/jupe:red'    : ['jupe_red.jpeg'],
  'Femme/jupe:blue'   : ['jupe_blue.jpeg'],
  'Femme/jupe:black'  : ['jupe_black.jpeg', 'jupe_black1.jpeg'],
  'Femme/jupe:green'  : ['jupe_green.jpeg'],
  'Femme/jupe:brown'  : ['jupe_brown.jpeg'],
  'Femme/jupe:yellow' : ['jupe_yellow.jpeg'],

  // ── PANTALONS FEMME (Femme/pontallons) ────────────────────
  'Femme/pontallons:gray'   : ['pontallon_gray.jpeg', 'pontallon_gray1.jpeg'],
  'Femme/pontallons:white'  : ['pontallon_white.jpeg'],
  'Femme/pontallons:red'    : ['pontallon_red.jpeg'],
  'Femme/pontallons:blue'   : ['pontallon_blue.jpeg'],
  'Femme/pontallons:black'  : ['pontallon_black.jpeg'],
  'Femme/pontallons:green'  : ['pontallon_green.jpeg'],
  'Femme/pontallons:brown'  : ['pontallon_brown.jpeg'],
  'Femme/pontallons:yellow' : ['pontallon_yellow.jpeg'],

  // ── PANTALONS HOMME (homme/pants) ─────────────────────────
  'homme/pants:gray'   : ['pant_gray.jpeg'],
  'homme/pants:white'  : ['pant_white.jpeg'],
  'homme/pants:red'    : ['pant_red.jpeg'],
  'homme/pants:blue'   : ['pant_blue_jeans.jpeg'],
  'homme/pants:black'  : ['pant_black.jpeg'],
  'homme/pants:green'  : ['pant_green.jpeg'],
  'homme/pants:brown'  : ['pant_brown.jpeg'],
  'homme/pants:yellow' : ['pant_white.jpeg'],   // pas de jaune → fallback blanc

  // ── SHORTS FEMME (Femme/short) ─────────────────────────────
  'Femme/short:gray'   : ['short_gray.jpeg'],
  'Femme/short:white'  : ['short_white.jpeg', 'short_whitee.jpeg'],
  'Femme/short:red'    : ['short_red.jpeg'],
  'Femme/short:blue'   : ['short_blue.jpeg', 'short_jeans.jpeg'],
  'Femme/short:black'  : ['short_black.jpeg'],
  'Femme/short:green'  : ['short_green.jpeg', 'short_greenn.jpeg'],
  'Femme/short:brown'  : ['short_brown.jpeg', 'short_brownn.jpeg'],
  'Femme/short:yellow' : ['short_gray.jpeg'],   // pas de jaune → fallback gris

  // ── SHORTS HOMME (homme/short) ─────────────────────────────
  'homme/short:gray'   : ['short_gray.jpeg'],
  'homme/short:white'  : ['short_white.jpeg'],
  'homme/short:red'    : ['short_red.jpeg'],
  'homme/short:blue'   : ['short_blue.jpeg'],
  'homme/short:black'  : ['short_black.jpeg'],
  'homme/short:green'  : ['short_green.jpeg'],
  'homme/short:brown'  : ['short_brown.jpeg'],
  'homme/short:yellow' : ['short_white.jpeg'],  // pas de jaune → fallback blanc

  // ── VESTES FEMME (Femme/chemise → fichiers veste_*) ───────
  'Femme/chemise:veste_black'  : ['veste_black.jpeg'],
  'Femme/chemise:veste_green'  : ['veste_green.jpeg'],
  'Femme/chemise:veste_white'  : ['veste_white.jpeg'],
  'Femme/chemise:veste_yellow' : ['veste_yellow.jpeg'],
  // Clés spéciales pour jackets_femme :
  'Femme/chemise:black_jacket' : ['veste_black.jpeg'],
  'Femme/chemise:green_jacket' : ['veste_green.jpeg'],
  'Femme/chemise:white_jacket' : ['veste_white.jpeg'],
  'Femme/chemise:yellow_jacket': ['veste_yellow.jpeg'],

  // ── VESTES HOMME (homme/vestes) ───────────────────────────
  'homme/vestes:gray'   : ['veste_gray.jpeg'],
  'homme/vestes:blue'   : ['veste_blue.jpeg'],
  'homme/vestes:black'  : ['veste_gray.jpeg'],   // pas de noir → fallback gris
  'homme/vestes:brown'  : ['veste_brown.jpeg', 'veste_brownn.jpeg'],
  'homme/vestes:red'    : ['veste_red.jpeg'],
  'homme/vestes:green'  : ['veste_gray.jpeg'],   // pas de vert → fallback gris
  'homme/vestes:white'  : ['veste_gray.jpeg'],   // pas de blanc → fallback gris
  'homme/vestes:yellow' : ['veste_gray.jpeg'],   // pas de jaune → fallback gris
};

// ════════════════════════════════════════════════════════════
// COULEURS
// ════════════════════════════════════════════════════════════
const COLOR_MAP = {
  gray  : { name: 'Gris',   hex: '#808080' },
  white : { name: 'Blanc',  hex: '#FFFFFF' },
  red   : { name: 'Rouge',  hex: '#FF0000' },
  blue  : { name: 'Bleu',   hex: '#0000FF' },
  black : { name: 'Noir',   hex: '#000000' },
  green : { name: 'Vert',   hex: '#008000' },
  brown : { name: 'Marron', hex: '#8B4513' },
  yellow: { name: 'Jaune',  hex: '#FFD700' },
  beige : { name: 'Beige',  hex: '#F5F0DC' },
};

// ════════════════════════════════════════════════════════════
// NOMS DE PRODUITS PAR CATÉGORIE FR
// ════════════════════════════════════════════════════════════
const PRODUCT_NAMES = {
  'Sacs'       : ['Sac Cabas Cuir','Sac à Main Élégant','Sac Bandoulière Premium','Pochette Soirée','Sac Tote Luxe','Sac Shopping Chic','Mini Sac Tendance','Sac Baguette'],
  'T-shirts'   : ['T-shirt Essentiel','T-shirt Col Rond','T-shirt Oversize','T-shirt Slim Fit','Tee Premium','T-shirt Graphique','T-shirt Basique Chic','T-shirt Sport'],
  'Chemises'   : ['Chemise Oxford Classic','Chemise Lin Premium','Chemise Business','Chemise Casual Chic','Chemise Flanelle','Chemise Popeline','Chemise Rayée','Chemise Unie'],
  'Chaussures' : ['Sneakers Running','Boots Chelsea','Mocassins Cuir','Sandales Été','Baskets Lifestyle','Bottines Talon','Derby Cuir','Sneakers Plateforme'],
  'Accessoires': ['Ceinture Cuir','Écharpe Laine','Casquette Streetwear','Bonnet Tricoté','Gants Cuir','Montre Bracelet','Lunettes de Soleil','Chapeau Paille'],
  'Robes'      : ['Robe Midi Élégante','Robe Portefeuille','Robe Cocktail','Robe Bohème','Robe Été Légère','Robe Soirée Glamour','Robe Fleurie'],
  'Jupes'      : ['Jupe Midi Plissée','Jupe Crayon','Mini Jupe Jean','Jupe Longue Fluide','Jupe Trapèze','Jupe Asymétrique'],
  'Pulls'      : ['Pull Col V Laine','Cardigan Oversize','Pull Torsadé','Sweat Molleton','Pull Fine Maille','Cardigan Boutonné','Pull Col Roulé'],
  'Vestes'     : ['Veste Blazer Structuré','Veste Denim','Veste Cuir','Veste Zippée','Veste Sport Chic','Bomber Premium'],
  'Shorts'     : ['Short Chino','Short Running','Short Jean Délavé','Short Bermuda','Short Sport','Short Cycliste'],
  'Pantalons'  : ['Pantalon Chino','Jean Slim Premium','Pantalon Large','Jean Droit','Pantalon de Ville','Jogging Coton','Pantalon Cargo'],
};

// ════════════════════════════════════════════════════════════
// SCHÉMA MONGOOSE
// ════════════════════════════════════════════════════════════
const productSchema = new mongoose.Schema(
  {
    name         : { type: String, required: true },
    description  : { type: String, required: true },
    price        : { type: Number, required: true },
    originalPrice: { type: Number, default: null },
    category     : { type: String, required: true },
    gender       : { type: String, default: 'Unisexe' },
    sizes        : [String],
    colors       : [{ name: String, hex: String }],
    images       : [{ url: String, publicId: String, isMain: Boolean }],
    stock        : { type: Number, default: 10 },
    brand        : { type: String, default: 'Fashion Store' },
    material     : { type: String, default: '' },
    tags         : [String],
    featured     : { type: Boolean, default: false },
    trending     : { type: Boolean, default: false },
    isActive     : { type: Boolean, default: true },
    slug         : { type: String },
    rating       : { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    salesCount   : { type: Number, default: 0 },
  },
  { timestamps: true }
);
const Product = mongoose.model('Product', productSchema);

// ════════════════════════════════════════════════════════════
// SÉLECTION D'IMAGE DÉTERMINISTE
// ════════════════════════════════════════════════════════════
const _counters = {};

/**
 * Résout le chemin vers une image en fonction du dossier et de la couleur.
 * Pour jackets_femme, on adapte la clé car les vestes femmes sont dans Femme/chemise.
 */
function pickImage(folder, color, categoryKey) {
  // Cas spécial : vestes femme stockées dans Femme/chemise avec préfixe veste_*
  let lookupColor = color;
  if (categoryKey === 'jackets_femme') {
    lookupColor = `${color}_jacket`;
  }

  const key      = `${folder}:${lookupColor}`;
  const fallback = `${folder}:gray`;
  let fileNames  = IMAGE_MAP[key] || IMAGE_MAP[fallback];

  if (!fileNames || fileNames.length === 0) {
    // Scan automatique du dossier
    const folderPath = path.join(ASSETS_ROOT, folder);
    if (!fs.existsSync(folderPath)) return null;
    const all = fs.readdirSync(folderPath).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
    if (!all.length) return null;
    fileNames = all;
  }

  const cacheKey = `${folder}:${lookupColor}`;
  _counters[cacheKey] = (_counters[cacheKey] || 0);
  const fileName = fileNames[_counters[cacheKey] % fileNames.length];
  _counters[cacheKey]++;

  if (!fileName || !fileName.trim()) return null;

  const fullPath = path.join(ASSETS_ROOT, folder, fileName.trim());
  return fs.existsSync(fullPath) ? fullPath : null;
}

// ════════════════════════════════════════════════════════════
// UPLOAD CLOUDINARY
// ════════════════════════════════════════════════════════════
async function uploadToCloudinary(localPath, folder, productName) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await cloudinary.uploader.upload(localPath, {
        folder, use_filename: false, unique_filename: true,
        transformation: [{ width:900, height:1100, crop:'fill', gravity:'auto', quality:'auto:best', fetch_format:'auto' }],
        tags: ['fashion-store', 'product', folder.split('/').pop()],
      });
      return { url: result.secure_url, publicId: result.public_id };
    } catch (err) {
      if (attempt === 3) { console.error(`  ❌ [${productName}]: ${err.message}`); return null; }
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
function generateSlug(name, id) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim() + '-' + id;
}

function buildDescription(baseName, color, brand, condition, size, catFr, gender) {
  const c = {
    'new'      : 'Neuf avec étiquette',
    'like new' : 'Comme neuf, porté une fois',
    'good'     : 'Bon état général',
    'fair'     : "État correct, légères traces d'usage",
  }[condition] || condition;
  const gLabel = gender === 'Femme' ? 'femme' : gender === 'Homme' ? 'homme' : '';
  return `${baseName} ${color} de la marque ${brand}. ${c}. Taille ${String(size).toUpperCase()} disponible. Modèle ${gLabel} idéal pour votre garde-robe.`;
}

function buildSizes(catKey) {
  if (catKey.startsWith('shoes')) return ['36EU','37EU','38EU','39EU','40EU','41EU','42EU','43EU'];
  if (catKey.startsWith('accessories') || catKey === 'bags') return ['Taille unique'];
  if (catKey.startsWith('pants_homme') || catKey.startsWith('shorts_homme')) return ['30','32','34','36','38'];
  return ['XS','S','M','L','XL','XXL'];
}

function getMaterial(catFr) {
  return {
    'T-shirts'  : 'Coton 100%',
    'Chemises'  : 'Coton Oxford',
    'Pulls'     : 'Laine mélangée',
    'Vestes'    : 'Polyester / Coton',
    'Shorts'    : 'Coton',
    'Pantalons' : 'Denim / Coton',
    'Robes'     : 'Viscose',
    'Jupes'     : 'Polyester',
    'Sacs'      : 'Cuir synthétique',
    'Chaussures': 'Cuir / Textile',
    'Accessoires': 'Matières mixtes',
  }[catFr] || '';
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════
async function importProducts() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  Fashion Store — Import DÉTERMINISTE (genre + catégorie + couleur)');
  console.log('══════════════════════════════════════════════════════════════════\n');

  const missing = ['MONGODB_URI','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length) { console.error('❌ Variables manquantes :', missing.join(', ')); process.exit(1); }
  if (!fs.existsSync(ASSETS_ROOT)) { console.error('❌ Assets introuvable :', ASSETS_ROOT); process.exit(1); }

  console.log('✅ Assets :', ASSETS_ROOT);

  // Vérification rapide des fichiers déclarés dans IMAGE_MAP
  console.log('🔍 Vérification IMAGE_MAP...');
  let missingFiles = 0;
  for (const [key, files] of Object.entries(IMAGE_MAP)) {
    const folder = key.split(':')[0];
    for (const file of files) {
      if (!file.trim()) continue;
      const fullPath = path.join(ASSETS_ROOT, folder, file.trim());
      if (!fs.existsSync(fullPath)) {
        console.warn(`   ⚠️  ${folder}/${file} introuvable`);
        missingFiles++;
      }
    }
  }
  console.log(missingFiles === 0
    ? '   ✅ Tous les fichiers présents'
    : `   ⚠️  ${missingFiles} fichier(s) manquant(s) (non bloquant — fallback automatique)`);

  try { await cloudinary.api.ping(); console.log('✅ Cloudinary :', process.env.CLOUDINARY_CLOUD_NAME); }
  catch (e) { console.error('❌ Cloudinary :', e.message); process.exit(1); }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connecté\n');

  const jsonPath = path.resolve(__dirname, '../clothes_import.json');
  if (!fs.existsSync(jsonPath)) { console.error('❌ clothes_import.json introuvable'); process.exit(1); }
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`📦 ${rawData.length} produits à importer`);

  // Nettoyage base + Cloudinary
  const existing = await Product.find({}, 'images');
  const oldIds   = existing.flatMap(p => p.images).map(i => i.publicId).filter(Boolean);
  if (oldIds.length) {
    process.stdout.write(`🗑️  Suppression ${oldIds.length} images Cloudinary...`);
    for (let i = 0; i < oldIds.length; i += 100)
      await cloudinary.api.delete_resources(oldIds.slice(i, i + 100));
    console.log(' OK');
  }
  await Product.deleteMany({});
  console.log('🗑️  Base nettoyée\n🚀 Import...\n');

  const products = [];
  let ok = 0, skip = 0;

  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];

    const catInfo   = CATEGORY_MAP[item.category];
    if (!catInfo) {
      console.warn(`  ⚠️  Catégorie inconnue "${item.category}" (id ${item.id}) — ignoré`);
      skip++;
      continue;
    }

    const colorInfo = COLOR_MAP[item.color] || { name: item.color, hex: '#888888' };
    const catFr     = catInfo.fr;
    const gender    = item.gender || catInfo.gender;
    const folder    = catInfo.folder;

    // Slug Cloudinary basé sur la catégorie FR
    const catSlug   = catFr.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-');
    const cloudFolder = `fashion-store/products/${catSlug}`;

    const namePool = PRODUCT_NAMES[catFr] || [`Article ${catFr}`];
    const baseName = namePool[i % namePool.length];
    const fullName = `${baseName} ${colorInfo.name} — ${item.brand}`;

    process.stdout.write(`  [${String(i+1).padStart(3)}/${rawData.length}] ${fullName.slice(0,52).padEnd(52)} `);

    const localPath = pickImage(folder, item.color, item.category);
    if (!localPath) {
      console.log('⚠️  [ignoré — image introuvable]');
      skip++;
      continue;
    }

    const uploaded = await uploadToCloudinary(localPath, cloudFolder, fullName);
    const images   = uploaded
      ? [{ url: uploaded.url, publicId: uploaded.publicId, isMain: true }]
      : [];
    if (uploaded) ok++;
    process.stdout.write(uploaded
      ? `✅ ${path.basename(localPath)}\n`
      : `⚠️  [upload échoué]\n`);

    const isNew  = item.condition === 'new';
    const price  = Math.round(item.price);

    products.push({
      name        : fullName,
      description : buildDescription(baseName, colorInfo.name, item.brand, item.condition, item.size, catFr, gender),
      price,
      originalPrice: !isNew ? Math.round(price * (1.2 + Math.random() * 0.15)) : null,
      category    : catFr,
      gender,
      sizes       : buildSizes(item.category),
      colors      : [colorInfo],
      images,
      stock       : Math.floor(Math.random() * 45) + 5,
      brand       : item.brand,
      material    : getMaterial(catFr),
      tags        : [catFr.toLowerCase(), item.brand.toLowerCase(), colorInfo.name.toLowerCase(), gender.toLowerCase(), item.condition],
      featured    : Math.random() > 0.75,
      trending    : Math.random() > 0.80,
      isActive    : true,
      slug        : generateSlug(fullName, item.id),
      rating      : {
        average : parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
        count   : Math.floor(Math.random() * 300) + 10,
      },
      salesCount  : Math.floor(Math.random() * 200),
    });
  }

  console.log('\n💾 Insertion en base...');
  const result = await Product.insertMany(products, { ordered: false });

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`✅  ${result.length} produits insérés  |  ☁️  ${ok} images uploadées  |  ⚠️  ${skip} ignorés`);

  // Statistiques par catégorie + genre
  const stats = await Product.aggregate([
    { $group: { _id: { cat: '$category', gender: '$gender' }, n: { $sum: 1 }, avg: { $avg: '$price' } } },
    { $sort: { '_id.gender': 1, '_id.cat': 1 } },
  ]);
  console.log('\n📊 Répartition par catégorie + genre :');
  stats.forEach(s =>
    console.log(`  ${String(s._id.gender).padEnd(6)} | ${String(s._id.cat).padEnd(14)}: ${String(s.n).padStart(3)} produits | ~${Math.round(s.avg)} €`)
  );

  const sample = await Product.findOne({ 'images.0': { $exists: true } }).lean();
  if (sample) console.log(`\n📸 Exemple : ${sample.name}\n   ${sample.images[0]?.url}`);

  console.log('\n✅ Import terminé !\n══════════════════════════════════════════════════════════════════');
  await mongoose.disconnect();
  process.exit(0);
}

importProducts().catch(err => {
  console.error('\n❌', err.message);
  mongoose.disconnect();
  process.exit(1);
});
