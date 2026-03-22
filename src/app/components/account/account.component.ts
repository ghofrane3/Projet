import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

interface Order {
  _id: string;
  orderNumber: string;
  date: string;
  total: number;
  status: string;
  items: number;
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
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    // ✅ VÉRIFIER SI L'UTILISATEUR EST ADMIN
    this.user = this.authService.getCurrentUser();

    if (this.user && this.user.role === 'admin') {
      // Rediriger l'admin vers son dashboard
      console.log('👤 Admin détecté → Redirection vers dashboard');
      this.router.navigate(['/admin/dashboard']);
      return;
    }

    // Continuer normalement pour les utilisateurs standards
    this.loadUserData();
    this.loadOrders();
    this.loadStats();
  }

  loadUserData(): void {
    if (this.user) {
      const [firstName, ...lastNameParts] = this.user.name.split(' ');
      this.profileForm = {
        firstName: firstName || '',
        lastName: lastNameParts.join(' ') || '',
        email: this.user.email || '',
        phone: '',
        address: '',
        city: '',
        postalCode: ''
      };
    }
  }

  loadOrders(): void {
    this.loading = true;

    this.http.get<any>('http://localhost:5000/api/orders/my-orders', {
      withCredentials: true // ✅ AJOUTER
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.orders = response.orders.map((order: any) => ({
            _id: order._id,
            orderNumber: `#ME-${order._id.slice(-8)}`,
            date: this.formatDate(order.createdAt),
            total: order.totalAmount,
            status: this.translateStatus(order.status),
            items: order.items.length
          }));
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('❌ Erreur chargement commandes:', error);
        this.loading = false;
      }
    });
  }

  loadStats(): void {
    this.http.get<any>('http://localhost:5000/api/users/stats', {
      withCredentials: true // ✅ AJOUTER
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.stats = response.stats;
        }
      },
      error: (error) => {
        console.error('❌ Erreur chargement stats:', error);
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
      withCredentials: true // ✅ AJOUTER
    }).subscribe({
      next: (response: any) => {
        this.success = 'Profil mis à jour avec succès !';
        this.saving = false;

        // Mettre à jour les données locales
        if (this.authService.updateProfile) {
          this.authService.updateProfile(updatedData).subscribe();
        }
      },
      error: (error) => {
        this.error = 'Erreur lors de la mise à jour';
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
      withCredentials: true // ✅ AJOUTER
    }).subscribe({
      next: () => {
        this.success = 'Mot de passe modifié avec succès !';
        this.securityForm = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        };
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
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
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
    return this.user.name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
