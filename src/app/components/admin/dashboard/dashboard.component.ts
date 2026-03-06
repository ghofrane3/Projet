import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface DashboardStats {
  totalRevenue: number;
  revenueChange: number;
  totalOrders: number;
  ordersChange: number;
  activeClients: number;
  clientsChange: number;
  averageBasket: number;
  basketChange: number;
}

interface RecentOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  date: string;
  amount: number;
  status: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = true;

  stats: DashboardStats = {
    totalRevenue: 148200,
    revenueChange: 12.4,
    totalOrders: 842,
    ordersChange: 8.1,
    activeClients: 3241,
    clientsChange: 5.2,
    averageBasket: 176,
    basketChange: -2.1
  };

  recentOrders: RecentOrder[] = [
    {
      _id: '1',
      orderNumber: '#ME-2025-0214',
      customerName: 'Sophie Martin',
      date: '14 Fév 2025',
      amount: 620,
      status: 'LIVRÉ'
    }
  ];

  monthlyRevenue = [
    { month: 'Mar', revenue: 12000 },
    { month: 'Avr', revenue: 15000 },
    { month: 'Mai', revenue: 13000 },
    { month: 'Jun', revenue: 16000 },
    { month: 'Jul', revenue: 17500 },
    { month: 'Aoû', revenue: 18000 },
    { month: 'Sep', revenue: 14500 },
    { month: 'Oct', revenue: 16500 },
    { month: 'Nov', revenue: 18500 },
    { month: 'Déc', revenue: 19000 },
    { month: 'Jan', revenue: 17000 },
    { month: 'Fév', revenue: 19500 }
  ];

  clientDistribution = {
    femme: 60,
    homme: 30,
    autres: 10
  };

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loading = true;

    // Charger les stats depuis le backend
    this.http.get<any>('http://localhost:5000/api/admin/stats')
      .subscribe({
        next: (response) => {
          if (response.success && response.stats) {
            this.stats = {
              totalRevenue: response.stats.totalRevenue || 148200,
              revenueChange: 12.4,
              totalOrders: response.stats.totalOrders || 842,
              ordersChange: 8.1,
              activeClients: response.stats.totalUsers || 3241,
              clientsChange: 5.2,
              averageBasket: response.stats.averageBasket || 176,
              basketChange: -2.1
            };
          }
          this.loading = false;
        },
        error: () => {
          // Garder les données de démo si erreur
          this.loading = false;
        }
      });

    // Charger les commandes récentes
    this.http.get<any>('http://localhost:5000/api/admin/orders?limit=5')
      .subscribe({
        next: (response) => {
          if (response.success && response.orders) {
            this.recentOrders = response.orders.map((order: any) => ({
              _id: order._id,
              orderNumber: `#ME-${order._id.slice(-8)}`,
              customerName: order.userId?.name || 'Client',
              date: this.formatDate(order.createdAt),
              amount: order.totalAmount,
              status: this.translateStatus(order.status)
            }));
          }
        },
        error: () => {
          // Garder les données de démo
        }
      });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  translateStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'EN ATTENTE',
      'processing': 'EN COURS',
      'shipped': 'EXPÉDIÉ',
      'delivered': 'LIVRÉ',
      'cancelled': 'ANNULÉ'
    };
    return statusMap[status] || status.toUpperCase();
  }

  getStatusClass(status: string): string {
    const classMap: { [key: string]: string } = {
      'LIVRÉ': 'status-delivered',
      'EN COURS': 'status-processing',
      'EN ATTENTE': 'status-pending',
      'EXPÉDIÉ': 'status-shipped',
      'ANNULÉ': 'status-cancelled'
    };
    return classMap[status] || 'status-default';
  }

  getChangeClass(change: number): string {
    return change >= 0 ? 'positive' : 'negative';
  }

  getMaxRevenue(): number {
    return Math.max(...this.monthlyRevenue.map(m => m.revenue));
  }

  getRevenueHeight(revenue: number): number {
    const max = this.getMaxRevenue();
    return (revenue / max) * 100;
  }
}
