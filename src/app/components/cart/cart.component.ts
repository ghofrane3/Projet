import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

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
  // ✅ OBSERVABLES - NE PAS SUPPRIMER
  private cartItemsSubject = new BehaviorSubject<CartItem[]>([]);
  public cartItems$: Observable<CartItem[]> = this.cartItemsSubject.asObservable();

  private cartCountSubject = new BehaviorSubject<number>(0);
  public cartCount$: Observable<number> = this.cartCountSubject.asObservable();

  constructor() {
    this.loadCartFromStorage();
  }

  private loadCartFromStorage(): void {
    try {
      const saved = localStorage.getItem('cart');
      if (saved) {
        const items: CartItem[] = JSON.parse(saved);
        this.cartItemsSubject.next(items);
        this.updateCartCount();
      }
    } catch (error) {
      console.error('Erreur chargement panier:', error);
    }
  }

  private saveCartToStorage(): void {
    try {
      localStorage.setItem('cart', JSON.stringify(this.cartItemsSubject.value));
      this.updateCartCount();
    } catch (error) {
      console.error('Erreur sauvegarde panier:', error);
    }
  }

  private updateCartCount(): void {
    const count = this.cartItemsSubject.value.reduce((sum, item) => sum + item.quantity, 0);
    this.cartCountSubject.next(count);
  }

  addToCart(product: any, quantity: number = 1): void {
    const items = [...this.cartItemsSubject.value];
    const existingItem = items.find(item => item.productId === product._id);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      items.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: quantity,
        image: product.images?.[0]?.url || 'assets/placeholder.jpg'
      });
    }

    this.cartItemsSubject.next(items);
    this.saveCartToStorage();
  }

  removeFromCart(productId: string): void {
    const items = this.cartItemsSubject.value.filter(item => item.productId !== productId);
    this.cartItemsSubject.next(items);
    this.saveCartToStorage();
  }

  updateQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeFromCart(productId);
      return;
    }

    const items = [...this.cartItemsSubject.value];
    const item = items.find(i => i.productId === productId);

    if (item) {
      item.quantity = quantity;
      this.cartItemsSubject.next(items);
      this.saveCartToStorage();
    }
  }

  clearCart(): void {
    this.cartItemsSubject.next([]);
    this.saveCartToStorage();
  }

  getCartItems(): CartItem[] {
    return this.cartItemsSubject.value;
  }

  getCartCount(): number {
    return this.cartCountSubject.value;
  }

  getCartTotal(): number {
    return this.cartItemsSubject.value.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
}
