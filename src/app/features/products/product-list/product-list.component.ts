import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router }       from '@angular/router';
import { HttpClient, HttpParams }       from '@angular/common/http';
import { Subscription }                 from 'rxjs';

import { CartService }  from '../../../services/cart.service';
import { AuthService }  from '../../../services/auth.service';

interface Product {
  _id?:          string;
  id?:           number;
  name:          string;
  description?:  string;
  price:         number;
  originalPrice?: number;
  discountPrice?: number;
  images:        any[];
  category?:     string;
  brand?:        string;
  stock:         number;
  sizes?:        string[];
  colors?:       any[];
  rating?:       number;
  reviews?:      number;
  featured?:     boolean;
  tags?:         string[];
}

interface QueryParams {
  page: number;
  [key: string]: any;
}

@Component({
  selector:    'app-product-list',
  templateUrl: './product-list.component.html',
  styleUrls:   ['./product-list.component.scss']
})
export class ProductListComponent implements OnInit, OnDestroy {

  private readonly API = 'http://localhost:5000/api/products';

  // ── Produits & état ────────────────────────────────────
  products:   Product[] = [];
  loading     = false;
  isCached    = false;

  // ── Filtres actifs (lus depuis l'URL) ─────────────────
  currentSearch   = '';
  currentGender   = '';
  currentCategory = '';
  currentSort     = '-createdAt';
  currentPage     = 1;

  // ── Mode recherche ─────────────────────────────────────
  isSearchMode       = false;
  searchResultCount  = 0;

  // ── Filtres UI (catégories + tri) ─────────────────────
  categories: any[] = [
    { name: 'Vêtements' },
    { name: 'Chaussures' },
    { name: 'Accessoires' }
  ];
  selectedCategory = 'all';
  sortBy           = 'default';

  // ── Pagination ─────────────────────────────────────────
  pagination = { page: 1, limit: 20, total: 0, pages: 0 };

  private routeSub?: Subscription;

  constructor(
    private route:       ActivatedRoute,
    private router:      Router,
    private http:        HttpClient,
    private cartService: CartService,
    private authService: AuthService
  ) {}

  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════

  ngOnInit(): void {
    // Écouter TOUS les changements de queryParams (search, gender, etc.)
    // Déclenché automatiquement quand le header navigue avec ?search=xxx
    this.routeSub = this.route.queryParams.subscribe(params => {

      this.currentSearch   = params['search']   || '';
      this.currentGender   = params['gender']   || '';
      this.currentCategory = params['category'] || '';
      this.currentSort     = params['sort']     || '-createdAt';
      this.currentPage     = Number(params['page']) || 1;

      // Synchroniser le sélecteur de catégorie UI
      this.selectedCategory = this.currentCategory || this.currentGender || 'all';
      this.sortBy           = params['sort'] || 'default';

      // Mode recherche actif si un terme est présent
      this.isSearchMode = !!this.currentSearch.trim();

      // Charger les produits avec les filtres de l'URL
      this.loadProducts();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  // ════════════════════════════════════════════════════════
  // CHARGEMENT DES PRODUITS
  // Construit les paramètres HTTP depuis l'état courant
  // ════════════════════════════════════════════════════════

  loadProducts(): void {
    this.loading = true;

    let params = new HttpParams();

    // Ajouter les filtres actifs
    if (this.currentSearch.trim()) params = params.set('search',   this.currentSearch.trim());
    if (this.currentGender)        params = params.set('gender',   this.currentGender);
    if (this.currentCategory)      params = params.set('category', this.currentCategory);
    if (this.currentSort &&
        this.currentSort !== 'default') params = params.set('sort', this.currentSort);

    params = params.set('page',  String(this.currentPage));
    params = params.set('limit', '20');

    console.log('🔍 Chargement produits:', params.toString());

    this.http.get<any>(this.API, {
      params,
      withCredentials: true
    }).subscribe({
      next: (res) => {
        console.log('✅ Produits reçus:', res);

        if (res && res.products) {
          this.products   = res.products;
          this.pagination = res.pagination || {};
          this.isCached   = res._cached    || false;

          // Nombre de résultats pour la recherche
          this.searchResultCount = res.resultCount
            ?? res.pagination?.total
            ?? res.products.length;

        } else if (Array.isArray(res)) {
          this.products          = res;
          this.searchResultCount = res.length;
        } else {
          this.products          = [];
          this.searchResultCount = 0;
        }

        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Erreur chargement produits:', err);
        this.products = [];
        this.loading  = false;
      }
    });
  }

  // ════════════════════════════════════════════════════════
  // NAVIGATION — met à jour l'URL, queryParams déclenche le reload
  // ════════════════════════════════════════════════════════

  applyFilter(filters: {[key: string]: any}): void {
    // Partir des queryParams courants
    const current = { ...this.route.snapshot.queryParams };

    // Fusionner + reset page
    const merged: QueryParams = { ...current, ...filters, page: 1 };

    // Nettoyer les valeurs vides
    const next = Object.fromEntries(
      Object.entries(merged).filter(([_, value]) =>
        value !== '' && value !== null && value !== undefined
      )
    );

    this.router.navigate(['/products'], { queryParams: next });
  }

  // ── Filtre catégorie (boutons UI) ─────────────────────
  filterByCategory(category: string): void {
    this.selectedCategory = category;

    if (category === 'all') {
      // Supprimer tous les filtres catégorie/genre
      this.router.navigate(['/products'], {
        queryParams: { search: this.currentSearch || undefined }
      });
    } else {
      this.applyFilter({ category, gender: undefined });
    }
  }

  // ── Tri (select UI) ───────────────────────────────────
  sortProducts(event: any): void {
    const value: string = event.target.value;
    this.sortBy = value;

    if (value === 'default') {
      this.applyFilter({ sort: undefined });
      return;
    }

    // Mapping UI → paramètre sort backend
    const sortMap: {[k: string]: string} = {
      'price-low':  'price',
      'price-high': '-price',
      'rating':     '-rating',
      'name-asc':   'name',
      'name-desc':  '-name',
      'newest':     '-createdAt'
    };

    const sortParam = sortMap[value] || '-createdAt';
    this.applyFilter({ sort: sortParam });
  }

  // ── Effacer la recherche ──────────────────────────────
  clearSearch(): void {
    this.router.navigate(['/products']);
  }

  // ── Pagination ────────────────────────────────────────
  onPageChange(page: number): void {
    this.applyFilter({ page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Pages pour la pagination ──────────────────────────
  getPageArray(): number[] {
    return Array.from({ length: this.pagination.pages }, (_, i) => i + 1);
  }

  // ════════════════════════════════════════════════════════
  // PANIER
  // ════════════════════════════════════════════════════════

  addToCart(product: Product): void {
    if (!this.authService.isAuthenticated()) {
      const login = confirm('Vous devez être connecté pour ajouter au panier. Se connecter ?');
      if (login) this.router.navigate(['/auth/login']);
      return;
    }

    if (!this.isInStock(product)) {
      alert('❌ Ce produit est en rupture de stock');
      return;
    }

    const size  = product.sizes?.[0];
    const color = product.colors?.[0];

    this.cartService.addToCart(product, 1, size, color).subscribe({
      next: (res) => {
        if (res.success) alert(`✅ ${product.name} ajouté au panier !`);
      },
      error: (err) => {
        console.error('❌ Erreur panier:', err);
        if (err.status === 401) {
          alert('❌ Session expirée. Veuillez vous reconnecter.');
          this.router.navigate(['/auth/login']);
        } else {
          alert('❌ Erreur lors de l\'ajout au panier');
        }
      }
    });
  }

  // ════════════════════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════════════════════

  getDiscountPercentage(product: Product): number {
    if (product.originalPrice && product.originalPrice > product.price) {
      return Math.round(
        ((product.originalPrice - product.price) / product.originalPrice) * 100
      );
    }
    if (product.discountPrice && product.price > product.discountPrice) {
      return Math.round(
        ((product.price - product.discountPrice) / product.price) * 100
      );
    }
    return 0;
  }

  getMainImage(product: Product): string {
    if (!product.images?.length) return 'assets/placeholder.jpg';
    const img = product.images[0];
    if (typeof img === 'object' && img.url) {
      const main = product.images.find((i: any) => i.isMain);
      return main?.url || img.url;
    }
    return img || 'assets/placeholder.jpg';
  }

  isInStock(product: Product):   boolean { return product.stock > 0; }
  isOnSale(product: Product):    boolean { return this.getDiscountPercentage(product) > 0; }
  hasDiscount(product: Product): boolean { return this.getDiscountPercentage(product) > 0; }
  isFeatured(product: Product):  boolean { return product.featured === true; }

  getProductId(product: Product): string {
    return product._id || product.id?.toString() || '';
  }
}
