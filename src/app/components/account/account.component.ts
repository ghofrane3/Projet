import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { ProductService } from '../../services/product.service';
import { User, Order } from '../../models/user.model';
import { Product } from '../../models/product.model';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss']
})
export class AccountComponent implements OnInit {
  user: User | null = null;
  orders: Order[] = [];
  wishlist: Product[] = [];
  activeTab: 'profile' | 'orders' | 'wishlist' | 'settings' = 'profile';

  editMode = false;
  profileData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    zipCode: ''
  };

  constructor(
    private authService: AuthService,
    private orderService: OrderService,
    private productService: ProductService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();

    if (!this.user) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadUserData();
    this.loadOrders();
    this.loadWishlist();
  }

  loadUserData(): void {
    if (this.user) {
      this.profileData = {
        firstName: this.user.firstName,
        lastName: this.user.lastName,
        email: this.user.email,
        phone: this.user.phone || '',
        address: this.user.address || '',
        city: this.user.city || '',
        zipCode: this.user.zipCode || ''
      };
    }
  }

  loadOrders(): void {
    if (this.user) {
      this.orders = this.orderService.getUserOrders(this.user.id);
    }
  }

  loadWishlist(): void {
    // Simuler une liste de souhaits
    this.wishlist = this.productService.getFeaturedProducts();
  }

  updateProfile(): void {
    if (this.user) {
      const success = this.authService.updateProfile(this.profileData);
      if (success) {
        this.user = this.authService.getCurrentUser();
        this.editMode = false;
        alert('Profil mis à jour avec succès!');
      }
    }
  }

  getOrderStatusColor(status: string): string {
    const colors: {[key: string]: string} = {
      'pending': 'warning',
      'processing': 'info',
      'shipped': 'primary',
      'delivered': 'success',
      'cancelled': 'danger'
    };
    return colors[status] || 'secondary';
  }

  getOrderStatusText(status: string): string {
    const texts: {[key: string]: string} = {
      'pending': 'En attente',
      'processing': 'En traitement',
      'shipped': 'Expédiée',
      'delivered': 'Livrée',
      'cancelled': 'Annulée'
    };
    return texts[status] || status;
  }

  logout(): void {
    this.authService.logout();
  }

  cancelOrder(orderId: string): void {
    if (confirm('Êtes-vous sûr de vouloir annuler cette commande ?')) {
      const success = this.orderService.updateOrderStatus(orderId, 'cancelled');
      if (success) {
        this.loadOrders();
        alert('Commande annulée avec succès!');
      }
    }
  }

  removeFromWishlist(productId: number): void {
    this.wishlist = this.wishlist.filter(p => p.id !== productId);
    // Dans une vraie application, vous appelleriez un service ici
  }
}
