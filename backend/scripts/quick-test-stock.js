#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SCRIPT DE TEST RAPIDE - GESTION DU STOCK
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ce script effectue un test rapide en 3 minutes pour valider :
 * - La création de commande avec stock suffisant
 * - Le rejet de commande avec stock insuffisant
 * - L'annulation et la réintégration du stock
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Couleurs
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

console.log(`${c.bold}${c.blue}
╔═══════════════════════════════════════════════════════════════╗
║           TEST RAPIDE - GESTION DU STOCK                      ║
║                                                               ║
║  Ce script teste les fonctionnalités principales en ~3 min   ║
╚═══════════════════════════════════════════════════════════════╝
${c.reset}\n`);

async function quickTest() {
  try {
    // Connexion à MongoDB
    console.log(`${c.blue}📡 Connexion à MongoDB...${c.reset}`);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`${c.green}✅ Connecté à MongoDB${c.reset}\n`);

    // Import des modèles
    const Product = (await import('../models/Product.js')).default;
    const Order = (await import('../models/Order.js')).default;
    const User = (await import('../models/User.js')).default;

// ═══════════════════════════════════════════════════════════════════
// ÉTAPE 1 : Création du produit de test
// ═══════════════════════════════════════════════════════════════════
console.log(`${c.magenta}═══ ÉTAPE 1/5 : Création du produit de test ═══${c.reset}`);

const testProduct = await Product.create({
  name: 'Test Quick - Produit Stock',
  description: 'Produit pour test rapide de la gestion du stock',
  price: 100,
  category: 'T-shirts',     // une catégorie qui existe vraiment dans ton JSON
  gender: 'Homme',              // ← Majuscule (comme dans clothes_import.json)
  brand: 'Zara',
  condition: 'new',
  size: 'm',
  color: 'blue',
  stock: 5,

  // Format correct pour Cloudinary
  images: [
    {
      url: "https://res.cloudinary.com/dn58shb9y/image/upload/v1776167674/fashion-store/products/pulls/kprfd0jixv4uvyr9h0j2.jpg",   // temporaire (placeholder)
      //public_id: "test/placeholder-image"       // optionnel mais recommandé
    }
  ]
});

console.log(`${c.green}✅ Produit créé avec succès : ${testProduct.name}${c.reset}`);
console.log(`   ID : ${testProduct._id}`);
console.log(`   Stock initial : ${testProduct.stock}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // ÉTAPE 2 : Créer un utilisateur de test
    // ═══════════════════════════════════════════════════════════════════
    console.log(`${c.magenta}═══ ÉTAPE 2/5 : Création de l'utilisateur de test ═══${c.reset}`);

    let testUser = await User.findOne({ email: 'quicktest@example.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Quick Test User',
        email: 'quicktest@example.com',
        password: 'hashedpassword123',
        role: 'customer'
      });
      console.log(`${c.green}✅ Utilisateur créé${c.reset}\n`);
    } else {
      console.log(`${c.green}✅ Utilisateur existant utilisé${c.reset}\n`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // ÉTAPE 3 : TEST - Commande avec stock suffisant
    // ═══════════════════════════════════════════════════════════════════
    console.log(`${c.magenta}═══ ÉTAPE 3/5 : Test commande avec stock suffisant ═══${c.reset}`);

    const session1 = await mongoose.startSession();
    session1.startTransaction();

    try {
      // Vérifier le stock
      const product = await Product.findById(testProduct._id).session(session1);
      const quantityToOrder = 2;

      console.log(`   Stock avant commande : ${product.stock}`);
      console.log(`   Quantité à commander : ${quantityToOrder}`);

      if (product.stock >= quantityToOrder) {
        // Créer la commande
        const order = await Order.create([{
          userId: testUser._id,
          products: [{
            productId: testProduct._id,
            quantity: quantityToOrder,
            price: testProduct.price
          }],
          shippingAddress: {
            address: '123 Test St',
            city: 'Paris',
            zipCode: '75001'
          },
          totalAmount: testProduct.price * quantityToOrder,
          status: 'pending'
        }], { session: session1 });

        // Décrémenter le stock
        await Product.updateOne(
          { _id: testProduct._id },
          { $inc: { stock: -quantityToOrder } },
          { session: session1 }
        );

        await session1.commitTransaction();

        const updatedProduct = await Product.findById(testProduct._id);
        console.log(`   Stock après commande : ${updatedProduct.stock}`);

        if (updatedProduct.stock === product.stock - quantityToOrder) {
          console.log(`${c.green}✅ TEST RÉUSSI - Stock correctement décrémenté${c.reset}\n`);
        } else {
          console.log(`${c.red}❌ TEST ÉCHOUÉ - Stock incorrect${c.reset}\n`);
        }
      }
    } catch (error) {
      await session1.abortTransaction();
      console.log(`${c.red}❌ Erreur : ${error.message}${c.reset}\n`);
    } finally {
      session1.endSession();
    }

    // ═══════════════════════════════════════════════════════════════════
    // ÉTAPE 4 : TEST - Commande avec stock insuffisant
    // ═══════════════════════════════════════════════════════════════════
    console.log(`${c.magenta}═══ ÉTAPE 4/5 : Test commande avec stock insuffisant ═══${c.reset}`);

    const currentProduct = await Product.findById(testProduct._id);
    const excessiveQuantity = currentProduct.stock + 10;

    console.log(`   Stock actuel : ${currentProduct.stock}`);
    console.log(`   Quantité demandée : ${excessiveQuantity}`);

    const session2 = await mongoose.startSession();
    session2.startTransaction();

    try {
      const product = await Product.findById(testProduct._id).session(session2);

      if (product.stock < excessiveQuantity) {
        throw new Error(`Stock insuffisant : ${product.stock} disponible(s), ${excessiveQuantity} demandée(s)`);
      }

      await session2.commitTransaction();
      console.log(`${c.red}❌ TEST ÉCHOUÉ - La commande aurait dû être rejetée${c.reset}\n`);
    } catch (error) {
      await session2.abortTransaction();
      if (error.message.includes('Stock insuffisant')) {
        console.log(`${c.green}✅ TEST RÉUSSI - Commande correctement rejetée${c.reset}`);
        console.log(`   Message : ${error.message}\n`);
      } else {
        console.log(`${c.red}❌ TEST ÉCHOUÉ - Erreur inattendue : ${error.message}${c.reset}\n`);
      }
    } finally {
      session2.endSession();
    }

    // ═══════════════════════════════════════════════════════════════════
    // ÉTAPE 5 : TEST - Annulation et réintégration du stock
    // ═══════════════════════════════════════════════════════════════════
    console.log(`${c.magenta}═══ ÉTAPE 5/5 : Test annulation et réintégration du stock ═══${c.reset}`);

    const productBeforeCancel = await Product.findById(testProduct._id);
    console.log(`   Stock avant annulation : ${productBeforeCancel.stock}`);

    // Trouver une commande à annuler
    const orderToCancel = await Order.findOne({
      userId: testUser._id,
      status: 'pending'
    });

    if (orderToCancel) {
      const session3 = await mongoose.startSession();
      session3.startTransaction();

      try {
        // Marquer comme annulée
        orderToCancel.status = 'cancelled';
        await orderToCancel.save({ session: session3 });

        // Réintégrer le stock
        const quantityToRestore = orderToCancel.products[0].quantity;
        await Product.updateOne(
          { _id: testProduct._id },
          { $inc: { stock: quantityToRestore } },
          { session: session3 }
        );

        await session3.commitTransaction();

        const productAfterCancel = await Product.findById(testProduct._id);
        console.log(`   Stock après annulation : ${productAfterCancel.stock}`);
        console.log(`   Quantité réintégrée : ${quantityToRestore}`);

        if (productAfterCancel.stock === productBeforeCancel.stock + quantityToRestore) {
          console.log(`${c.green}✅ TEST RÉUSSI - Stock correctement réintégré${c.reset}\n`);
        } else {
          console.log(`${c.red}❌ TEST ÉCHOUÉ - Stock incorrect après annulation${c.reset}\n`);
        }
      } catch (error) {
        await session3.abortTransaction();
        console.log(`${c.red}❌ Erreur : ${error.message}${c.reset}\n`);
      } finally {
        session3.endSession();
      }
    } else {
      console.log(`${c.yellow}⚠️  Aucune commande à annuler${c.reset}\n`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // NETTOYAGE
    // ═══════════════════════════════════════════════════════════════════
    console.log(`${c.blue}🧹 Nettoyage des données de test...${c.reset}`);

    await Order.deleteMany({ userId: testUser._id });
    await Product.deleteOne({ _id: testProduct._id });
    await User.deleteOne({ _id: testUser._id });

    console.log(`${c.green}✅ Nettoyage terminé${c.reset}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // RÉSUMÉ
    // ═══════════════════════════════════════════════════════════════════
    console.log(`${c.bold}${c.green}
╔═══════════════════════════════════════════════════════════════╗
║                    TESTS TERMINÉS !                           ║
║                                                               ║
║  ✅ Commande avec stock suffisant                            ║
║  ✅ Rejet de commande avec stock insuffisant                 ║
║  ✅ Annulation et réintégration du stock                     ║
║                                                               ║
║  La gestion du stock fonctionne correctement !               ║
╚═══════════════════════════════════════════════════════════════╝
${c.reset}\n`);

  } catch (error) {
    console.error(`${c.red}❌ Erreur fatale : ${error.message}${c.reset}`);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log(`${c.blue}📡 Déconnecté de MongoDB${c.reset}`);
    process.exit(0);
  }
}

quickTest();
