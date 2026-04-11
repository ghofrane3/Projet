import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CartService, CartItem } from '../../services/cart.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

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

  // ════════════════════════════════════════════════════════════
  // SEARCH
  // ════════════════════════════════════════════════════════════
  searchOpen = false;
  searchQuery = '';
  private searchSubject = new Subject<string>();

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

    // Debounce recherche
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(query => {
      if (query.trim()) {
        this.router.navigate(['/products'], { queryParams: { search: query.trim() } });
      }
    });
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 20;
  }

  // ════════════════════════════════════════════════════════════
  // SEARCH METHODS
  // ════════════════════════════════════════════════════════════

  toggleSearch() {
    this.searchOpen = !this.searchOpen;
    if (this.searchOpen) {
      setTimeout(() => {
        const input = document.querySelector('.search-input') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
    } else {
      this.searchQuery = '';
    }
  }

  closeSearch() {
    this.searchOpen = false;
    this.searchQuery = '';
  }

  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery = value;
    this.searchSubject.next(value);
  }

  onSearchSubmit(event: Event) {
    event.preventDefault();
    if (this.searchQuery.trim()) {
      this.router.navigate(['/products'], { queryParams: { search: this.searchQuery.trim() } });
      this.closeSearch();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.searchOpen) this.closeSearch();
    if (this.cartOpen) this.closeCart();
  }

  // ════════════════════════════════════════════════════════════
  // CART
  // ════════════════════════════════════════════════════════════

  toggleCart() {
    this.cartOpen = !this.cartOpen;
    document.body.style.overflow = this.cartOpen ? 'hidden' : '';
  }

  closeCart() {
    this.cartOpen = false;
    document.body.style.overflow = '';
  }

  removeFromCart(productId: string) {
    console.log('🗑️ Supprimer:', productId);

    this.cartService.removeFromCart(productId).subscribe({
      next: (response) => {
        console.log('✅ Supprimé:', response);
      },
      error: (error) => {
        console.error('❌ Erreur:', error);
      }
    });
  }

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
      }
    });
  }

  getCartTotal(): number {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  goToCheckout() {
    this.closeCart();
    this.router.navigate(['/cart/checkout']);
  }

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

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }
}
