import { Component, OnInit } from '@angular/core';
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

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  loading = true;

  // Stats par défaut
  stats: DashboardStats = {
    totalRevenue: 0,
    revenueChange: 0,
    totalOrders: 0,
    ordersChange: 0,
    activeClients: 0,
    clientsChange: 0,
    averageBasket: 0,
    basketChange: 0
  };

  recentOrders: RecentOrder[] = [];
  monthlyRevenue: MonthlyRevenue[] = [];

  clientDistribution = {
    femme: 0,
    homme: 0,
    autres: 0
  };

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  // ════════════════════════════════════════════════════════════
  // CHARGER TOUTES LES DONNÉES DU DASHBOARD
  // ════════════════════════════════════════════════════════════
  loadDashboardData(): void {
    this.loading = true;

    Promise.all([
      this.loadStats(),
      this.loadRecentOrders(),
      this.loadMonthlyRevenue(),
      this.loadClientDistribution()
    ])
    .then(() => {
      this.loading = false;
      console.log('✅ Dashboard chargé avec succès');
    })
    .catch((error) => {
      console.error('❌ Erreur lors du chargement du dashboard :', error);
      this.loading = false;
    });
  }

  // ════════════════════════════════════════════════════════════
  // CHARGER LES STATISTIQUES PRINCIPALES
  // ════════════════════════════════════════════════════════════
  loadStats(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<any>('http://localhost:5000/api/admin/stats', {
        withCredentials: true
      }).subscribe({
        next: (response) => {
          console.log('📊 Stats reçues :', response);

          if (response.success && response.stats) {
            this.stats = {
              totalRevenue: response.stats.totalRevenue || 0,
              revenueChange: response.stats.revenueChange || 0,
              totalOrders: response.stats.totalOrders || 0,
              ordersChange: response.stats.ordersChange || 0,
              activeClients: response.stats.totalUsers || response.stats.activeClients || 0,
              clientsChange: response.stats.clientsChange || 0,
              averageBasket: response.stats.averageBasket || 0,
              basketChange: response.stats.basketChange || 0
            };
          }
          resolve();
        },
        error: (error) => {
          console.error('❌ Erreur chargement des stats :', error);
          reject(error);
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // CHARGER LES COMMANDES RÉCENTES
  // ════════════════════════════════════════════════════════════
  loadRecentOrders(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<any>('http://localhost:5000/api/orders?limit=5&sort=-createdAt', {
        withCredentials: true
      }).subscribe({
        next: (response) => {
          console.log('📦 Commandes récentes reçues :', response);

          if (response.success && response.orders && Array.isArray(response.orders)) {
            this.recentOrders = response.orders.map((order: any) => ({
              _id: order._id,
              orderNumber: `#ME-${order._id.slice(-8).toUpperCase()}`,
              customerName: order.userId?.name || 'Client inconnu',
              date: this.formatDate(order.createdAt),
              amount: order.totalAmount || 0,
              status: this.translateStatus(order.status)
            }));
          } else {
            console.warn('⚠️ Commandes récentes : aucune donnée valide');
            this.recentOrders = [];
          }
          resolve();
        },
        error: (error) => {
          console.error('❌ Erreur commandes récentes :', error);
          this.recentOrders = [];
          reject(error);
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // CHARGER LE REVENU MENSUEL
  // ════════════════════════════════════════════════════════════
  loadMonthlyRevenue(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<any>('http://localhost:5000/api/admin/revenue/monthly', {
        withCredentials: true
      }).subscribe({
        next: (response) => {
          console.log('💰 Revenu mensuel reçu :', response);

          if (response.success && response.data && Array.isArray(response.data)) {
            this.monthlyRevenue = response.data.map((item: any) => ({
              month: this.formatMonth(item.month),
              revenue: item.revenue || 0
            }));
          } else {
            console.warn('⚠️ Revenu mensuel : données invalides → utilisation des valeurs par défaut');
            this.monthlyRevenue = this.getDefaultMonthlyRevenue();
          }
          resolve();
        },
        error: (error) => {
          console.error('❌ Erreur revenu mensuel :', error);
          this.monthlyRevenue = this.getDefaultMonthlyRevenue();
          reject(error);
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // CHARGER LA DISTRIBUTION CLIENTS
  // ════════════════════════════════════════════════════════════
  loadClientDistribution(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<any>('http://localhost:5000/api/admin/clients/distribution', {
        withCredentials: true
      }).subscribe({
        next: (response) => {
          console.log('👥 Distribution clients reçue :', response);

          if (response.success && response.distribution) {
            this.clientDistribution = {
              femme: response.distribution.femme || 0,
              homme: response.distribution.homme || 0,
              autres: response.distribution.autres || 0
            };
          } else {
            console.warn('⚠️ Distribution clients : données invalides → valeurs à zéro');
            this.clientDistribution = { femme: 0, homme: 0, autres: 0 };
          }
          resolve();
        },
        error: (error) => {
          console.error('❌ Erreur distribution clients :', error);
          this.clientDistribution = { femme: 0, homme: 0, autres: 0 };
          reject(error);
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════════════════════════
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  formatMonth(monthNumber: number | string): string {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const num = typeof monthNumber === 'string' ? parseInt(monthNumber) : monthNumber;
    return months[num - 1] || '';
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
    if (this.monthlyRevenue.length === 0) return 1;
    return Math.max(...this.monthlyRevenue.map(m => m.revenue));
  }

  getRevenueHeight(revenue: number): number {
    const max = this.getMaxRevenue();
    if (max === 0) return 0;
    return (revenue / max) * 100;
  }

  // ════════════════════════════════════════════════════════════
  // DONNÉES PAR DÉFAUT
  // ════════════════════════════════════════════════════════════
  private getDefaultMonthlyRevenue(): MonthlyRevenue[] {
    return [
      { month: 'Jan', revenue: 0 },
      { month: 'Fév', revenue: 0 },
      { month: 'Mar', revenue: 0 },
      { month: 'Avr', revenue: 0 },
      { month: 'Mai', revenue: 0 },
      { month: 'Jun', revenue: 0 },
      { month: 'Jul', revenue: 0 },
      { month: 'Aoû', revenue: 0 },
      { month: 'Sep', revenue: 0 },
      { month: 'Oct', revenue: 0 },
      { month: 'Nov', revenue: 0 },
      { month: 'Déc', revenue: 0 }
    ];
  }

  // ════════════════════════════════════════════════════════════
  // RAFRAÎCHIR LE DASHBOARD
  // ════════════════════════════════════════════════════════════
  refreshDashboard(): void {
    this.loadDashboardData();
  }
}
