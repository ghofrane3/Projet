import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  size?: string;
  color?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private apiUrl = 'http://localhost:5000/api/cart';

  private cartItemsSubject = new BehaviorSubject<CartItem[]>([]);
  public cartItems$: Observable<CartItem[]> = this.cartItemsSubject.asObservable();

  private cartCountSubject = new BehaviorSubject<number>(0);
  public cartCount$: Observable<number> = this.cartCountSubject.asObservable();

  private totalSubject = new BehaviorSubject<number>(0);
  public total$: Observable<number> = this.totalSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadCart();
  }

  // ════════════════════════════════════════════════════════════
  // CHARGEMENT DEPUIS LE BACKEND
  // ════════════════════════════════════════════════════════════

  loadCart(): void {
    this.http.get<any>(this.apiUrl, { withCredentials: true })
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.cartItemsSubject.next(response.cart);
            this.totalSubject.next(response.total);
            this.updateCartCount();
          }
        },
        error: (error) => {
          console.error('Erreur chargement panier:', error);
          this.cartItemsSubject.next([]);
        }
      });
  }

  // ════════════════════════════════════════════════════════════
  // ACTIONS PANIER
  // ════════════════════════════════════════════════════════════

  addToCart(product: any, quantity: number = 1, size?: string, color?: string): Observable<any> {
    const data = {
      productId: product._id,
      name: product.name,
      price: product.price,
      quantity: quantity,
      image: this.getProductImage(product),
      size: size,
      color: color
    };

    return this.http.post<any>(`${this.apiUrl}/add`, data, { withCredentials: true })
      .pipe(
        tap((response) => {
          if (response.success) {
            this.cartItemsSubject.next(response.cart);
            this.totalSubject.next(response.total);
            this.updateCartCount();
          }
        })
      );
  }

  removeFromCart(productId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${productId}`, { withCredentials: true })
      .pipe(
        tap((response) => {
          if (response.success) {
            this.cartItemsSubject.next(response.cart);
            this.totalSubject.next(response.total);
            this.updateCartCount();
          }
        })
      );
  }

  updateQuantity(productId: string, quantity: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/update/${productId}`,
      { quantity },
      { withCredentials: true }
    ).pipe(
      tap((response) => {
        if (response.success) {
          this.cartItemsSubject.next(response.cart);
          this.totalSubject.next(response.total);
          this.updateCartCount();
        }
      })
    );
  }

  clearCart(): Observable<any> {
    return this.http.delete<any>(this.apiUrl, { withCredentials: true })
      .pipe(
        tap((response) => {
          if (response.success) {
            this.cartItemsSubject.next([]);
            this.totalSubject.next(0);
            this.updateCartCount();
          }
        })
      );
  }

  // ════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════════════════════════

  private updateCartCount(): void {
    const items = this.cartItemsSubject.value;
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    this.cartCountSubject.next(count);
  }

  getCartItems(): CartItem[] {
    return this.cartItemsSubject.value;
  }

  getCartCount(): number {
    return this.cartCountSubject.value;
  }

  getCartTotal(): number {
    return this.totalSubject.value;
  }

  private getProductImage(product: any): string {
    if (product.images && product.images.length > 0) {
      const mainImage = product.images.find((img: any) => img.isMain);
      if (mainImage) return mainImage.url;
      return product.images[0].url || product.images[0];
    }
    return 'assets/placeholder.jpg';
  }
}
