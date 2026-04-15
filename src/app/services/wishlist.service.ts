import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Product } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class WishlistService {
  private readonly STORAGE_KEY = 'fashion_store_wishlist';
  private wishlistSubject = new BehaviorSubject<Product[]>(this.loadWishlist());

  public wishlist$ = this.wishlistSubject.asObservable();

  constructor() {
    this.loadWishlist();
  }

  private loadWishlist(): Product[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Erreur chargement wishlist:', error);
      return [];
    }
  }

  private saveWishlist(wishlist: Product[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(wishlist));
      this.wishlistSubject.next(wishlist);
    } catch (error) {
      console.error('Erreur sauvegarde wishlist:', error);
    }
  }

  getWishlist(): Product[] {
    return this.wishlistSubject.value;
  }

  getWishlistCount(): number {
    return this.wishlistSubject.value.length;
  }

  isInWishlist(productId: string | number | undefined): boolean {
    if (!productId) return false;
    const idStr = String(productId);
    return this.wishlistSubject.value.some(item => {
      const itemId = (item._id || item.id)?.toString();
      return itemId === idStr;
    });
  }

  addToWishlist(product: Product): void {
    const wishlist = this.wishlistSubject.value;
    const productId = (product._id || product.id)?.toString();
    if (!productId) return;

    if (this.isInWishlist(productId)) return;

    const updated = [...wishlist, product];
    this.saveWishlist(updated);
    console.log(`✓ Produit "${product.name}" ajouté à la wishlist`);
  }

  removeFromWishlist(productId: string | number | undefined): void {
    if (!productId) return;
    const idStr = String(productId);

    const updated = this.wishlistSubject.value.filter(item => {
      const itemId = (item._id || item.id)?.toString();
      return itemId !== idStr;
    });

    this.saveWishlist(updated);
    console.log('✓ Produit retiré de la wishlist');
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
    this.saveWishlist([]);
    console.log('✓ Wishlist vidée');
  }

  watchWishlist(): Observable<Product[]> {
    return this.wishlist$;
  }
}
