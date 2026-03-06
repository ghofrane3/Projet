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
  // Observables pour le panier
  private cartItemsSubject = new BehaviorSubject<CartItem[]>([]);
  public cartItems$: Observable<CartItem[]> = this.cartItemsSubject.asObservable();

  private cartCountSubject = new BehaviorSubject<number>(0);
  public cartCount$: Observable<number> = this.cartCountSubject.asObservable();

  constructor() {
    // Charger le panier depuis localStorage au démarrage
    this.loadCartFromStorage();
  }

  // ════════════════════════════════════════════════════════════
  // CHARGEMENT & SAUVEGARDE
  // ════════════════════════════════════════════════════════════

  private loadCartFromStorage(): void {
    try {
      const saved = localStorage.getItem('maison-elite-cart');
      if (saved) {
        const items: CartItem[] = JSON.parse(saved);
        this.cartItemsSubject.next(items);
        this.updateCartCount();
      }
    } catch (error) {
      console.error('Erreur chargement panier:', error);
      this.cartItemsSubject.next([]);
    }
  }

  private saveCartToStorage(): void {
    try {
      const items = this.cartItemsSubject.value;
      localStorage.setItem('maison-elite-cart', JSON.stringify(items));
      this.updateCartCount();
    } catch (error) {
      console.error('Erreur sauvegarde panier:', error);
    }
  }

  private updateCartCount(): void {
    const items = this.cartItemsSubject.value;
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    this.cartCountSubject.next(count);
  }

  // ════════════════════════════════════════════════════════════
  // ACTIONS PANIER
  // ════════════════════════════════════════════════════════════

  /**
   * Ajouter un produit au panier
   */
  addToCart(product: any, quantity: number = 1, size?: string, color?: string): void {
    const items = [...this.cartItemsSubject.value];

    // Vérifier si le produit existe déjà
    const existingItemIndex = items.findIndex(
      item => item.productId === product._id &&
              item.size === size &&
              item.color === color
    );

    if (existingItemIndex > -1) {
      // Augmenter la quantité
      items[existingItemIndex].quantity += quantity;
    } else {
      // Ajouter nouveau produit
      const newItem: CartItem = {
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: quantity,
        image: this.getProductImage(product),
        size: size,
        color: color
      };
      items.push(newItem);
    }

    this.cartItemsSubject.next(items);
    this.saveCartToStorage();

    console.log('✅ Produit ajouté au panier:', product.name);
  }

  /**
   * Retirer un produit du panier
   */
  removeFromCart(productId: string): void {
    const items = this.cartItemsSubject.value.filter(
      item => item.productId !== productId
    );

    this.cartItemsSubject.next(items);
    this.saveCartToStorage();

    console.log('✅ Produit retiré du panier');
  }

  /**
   * Mettre à jour la quantité d'un produit
   */
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

      console.log('✅ Quantité mise à jour');
    }
  }

  /**
   * Vider le panier
   */
  clearCart(): void {
    this.cartItemsSubject.next([]);
    this.saveCartToStorage();

    console.log('✅ Panier vidé');
  }

  // ════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════

  /**
   * Obtenir les items du panier (valeur actuelle)
   */
  getCartItems(): CartItem[] {
    return this.cartItemsSubject.value;
  }

  /**
   * Obtenir le nombre d'items (valeur actuelle)
   */
  getCartCount(): number {
    return this.cartCountSubject.value;
  }

  /**
   * Calculer le total du panier
   */
  getCartTotal(): number {
    const items = this.cartItemsSubject.value;
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  /**
   * Vérifier si un produit est dans le panier
   */
  isInCart(productId: string): boolean {
    return this.cartItemsSubject.value.some(item => item.productId === productId);
  }

  /**
   * Obtenir la quantité d'un produit dans le panier
   */
  getProductQuantity(productId: string): number {
    const item = this.cartItemsSubject.value.find(i => i.productId === productId);
    return item ? item.quantity : 0;
  }

  // ════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════════════════════════

  private getProductImage(product: any): string {
    if (product.images && product.images.length > 0) {
      // Trouver l'image principale
      const mainImage = product.images.find((img: any) => img.isMain);
      if (mainImage) return mainImage.url;

      // Sinon prendre la première
      return product.images[0].url || product.images[0];
    }

    return 'assets/placeholder.jpg';
  }
}
