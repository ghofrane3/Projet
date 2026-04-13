import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Order, OrderStatus } from '../models/user.model';

const STORAGE_KEY = 'fashionstore_orders';
const API_BASE = 'http://localhost:5000/api';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private ordersSubject = new BehaviorSubject<Order[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const orders: Order[] = raw ? JSON.parse(raw) : [];
      this.ordersSubject.next(orders);
    } catch {
      this.ordersSubject.next([]);
    }
  }

  private saveToStorage(orders: Order[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    this.ordersSubject.next(orders);
  }

  getOrders(): Order[] {
    return this.ordersSubject.getValue();
  }

  getUserOrders(userId: number): Order[] {
    return this.getOrders().filter((o) => o.userId === userId);
  }

  getOrderById(orderId: string): Order | undefined {
    return this.getOrders().find((o) => o.id === orderId);
  }

  createOrder(data: Partial<Order>): Order {
    const orders = this.getOrders();
    const now = new Date();

    const estimated = new Date(now);
    estimated.setDate(estimated.getDate() + 4);

    const newOrder: Order = {
      id: data.id || `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: data.userId || 0,
      items: data.items || [],
      total: data.total || 0,
      subtotal: data.subtotal,
      shippingCost: data.shippingCost ?? 7,
      shippingAddress: data.shippingAddress || {
        street: '',
        city: '',
        zipCode: '',
        country: 'Tunisie',
      },
      status: 'pending',
      paymentMethod: data.paymentMethod || 'card',
      paymentStatus: 'paid',
      stripePaymentIntentId: data.stripePaymentIntentId,
      estimatedDelivery: estimated,
      createdAt: now,
      updatedAt: now,
    };

    orders.push(newOrder);
    this.saveToStorage(orders);
    this.updateUserStats(newOrder.userId, newOrder.total);
    return newOrder;
  }

  updateOrderStatus(orderId: string, status: OrderStatus): boolean {
    const orders = this.getOrders();
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return false;

    orders[idx].status = status;
    orders[idx].updatedAt = new Date();
    if (status === 'delivered') {
      orders[idx].deliveredAt = new Date();
    }
    this.saveToStorage(orders);
    return true;
  }

  cancelOrder(orderId: string): boolean {
    return this.updateOrderStatus(orderId, 'cancelled');
  }

  syncFromBackend(orderId: string): Observable<any> {
    return this.http
      .get<any>(`${API_BASE}/orders/${orderId}`)
      .pipe(
        tap((res) => {
          const order = res.order || res;
          const orders = this.getOrders();
          const idx = orders.findIndex((o) => o.id === orderId);
          if (idx !== -1) {
            orders[idx] = { ...orders[idx], ...order };
            this.saveToStorage(orders);
          }
        }),
        catchError((err) => {
          console.warn('Backend sync failed, using local data:', err);
          return of(null);
        })
      );
  }

  updateStatusBackend(
    orderId: string,
    status: OrderStatus
  ): Observable<any> {
    return this.http
      .put(`${API_BASE}/orders/${orderId}/status`, { status })
      .pipe(
        tap(() => this.updateOrderStatus(orderId, status)),
        catchError((err) => {
          console.warn('Backend update failed, updating locally:', err);
          this.updateOrderStatus(orderId, status);
          return of(null);
        })
      );
  }

  getStats() {
    const orders = this.getOrders();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const statusCounts = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    } as Record<OrderStatus, number>;

    let totalRevenue = 0;
    let monthlyRevenue = 0;
    let monthlyOrders = 0;

    for (const o of orders) {
      statusCounts[o.status]++;
      totalRevenue += o.total;
      if (new Date(o.createdAt) > lastMonth) {
        monthlyRevenue += o.total;
        monthlyOrders++;
      }
    }

    return {
      totalOrders: orders.length,
      totalRevenue,
      monthlyOrders,
      monthlyRevenue,
      statusCounts,
    };
  }

  private updateUserStats(userId: number, amount: number): void {
    try {
      const key = 'fashionstore_users';
      const users = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = users.findIndex((u: any) => u.id === userId);
      if (idx !== -1) {
        users[idx].ordersCount = (users[idx].ordersCount || 0) + 1;
        users[idx].totalSpent = (users[idx].totalSpent || 0) + amount;
        localStorage.setItem(key, JSON.stringify(users));
      }
    } catch {}
  }
}
