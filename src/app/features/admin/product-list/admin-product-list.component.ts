import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { AdminProductService, AdminProduct } from '../../../services/admin-product.service';

@Component({
  selector: 'app-admin-product-list',
  templateUrl: './admin-product-list.component.html',
  styleUrls: ['./admin-product-list.component.scss']
})
export class AdminProductListComponent implements OnInit, OnDestroy {

  // ── État ──────────────────────────────────────────────────
  products: AdminProduct[] = [];
  loading = true;
  error = '';

  // ── Pagination ────────────────────────────────────────────
  currentPage = 1;
  totalPages = 1;
  total = 0;
  limit = 12;

  // ── Filtres ───────────────────────────────────────────────
  searchQuery = '';
  selectedCategory = '';
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  categories = ['T-shirts','Robes','Pantalons','Vestes','Pulls','Shorts',
                 'Jupes','Manteaux','Accessoires','Chaussures'];

  // ── Confirmation suppression ──────────────────────────────
  productToDelete: AdminProduct | null = null;
  deleteLoading = false;

  constructor(
    private adminProductService: AdminProductService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Debounce la recherche (500ms)
    this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentPage = 1;
      this.loadProducts();
    });

    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ────────────────────────────────────────────
  loadProducts(): void {
    this.loading = true;
    this.error = '';

    this.adminProductService
      .getProducts(this.currentPage, this.limit, this.searchQuery, this.selectedCategory)
      .subscribe({
        next: (res) => {
          this.products   = res.products;
          this.total      = res.total;
          this.totalPages = res.totalPages;
          this.loading    = false;
        },
        error: (err) => {
          this.error   = err.error?.message || 'Erreur lors du chargement des produits';
          this.loading = false;
        }
      });
  }

  // ── Recherche ─────────────────────────────────────────────
  onSearch(): void {
    this.searchSubject.next(this.searchQuery);
  }

  onCategoryChange(): void {
    this.currentPage = 1;
    this.loadProducts();
  }

  clearFilters(): void {
    this.searchQuery     = '';
    this.selectedCategory = '';
    this.currentPage     = 1;
    this.loadProducts();
  }

  // ── Pagination ────────────────────────────────────────────
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get pages(): number[] {
    const range = [];
    const start = Math.max(1, this.currentPage - 2);
    const end   = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  }

  // ── Navigation ────────────────────────────────────────────
  addProduct(): void {
    this.router.navigate(['/admin/products/new']);
  }

  editProduct(product: AdminProduct): void {
    this.router.navigate(['/admin/products/edit', product._id]);
  }

  // ── Suppression ───────────────────────────────────────────
  confirmDelete(product: AdminProduct): void {
    this.productToDelete = product;
  }

  cancelDelete(): void {
    this.productToDelete = null;
  }

  deleteProduct(): void {
    if (!this.productToDelete) return;
    this.deleteLoading = true;

    this.adminProductService.deleteProduct(this.productToDelete._id).subscribe({
      next: () => {
        this.deleteLoading   = false;
        this.productToDelete = null;
        this.loadProducts();
      },
      error: (err) => {
        this.deleteLoading = false;
        this.error = err.error?.message || 'Erreur lors de la suppression';
        this.productToDelete = null;
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  getMainImage(product: AdminProduct): string {
    const main = product.images?.find(img => img.isMain);
    return main?.url || product.images?.[0]?.url || '';
  }

  getStockClass(stock: number): string {
    if (stock > 10) return 'in-stock';
    if (stock > 0)  return 'low-stock';
    return 'out-stock';
  }

  getStockLabel(stock: number): string {
    if (stock > 10) return 'En stock';
    if (stock > 0)  return 'Stock faible';
    return 'Rupture';
  }
}
