import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CartService, CartItem } from '../../services/cart.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  isScrolled = false;
  cartOpen = false;
  cartItemsCount = 0;
  cartItems: CartItem[] = [];

  constructor(
    public authService: AuthService,
    private router: Router,
    private cartService: CartService
  ) {}

  ngOnInit(): void {
    // S'abonner au nombre d'articles
    this.cartService.cartCount$.subscribe(count => {
      this.cartItemsCount = count;
      console.log('🔢 Nombre articles:', count);
    });

    // S'abonner aux items
    this.cartService.cartItems$.subscribe(items => {
      this.cartItems = items;
      console.log('📦 Items:', items);
    });
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 20;
  }

  toggleCart() {
    this.cartOpen = !this.cartOpen;
    document.body.style.overflow = this.cartOpen ? 'hidden' : '';
  }

  closeCart() {
    this.cartOpen = false;
    document.body.style.overflow = '';
  }

  // ════════════════════════════════════════════════════════════
  // ✅ SUPPRIMER (AVEC .subscribe())
  // ════════════════════════════════════════════════════════════

  removeFromCart(productId: string) {
    console.log('🗑️ Supprimer:', productId);

    this.cartService.removeFromCart(productId).subscribe({
      next: (response) => {
        console.log('✅ Supprimé:', response);
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
        alert('❌ Erreur lors de la suppression');
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // ✅ METTRE À JOUR LA QUANTITÉ (AVEC .subscribe())
  // ════════════════════════════════════════════════════════════

  updateQuantity(productId: string, quantity: number) {
    console.log('🔄 Mettre à jour:', productId, 'Quantité:', quantity);

    if (quantity <= 0) {
      this.removeFromCart(productId);
      return;
    }

    this.cartService.updateQuantity(productId, quantity).subscribe({
      next: (response) => {
        console.log('✅ Quantité mise à jour:', response);
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
        alert('❌ Erreur lors de la mise à jour');
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // TOTAL DU PANIER
  // ════════════════════════════════════════════════════════════

  getCartTotal(): number {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  // ════════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════════

  goToCheckout() {
    this.closeCart();
    this.router.navigate(['/cart/checkout']);
  }

  // ════════════════════════════════════════════════════════════
  // DÉCONNEXION (AVEC .subscribe())
  // ════════════════════════════════════════════════════════════

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (error) => {
        console.error('❌ Erreur déconnexion:', error);
        this.router.navigate(['/']);
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }
}
