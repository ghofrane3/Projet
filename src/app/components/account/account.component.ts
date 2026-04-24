// src/app/components/account/account.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { WishlistService } from '../../services/wishlist.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/product.model';

const API = 'http://localhost:5000/api';

interface DeliveryHistory {
  status:    string;
  message:   string;
  location:  string;
  timestamp: string;
}

interface DeliveryInfo {
  carrier:        string;
  trackingNumber: string;
  estimatedDate:  string;
  shippedAt:      string;
  deliveredAt:    string;
  notes:          string;
  history:        DeliveryHistory[];
}

interface Order {
  _id:             string;
  orderNumber:     string;
  date:            string;
  total:           number;
  status:          string;
  statusRaw:       string;
  items:           number;
  products:        any[];
  shippingAddress: any;
  delivery:        DeliveryInfo | null;
}

interface ImageObject { url: string; isMain?: boolean; }

@Component({
  selector:    'app-account',
  standalone:  true,
  imports:     [CommonModule, RouterModule, FormsModule],
  templateUrl: './account.component.html',
  styleUrls:   ['./account.component.scss']
})
export class AccountComponent implements OnInit {

  activeTab = 'profile';
  user: any  = null;

  profileForm = {
    firstName: '', lastName: '', email: '',
    phone: '', address: '', city: '', postalCode: ''
  };

  securityForm = {
    currentPassword: '', newPassword: '', confirmPassword: ''
  };

  orders:   Order[]   = [];
  wishlist: Product[] = [];

  stats = { totalOrders: 0, totalSpent: 0, wishlistCount: 0 };

  loading = false;
  saving  = false;
  error   = '';
  success = '';

  // ── Suivi de livraison ────────────────────────────────
  selectedOrderForTracking: Order | null = null;
  trackingLoading = false;

  constructor(
    private authService:     AuthService,
    private wishlistService: WishlistService,
    private cartService:     CartService,
    private http:            HttpClient,
    private router:          Router,
    private route:           ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();

    if (this.user?.role === 'admin') {
      this.router.navigate(['/admin/dashboard']);
      return;
    }

    this.route.queryParams.subscribe(params => {
      if (params['tab']) this.activeTab = params['tab'];
    });

    this.loadUserData();
    this.loadOrders();
    this.loadWishlist();
  }

  // ════════════════════════════════════════════════════════
  // COMMANDES avec info livraison
  // ════════════════════════════════════════════════════════
  loadOrders(): void {
    this.loading = true;

    this.http.get<any>(`${API}/orders/my-orders`, { withCredentials: true }).subscribe({
      next: (response) => {
        if (response.success) {
          const rawOrders = response.orders || [];
          this.orders = rawOrders.map((o: any) => {
            const itemsArray = Array.isArray(o.products) ? o.products : [];
            return {
              _id:             o._id,
              orderNumber:     `#ME-${o._id.slice(-8).toUpperCase()}`,
              date:            this.formatDate(o.createdAt),
              total:           o.totalAmount || 0,
              status:          this.translateStatus(o.status),
              statusRaw:       o.status,
              items:           itemsArray.length,
              products:        itemsArray,
              shippingAddress: o.shippingAddress || null,
              // ✅ On conserve les infos de livraison
              delivery: o.delivery && o.delivery.carrier ? {
                carrier:        o.delivery.carrier        || '',
                trackingNumber: o.delivery.trackingNumber || '',
                estimatedDate:  o.delivery.estimatedDate  || '',
                shippedAt:      o.delivery.shippedAt      || '',
                deliveredAt:    o.delivery.deliveredAt    || '',
                notes:          o.delivery.notes          || '',
                history:        o.delivery.history        || []
              } : null
            };
          });
          this.stats.totalOrders = this.orders.length;
          this.stats.totalSpent  = this.orders.reduce((s, o) => s + o.total, 0);
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // ════════════════════════════════════════════════════════
  // SUIVI DE LIVRAISON
  // ════════════════════════════════════════════════════════
  openTracking(order: Order): void {
    if (this.selectedOrderForTracking?._id === order._id) {
      this.selectedOrderForTracking = null;
      return;
    }

    this.trackingLoading = true;
    this.selectedOrderForTracking = order;

    // Recharger depuis le backend pour avoir les données fraîches
    this.http.get<any>(`${API}/orders/${order._id}`, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res.success && res.order) {
          const o = res.order;
          this.selectedOrderForTracking = {
            ...order,
            statusRaw: o.status,
            status:    this.translateStatus(o.status),
            delivery:  o.delivery?.carrier ? {
              carrier:        o.delivery.carrier        || '',
              trackingNumber: o.delivery.trackingNumber || '',
              estimatedDate:  o.delivery.estimatedDate  || '',
              shippedAt:      o.delivery.shippedAt      || '',
              deliveredAt:    o.delivery.deliveredAt    || '',
              notes:          o.delivery.notes          || '',
              history:        (o.delivery.history || []).sort(
                (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              )
            } : null
          };
        }
        this.trackingLoading = false;
      },
      error: () => { this.trackingLoading = false; }
    });
  }

  closeTracking(): void {
    this.selectedOrderForTracking = null;
  }

  // Retourne les étapes de progression pour la barre de statut
  getTrackingSteps(): { label: string; icon: string; key: string; done: boolean; active: boolean }[] {
    const statusRaw = this.selectedOrderForTracking?.statusRaw || 'pending';
    const order_index = ['pending','processing','shipped','delivered'].indexOf(statusRaw);

    return [
      { label: 'Commande reçue',    icon: '📋', key: 'pending',    done: order_index >= 0, active: order_index === 0 },
      { label: 'En préparation',    icon: '⚙️', key: 'processing', done: order_index >= 1, active: order_index === 1 },
      { label: 'Expédiée',         icon: '🚚', key: 'shipped',    done: order_index >= 2, active: order_index === 2 },
      { label: 'Livrée',           icon: '✅', key: 'delivered',  done: order_index >= 3, active: order_index === 3 },
    ];
  }

  isCancelled(): boolean {
    return this.selectedOrderForTracking?.statusRaw === 'cancelled';
  }

  getHistoryStatusLabel(status: string): string {
    const map: Record<string, string> = {
      assigned:     'Transporteur assigné',
      shipped:      'Expédié',
      in_transit:   'En transit',
      out_delivery: 'En cours de livraison',
      attempt:      'Tentative de livraison',
      held:         'Retenu en dépôt',
      returned:     'Retourné',
      delivered:    'Livré',
      custom:       'Mise à jour',
    };
    return map[status] || status;
  }

  formatDateShort(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  formatDateOnly(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // ════════════════════════════════════════════════════════
  // WISHLIST
  // ════════════════════════════════════════════════════════
  private loadWishlist(): void {
    this.wishlistService.refreshFromBackend();
    this.wishlistService.watchWishlist().subscribe((products: Product[]) => {
      this.wishlist            = products;
      this.stats.wishlistCount = products.length;
    });
  }

  removeFromWishlist(product: Product): void {
    const productId = (product._id || product.id)?.toString();
    if (productId) {
      this.wishlistService.removeFromWishlist(productId);
      this.success = 'Produit retiré de la liste de souhaits';
      setTimeout(() => this.success = '', 3000);
    }
  }

  addToCart(product: Product): void {
    if (!product.inStock) {
      this.error = 'Produit en rupture de stock';
      setTimeout(() => this.error = '', 3000);
      return;
    }
    const size = product.sizes?.length ? product.sizes[0] : 'Unique';
    this.cartService.addToCart(product, 1, size, 'Standard');
    this.success = `"${product.name}" ajouté au panier ✓`;
    setTimeout(() => this.success = '', 3000);
  }

  getProductMainImage(product: Product): string {
    if (!product.images?.length) return 'https://res.cloudinary.com/dn58shb9y/image/upload/v1/placeholder.jpg';
    const mainImg = product.images.find((img): img is ImageObject =>
      typeof img === 'object' && img !== null && 'isMain' in img && img.isMain === true
    );
    if (mainImg?.url) return mainImg.url;
    const first = product.images[0];
    return typeof first === 'string' ? first : (first?.url || 'https://res.cloudinary.com/dn58shb9y/image/upload/v1/placeholder.jpg');
  }

  trackByProductId(index: number, product: Product): string {
    return (product._id || product.id || index).toString();
  }

  // ════════════════════════════════════════════════════════
  // PROFIL
  // ════════════════════════════════════════════════════════
  loadUserData(): void {
    if (this.user) {
      const [firstName, ...lastNameParts] = this.user.name.split(' ');
      this.profileForm = {
        firstName: firstName || '',
        lastName:  lastNameParts.join(' ') || '',
        email:     this.user.email     || '',
        phone:     this.user.phone     || '',
        address:   this.user.address   || '',
        city:      this.user.city      || '',
        postalCode:this.user.postalCode|| ''
      };
    }
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.error = '';
    this.success = '';
  }

  onProfileSubmit(): void {
    this.saving = true;
    this.error  = '';
    this.success = '';
    const updatedData = {
      name:       `${this.profileForm.firstName} ${this.profileForm.lastName}`,
      phone:      this.profileForm.phone,
      address:    this.profileForm.address,
      city:       this.profileForm.city,
      postalCode: this.profileForm.postalCode
    };
    this.http.put(`${API}/users/profile`, updatedData, { withCredentials: true }).subscribe({
      next:  () => { this.success = 'Profil mis à jour avec succès !'; this.saving = false; },
      error: (e) => { this.error = e.error?.message || 'Erreur'; this.saving = false; }
    });
  }

  onSecuritySubmit(): void {
    if (this.securityForm.newPassword !== this.securityForm.confirmPassword) {
      this.error = 'Les mots de passe ne correspondent pas'; return;
    }
    if (this.securityForm.newPassword.length < 8) {
      this.error = 'Le mot de passe doit contenir au moins 8 caractères'; return;
    }
    this.saving = true;
    this.http.put(`${API}/users/password`, {
      currentPassword: this.securityForm.currentPassword,
      newPassword:     this.securityForm.newPassword
    }, { withCredentials: true }).subscribe({
      next:  () => { this.success = 'Mot de passe modifié !'; this.securityForm = { currentPassword:'', newPassword:'', confirmPassword:'' }; this.saving = false; },
      error: (e) => { this.error = e.error?.message || 'Erreur'; this.saving = false; }
    });
  }

  logout(): void {
    this.authService.logout().subscribe({
      next:  () => this.router.navigate(['/auth/login']),
      error: () => this.router.navigate(['/auth/login'])
    });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  translateStatus(status: string): string {
    const map: Record<string, string> = {
      pending:    'En attente',
      processing: 'En cours',
      shipped:    'Expédié',
      delivered:  'Livré',
      cancelled:  'Annulé'
    };
    return map[status] || status;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      'Livré':     'status-delivered',
      'En cours':  'status-processing',
      'En attente':'status-pending',
      'Expédié':   'status-shipped',
      'Annulé':    'status-cancelled'
    };
    return map[status] || 'status-default';
  }

  getInitials(): string {
    if (!this.user) return 'U';
    return this.user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
