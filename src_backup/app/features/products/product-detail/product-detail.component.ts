import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'; // ⭐ AJOUTER Router
import { HttpClient } from '@angular/common/http';
import { CartService } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service'; // ⭐ AJOUTER

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
  styleUrls: ['./product-detail.component.scss']
})
export class ProductDetailComponent implements OnInit {
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

  constructor(
    private route: ActivatedRoute,
    private router: Router, // ⭐ AJOUTER
    private http: HttpClient,
    private cartService: CartService,
    private authService: AuthService // ⭐ AJOUTER
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

            // Sélectionner la première taille par défaut
            if (this.product?.sizes && this.product.sizes.length > 0) {
              this.selectedSize = this.product.sizes[0];
            }

            // Sélectionner la première couleur par défaut
            if (this.product?.colors && this.product.colors.length > 0) {
              this.selectedColor = this.product.colors[0].name;
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

  // ════════════════════════════════════════════════════════════
  // ✅ MÉTHODE CORRIGÉE - AJOUTER AU PANIER
  // ════════════════════════════════════════════════════════════

  addToCart(): void {
    if (!this.product) {
      alert('❌ Produit non disponible');
      return;
    }

    // ✅ Vérifier si l'utilisateur est connecté
    if (!this.authService.isAuthenticated()) {
      const login = confirm('Vous devez être connecté pour ajouter au panier. Se connecter maintenant ?');
      if (login) {
        // Sauvegarder l'URL actuelle pour revenir après connexion
        localStorage.setItem('returnUrl', this.router.url);
        this.router.navigate(['/auth/login']);
      }
      return;
    }

    // ✅ Vérifier la taille
    if (this.product.sizes && this.product.sizes.length > 0 && !this.selectedSize) {
      alert('⚠️ Veuillez sélectionner une taille');
      return;
    }

    // ✅ Vérifier le stock
    if (this.product.stock < this.quantity) {
      alert('⚠️ Stock insuffisant');
      return;
    }

    // ✅ AJOUTER .subscribe() pour que la requête HTTP se lance
    this.cartService.addToCart(
      this.product,
      this.quantity,
      this.selectedSize,
      this.selectedColor
    ).subscribe({
      next: (response) => {
        console.log('✅ Réponse du serveur:', response);

        if (response.success) {
          // Animation de succès
          this.addedToCart = true;

          // Message de confirmation
          alert(`✅ ${this.quantity} x ${this.product?.name} ajouté au panier !`);

          // Proposer d'aller au panier
          const goToCart = confirm('Voir le panier ?');
          if (goToCart) {
            this.router.navigate(['/cart']);
          }

          // Réinitialiser après 2 secondes
          setTimeout(() => {
            this.addedToCart = false;
          }, 2000);
        } else {
          alert('❌ Erreur lors de l\'ajout au panier');
        }
      },
      error: (error) => {
        console.error('❌ Erreur:', error);

        if (error.status === 401) {
          alert('❌ Session expirée. Veuillez vous reconnecter.');
          this.router.navigate(['/auth/login']);
        } else if (error.status === 400) {
          alert('❌ Données invalides. Vérifiez votre sélection.');
        } else if (error.status === 500) {
          alert('❌ Erreur serveur. Veuillez réessayer.');
        } else {
          alert('❌ Erreur lors de l\'ajout au panier');
        }

        this.addedToCart = false;
      }
    });
  }

  toggleFavorite(): void {
    this.addedToFavorites = !this.addedToFavorites;
    // TODO: Implémenter la logique de favoris avec le backend
  }

  getMainImage(): string {
    if (!this.product || !this.product.images || this.product.images.length === 0) {
      return 'assets/placeholder.jpg';
    }
    return this.product.images[this.selectedImage]?.url || this.product.images[0].url;
  }

  getDiscountPercent(): number {
    if (!this.product || !this.product.originalPrice) return 0;
    if (this.product.originalPrice > this.product.price) {
      return Math.round((1 - this.product.price / this.product.originalPrice) * 100);
    }
    return 0;
  }

  isOnSale(): boolean {
    return this.getDiscountPercent() > 0;
  }

  isInStock(): boolean {
    return this.product ? this.product.stock > 0 : false;
  }
}
