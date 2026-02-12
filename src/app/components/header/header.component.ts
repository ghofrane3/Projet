import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  isMenuOpen = false;
  isUserMenuOpen = false;
  searchQuery = '';
  cartItemsCount = 0;
  cartTotal = 0;
  wishlistCount = 0;
  currentUser: any = null;

  private authSubscription: Subscription = new Subscription();
  private cartSubscription: Subscription = new Subscription();

  constructor(
    private authService: AuthService,
    private cartService: CartService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // S'abonner aux changements d'authentification
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      this.updateWishlistCount();
    });

    // S'abonner aux changements du panier
    this.cartSubscription = this.cartService.cart$.subscribe(cart => {
      this.cartItemsCount = this.cartService.getTotalItems();
      this.cartTotal = this.cartService.getTotalPrice();
    });

    // Fermer les menus au clic extérieur
    document.addEventListener('click', this.handleClickOutside.bind(this));
  }

  ngOnDestroy(): void {
    // Nettoyer les abonnements
    this.authSubscription.unsubscribe();
    this.cartSubscription.unsubscribe();
    document.removeEventListener('click', this.handleClickOutside.bind(this));
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-dropdown') && this.isUserMenuOpen) {
      this.closeUserMenu();
    }
    if (!target.closest('.nav') && !target.closest('.menu-btn') && this.isMenuOpen) {
      this.closeMenu();
    }
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  updateWishlistCount(): void {
    if (this.currentUser) {
      const wishlist = JSON.parse(localStorage.getItem(`wishlist_${this.currentUser.id}`) || '[]');
      this.wishlistCount = wishlist.length;
    } else {
      this.wishlistCount = 0;
    }
  }

  search(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/products'], {
        queryParams: { search: this.searchQuery }
      });
      this.searchQuery = '';
    }
  }

  goToCart(): void {
    this.router.navigate(['/cart']);
  }

  logout(): void {
    this.authService.logout();
    this.closeUserMenu();
    this.router.navigate(['/']);
  }
}
