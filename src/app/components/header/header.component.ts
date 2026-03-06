import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  isScrolled = false;
  cartOpen = false;
  cartItemsCount = 0;
  cartItems: any[] = [];

  constructor(
    public authService: AuthService,
    private router: Router,
    private cartService: CartService
  ) {
    // S'abonner au panier
    this.cartService.cartCount$.subscribe(count => {
      this.cartItemsCount = count;
    });

    this.cartService.cartItems$.subscribe(items => {
      this.cartItems = items;
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

  removeFromCart(productId: string) {
    this.cartService.removeFromCart(productId);
  }

  updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      this.removeFromCart(productId);
    } else {
      this.cartService.updateQuantity(productId, quantity);
    }
  }

  getCartTotal(): number {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  goToCheckout() {
    this.closeCart();
    this.router.navigate(['/checkout']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }
}
