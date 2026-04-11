import { Injectable } from '@angular/core';
import { Product, Category } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private products: Product[] = [
    // Homme
    {
      id: 1,
      name: 'Chemise Slim Fit',
      description: 'Chemise moderne coupe slim en coton égyptien, parfaite pour toutes occasions.',
      price: 89.99,
      discountPrice: 74.99,
      images: ['https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=600&fit=crop'],
      category: 'chemises',
      subcategory: 'homme',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Bleu', 'Blanc', 'Noir'],
      inStock: true,
      rating: 4.7,
      reviews: 128,
      tags: ['nouveau', 'tendance', 'homme'],
      createdAt: new Date('2024-01-15')
    },
    {
      id: 2,
      name: 'Jean Taille Haute',
      description: 'Jean décontracté avec coupe moderne et tissu stretch pour un confort optimal.',
      price: 119.99,
      images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=600&fit=crop'],
      category: 'pantalons',
      subcategory: 'homme',
      sizes: ['30', '32', '34', '36'],
      colors: ['Bleu clair', 'Bleu foncé'],
      inStock: true,
      rating: 4.5,
      reviews: 89,
      tags: ['best-seller', 'homme'],
      createdAt: new Date('2024-02-10')
    },
    {
      id: 3,
      name: 'Blazer Élégant',
      description: 'Blazer structuré pour un look professionnel et sophistiqué.',
      price: 249.99,
      discountPrice: 199.99,
      images: ['https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=600&fit=crop'],
      category: 'vestes',
      subcategory: 'homme',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Noir', 'Gris', 'Marine'],
      inStock: true,
      rating: 4.9,
      reviews: 203,
      tags: ['luxe', 'homme'],
      createdAt: new Date('2024-01-20')
    },
    // Femme
    {
      id: 4,
      name: 'Robe d\'Été Florale',
      description: 'Robe légère et fluide avec imprimé floral, parfaite pour les journées ensoleillées.',
      price: 79.99,
      discountPrice: 59.99,
      images: ['https://images.unsplash.com/photo-1567095761054-7a02e69e5c43?w=400&h=600&fit=crop'],
      category: 'robes',
      subcategory: 'femme',
      sizes: ['XS', 'S', 'M', 'L'],
      colors: ['Rose', 'Blanc', 'Jaune'],
      inStock: true,
      rating: 4.8,
      reviews: 156,
      tags: ['solde', 'été', 'femme'],
      createdAt: new Date('2024-03-05')
    },
    {
      id: 5,
      name: 'Top Crop',
      description: 'Top court en coton bio avec design moderne pour un look tendance.',
      price: 39.99,
      images: ['https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=400&h=600&fit=crop'],
      category: 'tops',
      subcategory: 'femme',
      sizes: ['S', 'M', 'L'],
      colors: ['Noir', 'Blanc', 'Beige'],
      inStock: true,
      rating: 4.4,
      reviews: 76,
      tags: ['tendance', 'femme'],
      createdAt: new Date('2024-02-28')
    },
    {
      id: 6,
      name: 'Jupe Midi',
      description: 'Jupe longueur midi avec fente discrète pour une élégance moderne.',
      price: 69.99,
      images: ['https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=400&h=600&fit=crop'],
      category: 'jupes',
      subcategory: 'femme',
      sizes: ['XS', 'S', 'M', 'L'],
      colors: ['Noir', 'Kaki', 'Bordeaux'],
      inStock: true,
      rating: 4.6,
      reviews: 94,
      tags: ['classique', 'femme'],
      createdAt: new Date('2024-03-12')
    },
    // Enfant
    {
      id: 7,
      name: 'Ensemble Enfant',
      description: 'Ensemble complet pour enfant, confortable et résistant.',
      price: 49.99,
      discountPrice: 39.99,
      images: ['https://images.unsplash.com/photo-1522771930-78848d9293e8?w=400&h=600&fit=crop'],
      category: 'ensembles',
      subcategory: 'enfant',
      sizes: ['2 ans', '4 ans', '6 ans', '8 ans'],
      colors: ['Bleu', 'Rouge', 'Vert'],
      inStock: true,
      rating: 4.7,
      reviews: 112,
      tags: ['enfant', 'solde'],
      createdAt: new Date('2024-02-15')
    },
    {
      id: 8,
      name: 'Pyjama Enfant',
      description: 'Pyjama doux et confortable avec motifs amusants.',
      price: 29.99,
      images: ['https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=400&h=600&fit=crop'],
      category: 'pyjamas',
      subcategory: 'enfant',
      sizes: ['2 ans', '4 ans', '6 ans', '8 ans'],
      colors: ['Bleu', 'Rose', 'Gris'],
      inStock: true,
      rating: 4.5,
      reviews: 67,
      tags: ['enfant', 'confort'],
      createdAt: new Date('2024-03-01')
    },
    // Accessoires
    {
      id: 9,
      name: 'Montre Minimaliste',
      description: 'Montre élégante avec cadran minimaliste et bracelet en cuir véritable.',
      price: 149.99,
      images: ['https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400&h=600&fit=crop'],
      category: 'montres',
      subcategory: 'accessoire',
      sizes: ['Unique'],
      colors: ['Noir', 'Marron', 'Bleu'],
      inStock: true,
      rating: 4.9,
      reviews: 187,
      tags: ['luxe', 'accessoire'],
      createdAt: new Date('2024-01-25')
    },
    {
      id: 10,
      name: 'Sac à Main',
      description: 'Sac en cuir véritable avec compartiments multiples et design moderne.',
      price: 199.99,
      discountPrice: 159.99,
      images: ['https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&h=600&fit=crop'],
      category: 'sacs',
      subcategory: 'accessoire',
      sizes: ['Unique'],
      colors: ['Noir', 'Marron', 'Beige'],
      inStock: true,
      rating: 4.8,
      reviews: 134,
      tags: ['accessoire', 'luxe'],
      createdAt: new Date('2024-02-20')
    },
    {
      id: 11,
      name: 'Lunettes de Soleil',
      description: 'Lunettes de soleil polarisées avec protection UV400 et design tendance.',
      price: 89.99,
      images: ['https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&h=600&fit=crop'],
      category: 'lunettes',
      subcategory: 'accessoire',
      sizes: ['Unique'],
      colors: ['Noir', 'Doré', 'Argenté'],
      inStock: true,
      rating: 4.6,
      reviews: 98,
      tags: ['accessoire', 'soleil'],
      createdAt: new Date('2024-03-08')
    },
    {
      id: 12,
      name: 'Chaussures Sport',
      description: 'Chaussures de sport avec amorti avancé pour un confort maximal.',
      price: 129.99,
      discountPrice: 99.99,
      images: ['https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=600&fit=crop'],
      category: 'chaussures',
      subcategory: 'accessoire',
      sizes: ['38', '39', '40', '41', '42', '43'],
      colors: ['Blanc', 'Noir', 'Gris'],
      inStock: true,
      rating: 4.7,
      reviews: 156,
      tags: ['sport', 'accessoire'],
      createdAt: new Date('2024-02-25')
    }
  ];

  private categories: Category[] = [
    { id: 1, name: 'Homme', icon: '👨', count: 45, color: '#3B82F6', gradient: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' },
    { id: 2, name: 'Femme', icon: '👩', count: 56, color: '#EC4899', gradient: 'linear-gradient(135deg, #EC4899, #BE185D)' },
    { id: 3, name: 'Enfant', icon: '👶', count: 32, color: '#10B981', gradient: 'linear-gradient(135deg, #10B981, #047857)' },
    { id: 4, name: 'Accessoires', icon: '🕶️', count: 28, color: '#8B5CF6', gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' },
    { id: 5, name: 'Nouveautés', icon: '✨', count: 18, color: '#F59E0B', gradient: 'linear-gradient(135deg, #F59E0B, #D97706)' },
    { id: 6, name: 'Promotions', icon: '🔥', count: 22, color: '#EF4444', gradient: 'linear-gradient(135deg, #EF4444, #DC2626)' }
  ];

  getProducts(): Product[] {
    return this.products;
  }

  getProductById(id: number): Product | undefined {
    return this.products.find(product => product.id === id);
  }

  getCategories(): Category[] {
    return this.categories;
  }

  getFeaturedProducts(): Product[] {
    return this.products.slice(0, 6);
  }

  getProductsBySubcategory(subcategory: string): Product[] {
    return this.products.filter(product => product.subcategory === subcategory);
  }

  getProductsByCategory(category: string): Product[] {
    return this.products.filter(product => product.category === category);
  }

  searchProducts(query: string): Product[] {
    return this.products.filter(product =>
      product.name.toLowerCase().includes(query.toLowerCase()) ||
      product.description.toLowerCase().includes(query.toLowerCase()) ||
      product.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    );
  }

  getNewArrivals(): Product[] {
    return [...this.products]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 4);
  }

  getDiscountedProducts(): Product[] {
    return this.products.filter(product => product.discountPrice);
  }
}
