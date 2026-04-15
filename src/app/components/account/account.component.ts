import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { WishlistService } from '../../services/wishlist.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/product.model';

interface Order {
  _id: string;
  orderNumber: string;
  date: string;
  total: number;
  status: string;
  items: number;
}

interface ImageObject {
  url: string;
  isMain?: boolean;
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss']
})
export class AccountComponent implements OnInit {

  activeTab = 'profile';
  user: any = null;

  profileForm = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: ''
  };

  securityForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  orders: Order[] = [];
  wishlist: Product[] = [];

  stats = {
    totalOrders: 0,
    totalSpent: 0,
    wishlistCount: 0
  };

  loading = false;
  saving = false;
  error = '';
  success = '';

  constructor(
    private authService: AuthService,
    private wishlistService: WishlistService,
    private cartService: CartService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();

    if (this.user?.role === 'admin') {
      this.router.navigate(['/admin/dashboard']);
      return;
    }

    // Gestion du tab via queryParams (ex: ?tab=wishlist)
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        this.activeTab = params['tab'];
      }
    });

    this.loadUserData();
    this.loadOrders();
    this.loadWishlist();
  }

  // ====================== WISHLIST ======================
  private loadWishlist(): void {
    this.wishlist = this.wishlistService.getWishlist();
    this.stats.wishlistCount = this.wishlist.length;

    // Mise à jour en temps réel quand on ajoute/retire un produit
    this.wishlistService.watchWishlist().subscribe(products => {
      this.wishlist = products;
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

    const size = product.sizes && product.sizes.length > 0 ? product.sizes[0] : 'Unique';

    this.cartService.addToCart(product, 1, size, 'Standard');

    this.success = `"${product.name}" ajouté au panier ✓`;
    setTimeout(() => this.success = '', 3000);
  }

  getProductMainImage(product: Product): string {
    if (!product.images || product.images.length === 0) {
      return 'https://res.cloudinary.com/dn58shb9y/image/upload/v1/placeholder.jpg';
    }

    // Recherche d'une image principale
    const mainImg = product.images.find((img): img is ImageObject =>
      typeof img === 'object' && img !== null && 'isMain' in img && img.isMain === true
    );

    if (mainImg?.url) return mainImg.url;

    // Sinon première image
    const first = product.images[0];
    return typeof first === 'string' ? first : (first?.url || 'https://res.cloudinary.com/dn58shb9y/image/upload/v1/placeholder.jpg');
  }

  trackByProductId(index: number, product: Product): string {
    return (product._id || product.id || index).toString();
  }

  // ====================== PROFIL & COMMANDES (inchangés) ======================
  loadUserData(): void {
    if (this.user) {
      const [firstName, ...lastNameParts] = this.user.name.split(' ');
      this.profileForm = {
        firstName: firstName || '',
        lastName: lastNameParts.join(' ') || '',
        email: this.user.email || '',
        phone: this.user.phone || '',
        address: this.user.address || '',
        city: this.user.city || '',
        postalCode: this.user.postalCode || ''
      };
    }
  }

  loadOrders(): void {
    this.loading = true;

    this.http.get<any>('http://localhost:5000/api/orders/my-orders', {
      withCredentials: true
    }).subscribe({
      next: (response) => {
        if (response.success) {
          const rawOrders = response.orders || response.data || [];

          if (Array.isArray(rawOrders)) {
            this.orders = rawOrders.map((order: any) => {
              const itemsArray = Array.isArray(order.items) ? order.items
                               : Array.isArray(order.products) ? order.products
                               : [];
              return {
                _id: order._id,
                orderNumber: `#ME-${order._id.slice(-8)}`,
                date: this.formatDate(order.createdAt),
                total: order.totalAmount || order.total || 0,
                status: this.translateStatus(order.status),
                items: itemsArray.length
              };
            });

            this.stats.totalOrders = this.orders.length;
            this.stats.totalSpent = this.orders.reduce((sum, o) => sum + o.total, 0);
          }
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement commandes:', error);
        this.loading = false;
      }
    });
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.error = '';
    this.success = '';
  }

  onProfileSubmit(): void {
    this.saving = true;
    this.error = '';
    this.success = '';

    const updatedData = {
      name: `${this.profileForm.firstName} ${this.profileForm.lastName}`,
      phone: this.profileForm.phone,
      address: this.profileForm.address,
      city: this.profileForm.city,
      postalCode: this.profileForm.postalCode
    };

    this.http.put('http://localhost:5000/api/users/profile', updatedData, {
      withCredentials: true
    }).subscribe({
      next: () => {
        this.success = 'Profil mis à jour avec succès !';
        this.saving = false;
        if (this.authService.updateProfile) {
          this.authService.updateProfile(updatedData).subscribe();
        }
      },
      error: (error) => {
        this.error = error.error?.message || 'Erreur lors de la mise à jour';
        this.saving = false;
      }
    });
  }

  onSecuritySubmit(): void {
    if (this.securityForm.newPassword !== this.securityForm.confirmPassword) {
      this.error = 'Les mots de passe ne correspondent pas';
      return;
    }
    if (this.securityForm.newPassword.length < 8) {
      this.error = 'Le mot de passe doit contenir au moins 8 caractères';
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    this.http.put('http://localhost:5000/api/users/password', {
      currentPassword: this.securityForm.currentPassword,
      newPassword: this.securityForm.newPassword
    }, {
      withCredentials: true
    }).subscribe({
      next: () => {
        this.success = 'Mot de passe modifié avec succès !';
        this.securityForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
        this.saving = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Erreur lors de la modification';
        this.saving = false;
      }
    });
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/auth/login']),
      error: () => this.router.navigate(['/auth/login'])
    });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  translateStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'En attente',
      'processing': 'En cours',
      'shipped': 'Expédié',
      'delivered': 'Livré',
      'cancelled': 'Annulé'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    const classMap: { [key: string]: string } = {
      'Livré': 'status-delivered',
      'En cours': 'status-processing',
      'En attente': 'status-pending',
      'Expédié': 'status-shipped',
      'Annulé': 'status-cancelled'
    };
    return classMap[status] || 'status-default';
  }

  getInitials(): string {
    if (!this.user) return 'U';
    return this.user.name.split(' ')
      .map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
