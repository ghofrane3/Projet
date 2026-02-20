import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface Stats {
  totalOrders: number;
  totalProducts: number;
  pendingOrders: number;
  totalRevenue: number;
}

interface Order {
  _id: string;
  userId: {
    name: string;
    email: string;
  };
  totalAmount: number;
  status: string;
  createdAt: string;
  products: any[];
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit {
  stats: Stats = {
    totalOrders: 0,
    totalProducts: 0,
    pendingOrders: 0,
    totalRevenue: 0
  };

  orders: Order[] = [];
  filteredOrders: Order[] = [];
  loading = true;
  error = '';

  // Filters
  statusFilter = 'all';
  searchTerm = '';

  constructor() {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    // TODO: Remplacer par de vraies requêtes API
    // Pour l'instant, données de démo

    setTimeout(() => {
      this.stats = {
        totalOrders: 156,
        totalProducts: 45,
        pendingOrders: 12,
        totalRevenue: 25840.50
      };

      this.orders = [
        {
          _id: '1',
          userId: { name: 'Jean Dupont', email: 'jean@example.com' },
          totalAmount: 159.99,
          status: 'pending',
          createdAt: new Date().toISOString(),
          products: []
        },
        {
          _id: '2',
          userId: { name: 'Marie Martin', email: 'marie@example.com' },
          totalAmount: 89.99,
          status: 'processing',
          createdAt: new Date().toISOString(),
          products: []
        },
        {
          _id: '3',
          userId: { name: 'Pierre Durand', email: 'pierre@example.com' },
          totalAmount: 249.99,
          status: 'shipped',
          createdAt: new Date().toISOString(),
          products: []
        }
      ];

      this.filteredOrders = [...this.orders];
      this.loading = false;
    }, 1000);
  }

  filterOrders(): void {
    this.filteredOrders = this.orders.filter(order => {
      const matchesStatus = this.statusFilter === 'all' || order.status === this.statusFilter;
      const matchesSearch = !this.searchTerm ||
        order.userId.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        order.userId.email.toLowerCase().includes(this.searchTerm.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }

  onStatusFilterChange(): void {
    this.filterOrders();
  }

  onSearchChange(): void {
    this.filterOrders();
  }

  updateOrderStatus(orderId: string, newStatus: string): void {
    console.log('Mise à jour du statut:', orderId, newStatus);
    // TODO: Appeler l'API pour mettre à jour le statut
    const order = this.orders.find(o => o._id === orderId);
    if (order) {
      order.status = newStatus;
      this.filterOrders();
    }
  }

  getStatusLabel(status: string): string {
    const labels: any = {
      'pending': 'En attente',
      'processing': 'En cours',
      'shipped': 'Expédiée',
      'delivered': 'Livrée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    const classes: any = {
      'pending': 'status-pending',
      'processing': 'status-processing',
      'shipped': 'status-shipped',
      'delivered': 'status-delivered',
      'cancelled': 'status-cancelled'
    };
    return classes[status] || '';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }
}
