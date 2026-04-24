import { User } from '../../../models/user.model';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Order, OrderStatus, ORDER_STATUS_CONFIG } from '../../../models/user.model';

const API = 'http://localhost:5000/api';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss'],
})
export class OrdersComponent implements OnInit {
  orders: Order[] = [];
  filtered: Order[] = [];
  loading = false;
  search = '';
  statusFilter: OrderStatus | '' = '';
  selectedOrder: Order | null = null;

  readonly STATUS_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
    { value: '', label: 'Tous les statuts' },
    { value: 'pending', label: 'En attente' },
    { value: 'processing', label: 'En préparation' },
    { value: 'shipped', label: 'Expédiée' },
    { value: 'delivered', label: 'Livrée' },
    { value: 'cancelled', label: 'Annulée' },
  ];

  readonly NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
    pending: 'processing',
    processing: 'shipped',
    shipped: 'delivered',
  };

  statusConfig = ORDER_STATUS_CONFIG;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void { this.loadOrders(); }

  loadOrders(): void {
    this.loading = true;

    // ✅ MODIFICATION : Utiliser la route admin qui récupère TOUTES les commandes
    this.http.get<any>(`${API}/orders/admin/all`).subscribe({
      next: (res) => {
        console.log('✅ Commandes reçues:', res.count, 'commandes');
        console.log('Source:', res.source || 'database');

        this.orders = res.orders || res || [];
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Erreur chargement commandes:', err);

        // Si erreur 403 (pas admin), rediriger
        if (err.status === 403) {
          console.warn('⚠️ Accès refusé - Utilisateur non admin');
          this.router.navigate(['/']);
        }

        this.orders = [];
        this.filtered = [];
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    let list = [...this.orders];

    if (this.statusFilter) {
      list = list.filter((o) => o.status === this.statusFilter);
    }

    if (this.search.trim()) {
      const q = this.search.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.id?.toLowerCase().includes(q) ||
          String(o.userId).includes(q) ||
          o.items?.some((i) => i.name?.toLowerCase().includes(q))
      );
    }

    this.filtered = list;
    console.log(`📊 Filtres appliqués: ${this.filtered.length}/${this.orders.length} commandes affichées`);
  }

  getStatusLabel(status: string): string {
    return this.statusConfig[status as OrderStatus]?.label || status;
  }

  getStatusColor(status: string): string {
    return this.statusConfig[status as OrderStatus]?.color || 'gray';
  }

  getNextStatusLabel(status: OrderStatus): string {
    const next = this.NEXT_STATUS[status];
    return next ? this.statusConfig[next]?.label : '';
  }

  canAdvance(status: OrderStatus): boolean {
    return !!this.NEXT_STATUS[status];
  }

  advanceStatus(order: Order): void {
    const next = this.NEXT_STATUS[order.status];
    if (!next) return;
    this.changeStatus(order, next);
  }

  changeStatus(order: Order, status: OrderStatus): void {
    console.log(`🔄 Changement statut commande ${order._id || order.id}: ${order.status} → ${status}`);

    this.http
      .put(`${API}/orders/${order._id || order.id}/status`, { status })
      .subscribe({
        next: (res: any) => {
          console.log('✅ Statut mis à jour:', res.message);
          this.loadOrders(); // Recharge la liste
        },
        error: (e) => {
          console.error('❌ Échec mise à jour statut:', e);
          alert('Erreur lors de la mise à jour du statut');
        },
      });
  }

  openDetail(order: Order): void {
    this.selectedOrder = this.selectedOrder?._id === order._id ? null : order;
  }

  closeDetail(): void { this.selectedOrder = null; }

  get stats() {
    const counts = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
    let revenue = 0;
    for (const o of this.orders) {
      counts[o.status as OrderStatus]++;
      if (o.status !== 'cancelled') revenue += o.total || 0;
    }
    return { total: this.orders.length, counts, revenue };
  }
}
