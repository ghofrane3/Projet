import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CartService, CartItem } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent implements OnInit {
  cartItems: CartItem[] = [];
  total: number = 0;
  loading: boolean = false;

  constructor(
    private cartService: CartService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Vérifier connexion
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    // Charger le panier
    this.loadCart();

    // S'abonner aux changements
    this.cartService.cartItems$.subscribe(items => {
      this.cartItems = items;
      console.log('📦 Panier mis à jour:', items);
    });

    this.cartService.total$.subscribe(total => {
      this.total = total;
      console.log('💰 Total:', total);
    });
  }

  // ════════════════════════════════════════════════════════════
  // CHARGEMENT
  // ════════════════════════════════════════════════════════════

  loadCart(): void {
    this.loading = true;
    this.cartService.loadCart();
    setTimeout(() => {
      this.loading = false;
    }, 500);
  }

  // ════════════════════════════════════════════════════════════
  // AUGMENTER QUANTITÉ
  // ════════════════════════════════════════════════════════════

  increaseQuantity(item: CartItem): void {
    console.log('➕ Augmenter:', item.productId);

    const newQuantity = item.quantity + 1;

    this.cartService.updateQuantity(item.productId, newQuantity).subscribe({
      next: (response) => {
        console.log('✅ Quantité augmentée:', response);
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // DIMINUER QUANTITÉ
  // ════════════════════════════════════════════════════════════

  decreaseQuantity(item: CartItem): void {
    console.log('➖ Diminuer:', item.productId);

    if (item.quantity <= 1) {
      this.removeItem(item);
      return;
    }

    const newQuantity = item.quantity - 1;

    this.cartService.updateQuantity(item.productId, newQuantity).subscribe({
      next: (response) => {
        console.log('✅ Quantité diminuée:', response);
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // SUPPRIMER UN PRODUIT
  // ════════════════════════════════════════════════════════════

  removeItem(item: CartItem): void {
    console.log('🗑️ Supprimer:', item.productId);

    const confirmDelete = confirm(`Voulez-vous vraiment supprimer ${item.name} du panier ?`);
    if (!confirmDelete) return;

    this.cartService.removeFromCart(item.productId).subscribe({
      next: (response) => {
        console.log('✅ Produit supprimé:', response);
        if (response.success) {
        }
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // VIDER LE PANIER
  // ════════════════════════════════════════════════════════════

  clearCart(): void {
    console.log('🗑️ Vider le panier');

    const confirmClear = confirm('Voulez-vous vraiment vider votre panier ?');
    if (!confirmClear) return;

    this.cartService.clearCart().subscribe({
      next: (response) => {
        console.log('✅ Panier vidé:', response);
        if (response.success) {
        }
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════════

  goToCheckout(): void {
    if (this.isEmpty) {
      return;
    }
    this.router.navigate(['/cart/checkout']);
  }

  continueShopping(): void {
    this.router.navigate(['/products']);
  }

  // ════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════════════════════════

  getItemSubtotal(item: CartItem): number {
    return item.price * item.quantity;
  }

  get itemCount(): number {
    return this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  get isEmpty(): boolean {
    return this.cartItems.length === 0;
  }
}
