import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OrderService } from '../../../services/order.service';
import { Order, buildTimeline, TrackingEvent } from '../../../models/user.model';

@Component({
  selector: 'app-order-confirmation',
  standalone: false,
  templateUrl: './order-confirmation.component.html',
  styleUrls: ['./order-confirmation.component.scss'],
})
export class OrderConfirmationComponent implements OnInit {
  order: Order | undefined;
  orderId = '';
  orderTotal = 0;
  estimatedDelivery: Date = new Date(Date.now() + 4 * 86400000);
  today = new Date();
  timeline: TrackingEvent[] = [];
  copied = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,        // ✅ pour lire queryParams
    private http: HttpClient,
    private orderService: OrderService
  ) {}

  ngOnInit(): void {
    // ✅ Lire depuis queryParams (checkout navigue avec queryParams)
    this.route.queryParams.subscribe(params => {
      this.orderId = params['orderId'] || 'ORD-' + Date.now();
      this.loadOrder();
    });
  }

  loadOrder(): void {
    // ✅ Tenter de récupérer la commande depuis le backend via cookie
    this.http.get<any>(
      `http://localhost:5000/api/orders/${this.orderId}`,
      { withCredentials: true }
    ).subscribe({
      next: (res) => {
        if (res.success && res.order) {
          const o = res.order;
          // ✅ Support des deux structures: items ou products
          const items = o.items || o.products || [];
          this.orderTotal = o.totalAmount || o.total || 0;
          if (o.estimatedDelivery) {
            this.estimatedDelivery = new Date(o.estimatedDelivery);
          }
          // Construire order local pour la timeline
          this.order = {
            id: o._id,
            status: o.status || 'pending',
            total: this.orderTotal,
            createdAt: new Date(o.createdAt),
            items: items,
            shippingAddress: o.shippingAddress,
          } as Order;
          this.timeline = buildTimeline(this.order);
        }
      },
      error: () => {
        // Fallback si l'API échoue
        this.timeline = buildTimeline({
          id: this.orderId,
          status: 'pending',
          createdAt: new Date(),
        } as Order);
      }
    });
  }

  copyOrderId(): void {
    navigator.clipboard.writeText(this.orderId).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    });
  }

  continueShopping(): void {
    this.router.navigate(['/products']);
  }

  trackOrder(): void {
    // ✅ Route correcte dans cart-routing.module.ts
    this.router.navigate(['/cart/order', this.orderId]);
  }

  viewAllOrders(): void {
    // ✅ Naviguer vers account et ouvrir l'onglet commandes
    this.router.navigate(['/account'], {
      queryParams: { tab: 'orders' }
    });
  }
}
