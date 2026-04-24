// src/app/features/admin/delivery/delivery.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule }                  from '@angular/common';
import { FormsModule }                   from '@angular/forms';
import { RouterModule }                  from '@angular/router';
import { Subject }                       from 'rxjs';
import { takeUntil }                     from 'rxjs/operators';
import { DeliveryService, DeliveryOrder, DeliveryStats } from '../../../services/delivery.service';

@Component({
  selector:    'app-delivery',
  standalone:  true,
  imports:     [CommonModule, FormsModule, RouterModule],
  templateUrl: './delivery.component.html',
  styleUrls:   ['./delivery.component.scss']
})
export class DeliveryComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // ── Data ──────────────────────────────────────────────
  orders:      DeliveryOrder[] = [];
  stats:       DeliveryStats   = { total: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  selectedOrder: DeliveryOrder | null = null;

  // ── UI state ─────────────────────────────────────────
  loading        = false;
  statsLoading   = false;
  actionLoading  = false;
  activeFilter   = 'all';
  currentPage    = 1;
  totalPages     = 1;
  totalOrders    = 0;
  errorMsg       = '';
  successMsg     = '';

  // ── Modals ────────────────────────────────────────────
  showDetailModal   = false;
  showAssignModal   = false;
  showHistoryModal  = false;

  // ── Formulaires ───────────────────────────────────────
  assignForm = {
    carrier:       '',
    trackingNumber:'',
    estimatedDate: '',
    notes:         ''
  };

  historyForm = {
    status:   'in_transit',
    message:  '',
    location: ''
  };

  historyStatuses = [
    { value: 'in_transit',    label: 'En transit'           },
    { value: 'out_delivery',  label: 'En cours de livraison'},
    { value: 'attempt',       label: 'Tentative de livraison'},
    { value: 'held',          label: 'Retenu en dépôt'      },
    { value: 'returned',      label: 'Retourné expéditeur'  },
    { value: 'custom',        label: 'Étape personnalisée'  },
  ];

  carriers = ['DHL', 'ARAMEX', 'TNT', 'FedEx', 'UPS', 'Poste Tunisienne', 'Autre'];

  filters = [
    { value: 'all',        label: 'Toutes',      icon: '📦' },
    { value: 'pending',    label: 'En attente',  icon: '⏳' },
    { value: 'processing', label: 'En cours',    icon: '⚙️'  },
    { value: 'shipped',    label: 'Expédiées',   icon: '🚚' },
    { value: 'delivered',  label: 'Livrées',     icon: '✅' },
    { value: 'cancelled',  label: 'Annulées',    icon: '❌' },
  ];

  constructor(private deliveryService: DeliveryService) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadOrders();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ══════════════════════════════════════════════════════
  // CHARGEMENT
  // ══════════════════════════════════════════════════════
  loadStats(): void {
    this.statsLoading = true;
    this.deliveryService.getStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  (res) => { this.stats = res.stats; this.statsLoading = false; },
        error: ()    => { this.statsLoading = false; }
      });
  }

  loadOrders(page: number = 1): void {
    this.loading = true;
    this.errorMsg = '';
    this.deliveryService.getOrders(this.activeFilter, page)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.orders      = res.orders;
          this.totalPages  = res.pages;
          this.totalOrders = res.total;
          this.currentPage = res.page;
          this.loading     = false;
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Erreur de chargement';
          this.loading  = false;
        }
      });
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.currentPage  = 1;
    this.loadOrders(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.loadOrders(page);
  }

  refresh(): void {
    this.loadStats();
    this.loadOrders(this.currentPage);
  }

  // ══════════════════════════════════════════════════════
  // DÉTAIL COMMANDE
  // ══════════════════════════════════════════════════════
  openDetail(order: DeliveryOrder): void {
    this.deliveryService.getOrderDetail(order._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.selectedOrder  = res.order;
          this.showDetailModal = true;
        },
        error: () => this.showError('Impossible de charger les détails')
      });
  }

  closeDetail(): void {
    this.showDetailModal = false;
    this.selectedOrder   = null;
  }

  // ══════════════════════════════════════════════════════
  // ASSIGNER TRANSPORTEUR
  // ══════════════════════════════════════════════════════
  openAssignModal(order: DeliveryOrder): void {
    this.selectedOrder  = order;
    this.assignForm = {
      carrier:        order.delivery?.carrier       || '',
      trackingNumber: order.delivery?.trackingNumber || '',
      estimatedDate:  order.delivery?.estimatedDate
        ? new Date(order.delivery.estimatedDate).toISOString().split('T')[0]
        : '',
      notes: order.delivery?.notes || ''
    };
    this.showAssignModal = true;
  }

  closeAssignModal(): void {
    this.showAssignModal = false;
  }

  submitAssign(): void {
    if (!this.selectedOrder) return;
    if (!this.assignForm.carrier || !this.assignForm.trackingNumber) {
      this.showError('Transporteur et numéro de suivi requis');
      return;
    }

    this.actionLoading = true;
    this.deliveryService.assignCarrier(this.selectedOrder._id, this.assignForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading    = false;
          this.showAssignModal  = false;
          this.showSuccess('Transporteur assigné avec succès');
          this.loadOrders(this.currentPage);
          this.loadStats();
        },
        error: (err) => {
          this.actionLoading = false;
          this.showError(err.error?.message || 'Erreur lors de l\'assignation');
        }
      });
  }

  // ══════════════════════════════════════════════════════
  // EXPÉDIER
  // ══════════════════════════════════════════════════════
  shipOrder(order: DeliveryOrder): void {
    if (!confirm(`Marquer la commande #${order._id.slice(-6)} comme expédiée ?`)) return;
    this.actionLoading = true;
    this.deliveryService.shipOrder(order._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.showSuccess('Commande marquée expédiée ✉️');
          this.loadOrders(this.currentPage);
          this.loadStats();
        },
        error: (err) => {
          this.actionLoading = false;
          this.showError(err.error?.message || 'Erreur');
        }
      });
  }

  // ══════════════════════════════════════════════════════
  // LIVRER
  // ══════════════════════════════════════════════════════
  deliverOrder(order: DeliveryOrder): void {
    if (!confirm(`Confirmer la livraison de la commande #${order._id.slice(-6)} ?`)) return;
    this.actionLoading = true;
    this.deliveryService.deliverOrder(order._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.showSuccess('Commande marquée livrée ✅');
          this.loadOrders(this.currentPage);
          this.loadStats();
        },
        error: (err) => {
          this.actionLoading = false;
          this.showError(err.error?.message || 'Erreur');
        }
      });
  }

  // ══════════════════════════════════════════════════════
  // HISTORIQUE
  // ══════════════════════════════════════════════════════
  openHistoryModal(order: DeliveryOrder): void {
    this.selectedOrder     = order;
    this.historyForm       = { status: 'in_transit', message: '', location: '' };
    this.showHistoryModal  = true;
  }

  closeHistoryModal(): void {
    this.showHistoryModal = false;
  }

  submitHistory(): void {
    if (!this.selectedOrder || !this.historyForm.message) return;
    this.actionLoading = true;
    this.deliveryService.addHistoryStep(this.selectedOrder._id, this.historyForm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading   = false;
          this.showHistoryModal = false;
          this.showSuccess('Étape ajoutée au suivi');
          this.loadOrders(this.currentPage);
        },
        error: (err) => {
          this.actionLoading = false;
          this.showError(err.error?.message || 'Erreur');
        }
      });
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════
  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending:    'En attente',
      processing: 'En traitement',
      shipped:    'Expédiée',
      delivered:  'Livrée',
      cancelled:  'Annulée'
    };
    return map[status] || status;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending:    'badge-warning',
      processing: 'badge-info',
      shipped:    'badge-primary',
      delivered:  'badge-success',
      cancelled:  'badge-danger'
    };
    return map[status] || 'badge-secondary';
  }

  getStatusIcon(status: string): string {
    const map: Record<string, string> = {
      pending:    '⏳',
      processing: '⚙️',
      shipped:    '🚚',
      delivered:  '✅',
      cancelled:  '❌'
    };
    return map[status] || '📦';
  }

  getClientName(order: DeliveryOrder): string {
    const u = order.userId;
    if (!u) return 'Client inconnu';
    return u.firstName && u.lastName
      ? `${u.firstName} ${u.lastName}`
      : u.name || u.email || 'Client';
  }

  canAssign(order: DeliveryOrder): boolean {
    return ['pending', 'processing'].includes(order.status);
  }

  canShip(order: DeliveryOrder): boolean {
    return order.status === 'processing' && !!order.delivery?.carrier;
  }

  canDeliver(order: DeliveryOrder): boolean {
    return order.status === 'shipped';
  }

  canAddHistory(order: DeliveryOrder): boolean {
    return ['processing', 'shipped'].includes(order.status);
  }

  getPagesArray(): number[] {
    const arr = [];
    for (let i = 1; i <= this.totalPages; i++) arr.push(i);
    return arr;
  }

  private showSuccess(msg: string): void {
    this.successMsg = msg;
    this.errorMsg   = '';
    setTimeout(() => this.successMsg = '', 4000);
  }

  private showError(msg: string): void {
    this.errorMsg   = msg;
    this.successMsg = '';
    setTimeout(() => this.errorMsg = '', 5000);
  }
}
