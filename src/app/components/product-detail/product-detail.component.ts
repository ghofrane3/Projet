import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CartService } from '../../services/cart.service';

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
  standalone: true,
  imports: [CommonModule, RouterModule],
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
    private http: HttpClient,
    private cartService: CartService
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

            // ✅ CORRECTION : Sélectionner la première taille par défaut
            if (this.product?.sizes && this.product.sizes.length > 0) {
              this.selectedSize = this.product.sizes[0];
            }

            // ✅ CORRECTION : Sélectionner la première couleur par défaut
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

  addToCart(): void {
    if (!this.product) return;

    if (!this.selectedSize) {
      alert('Veuillez sélectionner une taille');
      return;
    }

    this.cartService.addToCart(this.product, this.quantity);

    this.addedToCart = true;
    setTimeout(() => {
      this.addedToCart = false;
    }, 2000);
  }

  toggleFavorite(): void {
    this.addedToFavorites = !this.addedToFavorites;
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
