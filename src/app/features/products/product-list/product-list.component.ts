import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CartService } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service';

interface Product {
  _id?: string;
  id?: number;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  discountPrice?: number;
  images: any[];
  category?: string;
  brand?: string;
  stock: number;
  sizes?: string[];
  colors?: any[];
  rating?: number;
  reviews?: number;
  featured?: boolean;
  tags?: string[];
}

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.scss']
})
export class ProductListComponent implements OnInit {
  products: Product[] = [];
  categories: any[] = [
    { name: 'Vêtements' },
    { name: 'Chaussures' },
    { name: 'Accessoires' }
  ];
  selectedCategory: string = 'all';
  sortBy: string = 'default';
  loading: boolean = false;

  constructor(
    private http: HttpClient,
    private cartService: CartService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  // ════════════════════════════════════════════════════════════
  // CHARGEMENT DES PRODUITS
  // ════════════════════════════════════════════════════════════

  loadProducts(): void {
    this.loading = true;

    this.http.get<any>('http://localhost:5000/api/products').subscribe({
      next: (response) => {
        console.log('✅ Produits reçus:', response);

        if (response && response.products) {
          this.products = response.products;
        } else if (Array.isArray(response)) {
          this.products = response;
        } else {
          this.products = [];
        }

        this.loading = false;
      },
      error: (error) => {
        console.error('❌ Erreur chargement produits:', error);
        this.products = [];
        this.loading = false;
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // AJOUTER AU PANIER
  // ════════════════════════════════════════════════════════════

  addToCart(product: Product): void {
    // Vérifier connexion
    if (!this.authService.isAuthenticated()) {
      const login = confirm('Vous devez être connecté pour ajouter au panier. Se connecter maintenant ?');
      if (login) {
        this.router.navigate(['/auth/login']);
      }
      return;
    }

    // Vérifier stock
    if (!this.isInStock(product)) {
      alert('❌ Ce produit est en rupture de stock');
      return;
    }

    const size = product.sizes && product.sizes.length > 0 ? product.sizes[0] : undefined;
    const color = product.colors && product.colors.length > 0 ? product.colors[0] : undefined;

    this.cartService.addToCart(product, 1, size, color).subscribe({
      next: (response) => {
        if (response.success) {
          alert(`✅ ${product.name} ajouté au panier !`);
        }
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
        if (error.status === 401) {
          alert('❌ Session expirée. Veuillez vous reconnecter.');
          this.router.navigate(['/auth/login']);
        } else {
          alert('❌ Erreur lors de l\'ajout au panier');
        }
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // FILTRES
  // ════════════════════════════════════════════════════════════

  filterByCategory(category: string): void {
    this.selectedCategory = category;

    if (category === 'all') {
      this.loadProducts();
    } else {
      this.loading = true;

      this.http.get<any>(`http://localhost:5000/api/products?category=${category}`).subscribe({
        next: (response) => {
          this.products = response.products || response;
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur filtrage:', error);
          this.loading = false;
        }
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  // TRI
  // ════════════════════════════════════════════════════════════

  sortProducts(event: any): void {
    this.sortBy = event.target.value;

    switch(this.sortBy) {
      case 'price-low':
        this.products.sort((a, b) => {
          const priceA = a.discountPrice || a.price;
          const priceB = b.discountPrice || b.price;
          return priceA - priceB;
        });
        break;

      case 'price-high':
        this.products.sort((a, b) => {
          const priceA = a.discountPrice || a.price;
          const priceB = b.discountPrice || b.price;
          return priceB - priceA;
        });
        break;

      case 'rating':
        this.products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;

      case 'name-asc':
        this.products.sort((a, b) => a.name.localeCompare(b.name));
        break;

      case 'name-desc':
        this.products.sort((a, b) => b.name.localeCompare(a.name));
        break;

      default:
        this.loadProducts();
    }
  }

  // ════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════════════════════════

  getDiscountPercentage(product: Product): number {
    if (product.originalPrice && product.originalPrice > product.price) {
      return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    }
    if (product.discountPrice && product.price > product.discountPrice) {
      return Math.round(((product.price - product.discountPrice) / product.price) * 100);
    }
    return 0;
  }

  getMainImage(product: Product): string {
    if (product.images && product.images.length > 0) {
      // Si c'est un objet avec url
      if (typeof product.images[0] === 'object' && product.images[0].url) {
        const mainImg = product.images.find((img: any) => img.isMain);
        return mainImg?.url || product.images[0].url;
      }
      // Si c'est une string directe
      return product.images[0];
    }
    return 'assets/placeholder.jpg';
  }

  isInStock(product: Product): boolean {
    return product.stock > 0;
  }

  isOnSale(product: Product): boolean {
    return this.getDiscountPercentage(product) > 0;
  }

  hasDiscount(product: Product): boolean {
    return this.getDiscountPercentage(product) > 0;
  }

  isFeatured(product: Product): boolean {
    return product.featured === true;
  }

  getProductId(product: Product): string {
    return product._id || product.id?.toString() || '';
  }
}
