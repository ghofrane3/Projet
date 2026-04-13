import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { OrderService } from '../../../services/order.service';
import {
  Order,
  OrderStatus,
  buildTimeline,
  TrackingEvent,
  ORDER_STATUS_CONFIG,
} from '../../../models/user.model';

@Component({
  selector: 'app-order-detail',

  templateUrl: './order-detail.component.html',
  styleUrls: ['./order-detail.component.scss'],
})
export class OrderDetailComponent implements OnInit {
  order: Order | undefined;
  timeline: TrackingEvent[] = [];
  loading = true;
  notFound = false;
  statusConfig = ORDER_STATUS_CONFIG;

  readonly STATUS_FLOW: OrderStatus[] = [
    'pending',
    'processing',
    'shipped',
    'delivered',
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.load(id);
  }

  load(id: string): void {
    this.loading = true;
    this.order = this.orderService.getOrderById(id);

    if (!this.order) {
      this.notFound = true;
      this.loading = false;
      return;
    }

    this.timeline = buildTimeline(this.order);
    this.loading = false;

    this.orderService.syncFromBackend(id).subscribe((res) => {
      if (res) {
        this.order = this.orderService.getOrderById(id);
        if (this.order) this.timeline = buildTimeline(this.order);
      }
    });
  }

  get currentStatusLabel(): string {
    if (!this.order) return '';
    return this.statusConfig[this.order.status]?.label || this.order.status;
  }

  get currentStatusColor(): string {
    if (!this.order) return 'gray';
    return this.statusConfig[this.order.status]?.color || 'gray';
  }

  get canCancel(): boolean {
    return (
      !!this.order &&
      (this.order.status === 'pending' || this.order.status === 'processing')
    );
  }

  get progressPercent(): number {
    if (!this.order || this.order.status === 'cancelled') return 0;
    const idx = this.STATUS_FLOW.indexOf(this.order.status);
    return Math.round(((idx + 1) / this.STATUS_FLOW.length) * 100);
  }

  cancelOrder(): void {
    if (!this.order || !this.canCancel) return;
    if (!confirm('Êtes-vous sûr de vouloir annuler cette commande ?')) return;

    this.orderService
      .updateStatusBackend(this.order.id, 'cancelled')
      .subscribe(() => {
        this.load(this.order!.id);
      });
  }

  goBack(): void {
    this.router.navigate(['/account/orders']);
  }

  getItemTotal(item: any): number {
    return item.price * item.quantity;
  }
}
