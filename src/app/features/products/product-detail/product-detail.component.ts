import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { CartService } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service';
import { RecommendationService } from '../../../services/recommendation.service';

import { RecommendationWidgetComponent } from '../../../shared/recommendation-widget/recommendation-widget.component';

interface Product {
  _id: string;
  name: string;
  description: string;
  category: string;
  gender: string;
  price: number;
  originalPrice?: number;
  brand: string;
  condition: string;
  stock: number;
  images: { url: string; isMain: boolean }[];
  sizes?: string[];
  colors?: { name: string; hex: string }[];
  material?: string;
  care?: string;
  madeIn?: string;
  featured: boolean;
  trending: boolean;
}

@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss'],
  standalone: false, // On garde NgModule pour l'instant
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  product: Product | null = null;
  loading = true;
  error = '';

  // Sélections
  selectedImage = 0;
  selectedSize = '';
  selectedColor = '';
  quantity = 1;

  // États
  addedToCart = false;
  addedToFavorites = false;

  // Recommendation
  private recoService = inject(RecommendationService);
  private stopTracking!: () => void;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private cartService: CartService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const productId = params['id'];
      if (productId) {
        this.loadProduct(productId);
      }
    });
  }

  loadProduct(id: string): void {
    this.loading = true;
    this.error = '';

    this.http.get<any>(`http://localhost:5000/api/products/${id}`)
      .subscribe({
        next: (response) => {
          if (response.success && response.product) {
            this.product = response.product;

            // Sélection par défaut
            if (this.product?.sizes && this.product.sizes.length > 0) {
              this.selectedSize = this.product.sizes[0];
            }
            if (this.product?.colors && this.product.colors.length > 0) {
              this.selectedColor = this.product.colors[0].name;
            }

            // === TRACKING RECOMMENDATION ===
            if (this.product && this.product._id) {
  this.stopTracking = this.recoService.trackProductView(
    this.product._id,        // ← Doit être un string ObjectId valide
    this.product.category
  );
} else {
  console.warn('[Reco] Impossible de tracker : product ou _id manquant');
}
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur chargement produit:', error);
          this.error = 'Produit non trouvé';
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {
    // Enregistre le dwell time quand l'utilisateur quitte la page
    this.stopTracking?.();
  }

  // ====================== Méthodes existantes ======================

  selectImage(index: number): void {
    this.selectedImage = index;
  }

  selectSize(size: string): void {
    this.selectedSize = size;
  }

  selectColor(color: string): void {
    this.selectedColor = color;
  }

  incrementQuantity(): void {
    if (this.product && this.quantity < this.product.stock) {
      this.quantity++;
    }
  }

  decrementQuantity(): void {
    if (this.quantity > 1) {
      this.quantity--;
    }
  }

  addToCart(): void {
    if (!this.product) return;

    if (!this.authService.isAuthenticated()) {
      const login = confirm('Vous devez être connecté pour ajouter au panier. Se connecter maintenant ?');
      if (login) {
        localStorage.setItem('returnUrl', this.router.url);
        this.router.navigate(['/auth/login']);
      }
      return;
    }

    if (this.product.sizes && this.product.sizes.length > 0 && !this.selectedSize) {
      alert('Veuillez sélectionner une taille');
      return;
    }

    if (this.product.stock < this.quantity) {
      alert('Stock insuffisant');
      return;
    }

    this.cartService.addToCart(
      this.product,
      this.quantity,
      this.selectedSize,
      this.selectedColor
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.addedToCart = true;
          const goToCart = confirm('Produit ajouté au panier. Voir le panier ?');
          if (goToCart) {
            this.router.navigate(['/cart']);
          }
          setTimeout(() => this.addedToCart = false, 2000);
        }
      },
      error: (error) => {
        console.error('Erreur ajout panier:', error);
        if (error.status === 401) {
          this.router.navigate(['/auth/login']);
        }
      }
    });
  }

  toggleFavorite(): void {
    this.addedToFavorites = !this.addedToFavorites;
    // TODO: Implémenter avec backend
  }

  getMainImage(): string {
    if (!this.product || !this.product.images || this.product.images.length === 0) {
      return 'assets/placeholder.jpg';
    }
    return this.product.images[this.selectedImage]?.url || this.product.images[0].url;
  }

  getDiscountPercent(): number {
    if (!this.product || !this.product.originalPrice) return 0;
    return Math.round((1 - this.product.price / this.product.originalPrice) * 100);
  }

  isOnSale(): boolean {
    return this.getDiscountPercent() > 0;
  }

  isInStock(): boolean {
    return this.product ? this.product.stock > 0 : false;
  }
}
