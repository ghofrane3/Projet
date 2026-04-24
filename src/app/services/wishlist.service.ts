import { Injectable } from '@angular/core';
import { HttpClient }  from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { Product } from '../models/product.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class WishlistService {

  private readonly API = 'http://localhost:5000/api/wishlist';

  private wishlistSubject = new BehaviorSubject<Product[]>([]);
  public  wishlist$ = this.wishlistSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    // Charger depuis le backend uniquement si l'utilisateur est connecté
    if (this.authService.isAuthenticated()) {
      this.refreshFromBackend();
    }
  }

  // ── Chargement backend ──────────────────────────────────
  refreshFromBackend(): void {
    this.http.get<any>(this.API, { withCredentials: true }).subscribe({
      next: (res) => {
        const products: Product[] = res.wishlist || [];
        this.wishlistSubject.next(products);
      },
      error: (err) => {
        // 401 = non connecté : liste vide, pas de crash
        console.warn('Wishlist non chargée (utilisateur non connecté ?):', err.status);
        this.wishlistSubject.next([]);
      }
    });
  }

  // ── API synchrone (pour account.component + home.component) ─
  getWishlist(): Product[] {
    return this.wishlistSubject.value;
  }

  getWishlistCount(): number {
    return this.wishlistSubject.value.length;
  }

  isInWishlist(productId: string | number | undefined): boolean {
    if (!productId) return false;
    const idStr = String(productId);
    return this.wishlistSubject.value.some(p =>
      (p._id || p.id)?.toString() === idStr
    );
  }

  // ── Observable (pour account.component watchWishlist) ─
  watchWishlist(): Observable<Product[]> {
    return this.wishlist$;
  }

  // ── Mutations avec optimistic update ──────────────────
  addToWishlist(product: Product): void {
    const productId = (product._id || product.id)?.toString();
    if (!productId || this.isInWishlist(productId)) return;

    // Optimistic update immédiat
    this.wishlistSubject.next([...this.wishlistSubject.value, product]);

    this.http.post(`${this.API}/${productId}`, {}, { withCredentials: true }).subscribe({
      error: () => {
        // Rollback si le backend refuse (ex: non connecté)
        this.wishlistSubject.next(
          this.wishlistSubject.value.filter(p =>
            (p._id || p.id)?.toString() !== productId
          )
        );
      }
    });
  }

  removeFromWishlist(productId: string | number | undefined): void {
    if (!productId) return;
    const idStr = String(productId);

    // Optimistic update
    const before = this.wishlistSubject.value;
    this.wishlistSubject.next(before.filter(p =>
      (p._id || p.id)?.toString() !== idStr
    ));

    this.http.delete(`${this.API}/${idStr}`, { withCredentials: true }).subscribe({
      error: () => {
        // Rollback
        this.wishlistSubject.next(before);
      }
    });
  }

  toggleWishlist(product: Product): void {
    const productId = (product._id || product.id)?.toString();
    if (!productId) return;
    if (this.isInWishlist(productId)) {
      this.removeFromWishlist(productId);
    } else {
      this.addToWishlist(product);
    }
  }

  clearWishlist(): void {
    this.wishlistSubject.next([]);
  }
}
