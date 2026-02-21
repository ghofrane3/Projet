import {
  Component, OnInit, OnDestroy,
  HostListener, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { RouterModule }  from '@angular/router';
import { FormsModule }   from '@angular/forms';
import { Router }        from '@angular/router';
import { AuthService }   from '../../services/auth.service';
import { CartService }   from '../../services/cart.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;

  // ── scroll state
  scrolled   = false;
  hidden     = false;
  private lastY = 0;

  // ── UI toggles
  menuOpen     = false;
  searchOpen   = false;
  userMenuOpen = false;

  // ── data
  searchQuery   = '';
  cartItemsCount = 0;
  cartTotal      = 0;
  wishlistCount  = 0;
  currentUser: any = null;

  private cartSub: any;

  constructor(
    private authService: AuthService,
    private cartService: CartService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Cart subscription
    try {
      this.cartSub = this.cartService.cart$.subscribe((items: any[]) => {
        this.cartItemsCount = items.reduce((s, i) => s + (i.quantity || 1), 0);
        this.cartTotal = items.reduce(
          (s, i) => s + ((i.product?.discountPrice || i.product?.price || 0) * (i.quantity || 1)),
          0
        );
      });
    } catch {}

    // Current user
    try {
      this.currentUser = this.authService.getCurrentUser?.() || null;
    } catch {}
  }

  ngOnDestroy(): void {
    this.cartSub?.unsubscribe?.();
  }

  // ── Scroll detection
  @HostListener('window:scroll')
  onScroll(): void {
    const y = window.scrollY;
    this.scrolled = y > 20;
    this.hidden   = y > 120 && y > this.lastY;
    this.lastY    = y;
  }

  // ── Click outside to close menus
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.header__user'))    this.userMenuOpen = false;
    if (!target.closest('.header__search'))  this.searchOpen   = false;
  }

  // ── Auth helpers
  isLoggedIn(): boolean {
    try { return this.authService.isLoggedIn?.() ?? false; }
    catch { return false; }
  }

  isAdmin(): boolean {
    try { return this.authService.isAdmin?.() ?? false; }
    catch { return false; }
  }

  logout(): void {
    try { this.authService.logout?.(); }
    catch {}
    this.router.navigate(['/']);
  }

  // ── Menu
  toggleMenu(): void  { this.menuOpen = !this.menuOpen; }
  closeMenu(): void   { this.menuOpen = false; }

  // ── Search
  toggleSearch(): void {
    this.searchOpen = !this.searchOpen;
    if (this.searchOpen) {
      setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 80);
    }
  }

  doSearch(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/products'], { queryParams: { q: this.searchQuery } });
      this.searchOpen   = false;
      this.searchQuery  = '';
    }
  }

  // ── User menu
  toggleUserMenu(): void { this.userMenuOpen = !this.userMenuOpen; }
  closeUserMenu(): void  { this.userMenuOpen = false; }

  // ── Cart
  goToCart(): void { this.router.navigate(['/cart']); }
}
