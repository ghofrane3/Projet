import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CartService } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service'; // ⭐ AJOUTER

interface Product {
  _id: string;
  name: string;
  price: number;
  originalPrice?: number;
  images: { url: string; isMain?: boolean }[];
  category: string;
  gender: string;
  sizes?: string[];
  colors?: { name: string; hex: string }[];
  stock: number;
  brand?: string;
}

@Component({
  selector: 'app-category',
  templateUrl: './category.component.html',
  styleUrls: ['./category.component.scss']
})
export class CategoryComponent implements OnInit {
  loading = true;
  products: Product[] = [];
  currentGender = '';
  currentCategory = '';
  sortBy = 'pertinence';

  // Filtres
  priceRange = { min: 0, max: 1200 };
  selectedCategories: string[] = [];
  selectedSizes: string[] = [];
  inStockOnly = false;
  inPromotionOnly = false;
  newArrivalsOnly = false;

  // Catégories par genre
  categoriesByGender: { [key: string]: string[] } = {
    'Femme': ['Robes', 'Manteaux', 'Pantalons', 'Tops', 'Accessoires'],
    'Homme': ['Costumes', 'Manteaux', 'Chemises', 'Pulls', 'Pantalons', 'Vestes']
  };

  availableSizes = ['XS', 'S', 'M', 'L', 'XL'];

  sortOptions = [
    { value: 'pertinence', label: 'Pertinence' },
    { value: '-createdAt', label: 'Nouveautés' },
    { value: 'price_asc', label: 'Prix croissant' },
    { value: 'price_desc', label: 'Prix décroissant' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private cartService: CartService,
    private authService: AuthService // ⭐ AJOUTER
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.currentGender = params['gender'] || '';
      this.currentCategory = params['category'] || '';
      this.loadProducts();
    });
  }

  loadProducts(): void {
    this.loading = true;
    let params = new HttpParams();

    if (this.currentGender) params = params.set('gender', this.currentGender);
    if (this.currentCategory) params = params.set('category', this.currentCategory);
    if (this.sortBy && this.sortBy !== 'pertinence') params = params.set('sort', this.sortBy);

    // Filtres de prix
    if (this.priceRange.min > 0) params = params.set('minPrice', this.priceRange.min.toString());
    if (this.priceRange.max < 1200) params = params.set('maxPrice', this.priceRange.max.toString());

    this.http.get<any>('http://localhost:5000/api/products', { params })
      .subscribe({
        next: (response) => {
          this.products = response.products || [];
          this.applyLocalFilters();
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur chargement produits:', error);
          this.loading = false;
        }
      });
  }

  applyLocalFilters(): void {
    let filtered = [...this.products];

    // Filtre catégories
    if (this.selectedCategories.length > 0) {
      filtered = filtered.filter(p => this.selectedCategories.includes(p.category));
    }

    // Filtre stock
    if (this.inStockOnly) {
      filtered = filtered.filter(p => p.stock > 0);
    }

    // Filtre promotions
    if (this.inPromotionOnly) {
      filtered = filtered.filter(p => p.originalPrice && p.originalPrice > p.price);
    }

    this.products = filtered;
  }

  toggleCategory(category: string): void {
    const index = this.selectedCategories.indexOf(category);
    if (index > -1) {
      this.selectedCategories.splice(index, 1);
    } else {
      this.selectedCategories.push(category);
    }
    this.applyLocalFilters();
  }

  isCategorySelected(category: string): boolean {
    return this.selectedCategories.includes(category);
  }

  onSortChange(): void {
    this.loadProducts();
  }

  onPriceRangeChange(): void {
    this.loadProducts();
  }

  resetFilters(): void {
    this.priceRange = { min: 0, max: 1200 };
    this.selectedCategories = [];
    this.selectedSizes = [];
    this.inStockOnly = false;
    this.inPromotionOnly = false;
    this.newArrivalsOnly = false;
    this.loadProducts();
  }

  switchGender(gender: string): void {
    this.router.navigate(['category/:subcategory'], { queryParams: { gender } });
  }

  getMainImage(product: Product): string {
    const mainImg = product.images.find(img => img.isMain);
    return mainImg?.url || product.images[0]?.url || 'assets/placeholder.jpg';
  }

  getDiscountPercent(product: Product): number {
    if (product.originalPrice && product.originalPrice > product.price) {
      return Math.round((1 - product.price / product.originalPrice) * 100);
    }
    return 0;
  }

  isOnSale(product: Product): boolean {
    return !!(product.originalPrice && product.originalPrice > product.price);
  }

  // ════════════════════════════════════════════════════════════
  // ✅ MÉTHODE CORRIGÉE - AJOUTER AU PANIER
  // ════════════════════════════════════════════════════════════

  addToCart(product: Product, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // ✅ Vérifier si l'utilisateur est connecté
    if (!this.authService.isAuthenticated()) {
      const login = confirm('Vous devez être connecté pour ajouter au panier. Se connecter maintenant ?');
      if (login) {
        this.router.navigate(['/auth/login']);
      }
      return;
    }

    // ✅ AJOUTER .subscribe() pour que la requête HTTP se lance
    this.cartService.addToCart(product, 1).subscribe({
      next: (response) => {
        console.log('✅ Réponse du serveur:', response);
        if (response.success) {
          alert(`✅ ${product.name} ajouté au panier !`);
        } else {
          alert('❌ Erreur lors de l\'ajout au panier');
        }
      },
      error: (error) => {
        console.error('❌ Erreur:', error);

        if (error.status === 401) {
          alert('❌ Vous devez être connecté pour ajouter au panier');
          this.router.navigate(['/auth/login']);
        } else if (error.status === 500) {
          alert('❌ Erreur serveur. Veuillez réessayer.');
        } else {
          alert('❌ Erreur lors de l\'ajout au panier');
        }
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // ✅ MÉTHODE CORRIGÉE - AJOUT RAPIDE
  // ════════════════════════════════════════════════════════════

  quickAddToCart(product: Product, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // ✅ Vérifier si l'utilisateur est connecté
    if (!this.authService.isAuthenticated()) {
      const login = confirm('Vous devez être connecté pour ajouter au panier. Se connecter maintenant ?');
      if (login) {
        this.router.navigate(['/auth/login']);
      }
      return;
    }

    // ✅ AJOUTER .subscribe()
    this.cartService.addToCart(product, 1).subscribe({
      next: (response) => {
        console.log('✅ Réponse du serveur:', response);
        if (response.success) {
          alert(`✅ ${product.name} ajouté au panier !`);
        }
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
        if (error.status === 401) {
          alert('❌ Vous devez être connecté');
          this.router.navigate(['/auth/login']);
        } else {
          alert('❌ Erreur lors de l\'ajout au panier');
        }
      }
    });
  }

  get pageTitle(): string {
    if (this.currentCategory) {
      return this.currentCategory;
    }
    return this.currentGender || 'Boutique';
  }

  get availableCategories(): string[] {
    return this.categoriesByGender[this.currentGender] || [];
  }

  get productsCount(): number {
    return this.products.length;
  }
}
