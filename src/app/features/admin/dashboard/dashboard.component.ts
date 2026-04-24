// src/app/features/admin/dashboard/dashboard.component.ts
import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API = 'http://localhost:5000/api';

interface DashboardStats {
  totalRevenue: number; revenueChange: number;
  totalOrders: number;  ordersChange: number;
  activeClients: number; clientsChange: number;
  averageBasket: number; basketChange: number;
}

interface RecentOrder {
  _id: string; orderNumber: string; customerName: string;
  date: string; amount: number; status: string;
  hasDelivery: boolean; carrier: string; trackingNumber: string;
}

interface DeliveryStats {
  total: number; pending: number; processing: number;
  shipped: number; delivered: number; cancelled: number;
}

interface MonthlyRevenue { month: string; revenue: number; }
interface CategoryRevenue { category: string; revenue: number; }
interface TopProduct    { name: string; salesCount: number; category: string; }
interface LowStockItem  { _id: string; name: string; stock: number; category: string; price: number; }
interface CategoryStock { category: string; value: number; }
interface TopClient     { userId: string; name: string; email: string; totalSpent: number; orderCount: number; }
interface BasketTrend   { period: string; average: number; }

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {

  loading = true;
  activeSection: 'overview' | 'inventory' | 'clients' | 'funnel' = 'overview';

  stats: DashboardStats = {
    totalRevenue: 0, revenueChange: 0, totalOrders: 0, ordersChange: 0,
    activeClients: 0, clientsChange: 0, averageBasket: 0, basketChange: 0
  };

  // ✅ Stats livraison
  deliveryStats: DeliveryStats = {
    total: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0
  };

  recentOrders:    RecentOrder[]    = [];
  monthlyRevenue:  MonthlyRevenue[] = [];
  categoryRevenue: CategoryRevenue[] = [];
  topProducts:     TopProduct[]    = [];
  lowStockItems:   LowStockItem[]  = [];
  categoryStock:   CategoryStock[] = [];
  topClients:      TopClient[]     = [];
  basketTrend:     BasketTrend[]   = [];
  outOfStockCount  = 0;

  clientDistribution = { femme: 0, homme: 0, autres: 0 };

  funnel = { views: 0, cart: 0, checkout: 0, orders: 0 };

  lowStockThreshold = 10;

  constructor(private http: HttpClient) {}

  ngOnInit(): void    { this.loadAll(); }
  ngAfterViewInit(): void {}
  ngOnDestroy(): void {}

  setSection(s: 'overview' | 'inventory' | 'clients' | 'funnel'): void {
    this.activeSection = s;
  }

  loadAll(): void {
    this.loading = true;
    Promise.allSettled([
      this.loadStats(),
      this.loadDeliveryStats(),       // ✅ NOUVEAU
      this.loadRecentOrders(),
      this.loadMonthlyRevenue(),
      this.loadClientDistribution(),
      this.loadCategoryRevenue(),
      this.loadTopProducts(),
      this.loadLowStock(),
      this.loadCategoryStock(),
      this.loadTopClients(),
      this.loadBasketTrend(),
      this.loadFunnel()
    ]).then(() => { this.loading = false; });
  }

  // ── Stats principales ────────────────────────────────────
  private loadStats(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/stats`, { withCredentials: true }).subscribe({
        next: r => {
          if (r.success && r.stats) {
            this.stats = {
              totalRevenue:  r.stats.totalRevenue  || 0,
              revenueChange: r.stats.revenueChange || 0,
              totalOrders:   r.stats.totalOrders   || 0,
              ordersChange:  r.stats.ordersChange  || 0,
              activeClients: r.stats.totalUsers || r.stats.activeClients || 0,
              clientsChange: r.stats.clientsChange || 0,
              averageBasket: r.stats.averageBasket || 0,
              basketChange:  r.stats.basketChange  || 0
            };
          }
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  // ✅ Stats livraison depuis /api/delivery/stats
  private loadDeliveryStats(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/delivery/stats`, { withCredentials: true }).subscribe({
        next: r => {
          if (r.success && r.stats) {
            this.deliveryStats = r.stats;
          }
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  // ── Commandes récentes ────────────────────────────────────
  private loadRecentOrders(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/delivery?limit=5`, { withCredentials: true }).subscribe({
        next: r => {
          if (r.success && Array.isArray(r.orders)) {
            this.recentOrders = r.orders.map((o: any) => ({
              _id:           o._id,
              orderNumber:   `#ME-${o._id.slice(-8).toUpperCase()}`,
              customerName:  o.userId?.firstName
                ? `${o.userId.firstName} ${o.userId.lastName || ''}`.trim()
                : o.userId?.name || 'Client inconnu',
              date:          this.fmtDate(o.createdAt),
              amount:        o.totalAmount || 0,
              status:        this.translateStatus(o.status),
              hasDelivery:   !!(o.delivery?.carrier),
              carrier:       o.delivery?.carrier       || '',
              trackingNumber: o.delivery?.trackingNumber || ''
            }));
          }
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  // ── Revenu mensuel ────────────────────────────────────────
  private loadMonthlyRevenue(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/revenue/monthly`, { withCredentials: true }).subscribe({
        next: r => {
          if (r.success && Array.isArray(r.data)) {
            this.monthlyRevenue = r.data.map((d: any) => ({
              month:   this.fmtMonth(d.month),
              revenue: d.revenue || 0
            }));
          } else {
            this.monthlyRevenue = this.defaultMonths();
          }
          resolve();
        },
        error: () => { this.monthlyRevenue = this.defaultMonths(); resolve(); }
      });
    });
  }

  private loadClientDistribution(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/clients/distribution`, { withCredentials: true }).subscribe({
        next: r => {
          if (r.success && r.distribution) {
            this.clientDistribution = {
              femme:  r.distribution.femme  || 0,
              homme:  r.distribution.homme  || 0,
              autres: r.distribution.autres || 0
            };
          }
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  private loadCategoryRevenue(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/analytics/revenue-by-category`, { withCredentials: true }).subscribe({
        next: r => { if (r.success && Array.isArray(r.data)) this.categoryRevenue = r.data; resolve(); },
        error: () => resolve()
      });
    });
  }

  private loadTopProducts(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/analytics/top-products`, { withCredentials: true }).subscribe({
        next: r => { if (r.success && Array.isArray(r.data)) this.topProducts = r.data; resolve(); },
        error: () => resolve()
      });
    });
  }

  loadLowStock(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(
        `${API}/admin/products/low-stock?threshold=${this.lowStockThreshold}`,
        { withCredentials: true }
      ).subscribe({
        next: r => {
          if (r.success) {
            this.lowStockItems   = r.products || [];
            this.outOfStockCount = r.outOfStock || 0;
          }
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  private loadCategoryStock(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/analytics/stock-by-category`, { withCredentials: true }).subscribe({
        next: r => { if (r.success && Array.isArray(r.data)) this.categoryStock = r.data; resolve(); },
        error: () => resolve()
      });
    });
  }

  private loadTopClients(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/analytics/top-clients`, { withCredentials: true }).subscribe({
        next: r => { if (r.success && Array.isArray(r.data)) this.topClients = r.data; resolve(); },
        error: () => resolve()
      });
    });
  }

  private loadBasketTrend(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/analytics/basket-trend`, { withCredentials: true }).subscribe({
        next: r => { if (r.success && Array.isArray(r.data)) this.basketTrend = r.data; resolve(); },
        error: () => resolve()
      });
    });
  }

  private loadFunnel(): Promise<void> {
    return new Promise(resolve => {
      this.http.get<any>(`${API}/admin/analytics/funnel`, { withCredentials: true }).subscribe({
        next: r => { if (r.success && r.data) this.funnel = r.data; resolve(); },
        error: () => resolve()
      });
    });
  }

  // ── Helpers graphiques ────────────────────────────────────
  getMaxRevenue(): number { return Math.max(1, ...this.monthlyRevenue.map(m => m.revenue)); }
  getRevenueHeight(revenue: number): number { return (revenue / this.getMaxRevenue()) * 100; }
  getMaxCategoryRevenue(): number { return Math.max(1, ...this.categoryRevenue.map(c => c.revenue)); }
  getCategoryWidth(revenue: number): number { return (revenue / this.getMaxCategoryRevenue()) * 100; }
  getMaxTopProduct(): number { return Math.max(1, ...this.topProducts.map(p => p.salesCount)); }
  getProductWidth(count: number): number { return (count / this.getMaxTopProduct()) * 100; }
  getMaxCategoryStock(): number { return Math.max(1, ...this.categoryStock.map(c => c.value)); }
  getCategoryStockWidth(value: number): number { return (value / this.getMaxCategoryStock()) * 100; }
  getMaxBasket(): number { return Math.max(1, ...this.basketTrend.map(b => b.average)); }
  getBasketHeight(avg: number): number { return (avg / this.getMaxBasket()) * 100; }

  getDonutDasharray(pct: number): string {
    const circ = 251.2;
    return `${(pct / 100) * circ} ${circ}`;
  }
  getDonutOffset(prev: number): string {
    const circ = 251.2;
    return `-${(prev / 100) * circ}`;
  }

  getFunnelWidth(value: number): number {
    const max = Math.max(1, this.funnel.views);
    return (value / max) * 100;
  }
  getFunnelPct(value: number): number {
    const max = Math.max(1, this.funnel.views);
    return Math.round((value / max) * 100);
  }

  getStockClass(stock: number): string {
    if (stock === 0) return 'stock-out';
    if (stock <= 3)  return 'stock-critical';
    return 'stock-low';
  }

  // ── Utilitaires ───────────────────────────────────────────
  fmtDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  fmtMonth(n: number | string): string {
    const m = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    return m[(+n) - 1] || '';
  }
  translateStatus(s: string): string {
    return ({ pending:'EN ATTENTE', processing:'EN COURS', shipped:'EXPÉDIÉ', delivered:'LIVRÉ', cancelled:'ANNULÉ' } as any)[s] || s.toUpperCase();
  }
  getStatusClass(s: string): string {
    return ({ 'LIVRÉ':'delivered','EN COURS':'processing','EN ATTENTE':'pending','EXPÉDIÉ':'shipped','ANNULÉ':'cancelled' } as any)[s] || '';
  }
  getChangeClass(n: number): string { return n >= 0 ? 'positive' : 'negative'; }

  private defaultMonths(): MonthlyRevenue[] {
    return ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
      .map(month => ({ month, revenue: 0 }));
  }

  refreshDashboard(): void { this.loadAll(); }
}
