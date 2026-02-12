import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Order, OrderItem } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private ordersKey = 'fashionstore_orders';
  private ordersSubject = new BehaviorSubject<Order[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  constructor() {
    this.loadOrders();
  }

  private loadOrders(): void {
    const ordersJson = localStorage.getItem(this.ordersKey);
    const orders = ordersJson ? JSON.parse(ordersJson) : [];
    this.ordersSubject.next(orders);
  }

  createOrder(orderData: Partial<Order>): Order {
    const orders = this.getOrders();

    const newOrder: Order = {
      id: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: orderData.userId || 0,
      items: orderData.items || [],
      total: orderData.total || 0,
      shippingAddress: orderData.shippingAddress || {
        street: '',
        city: '',
        zipCode: '',
        country: 'Tunisie'
      },
      status: 'pending',
      paymentMethod: orderData.paymentMethod || 'card',
      paymentStatus: 'paid',
      createdAt: new Date()
    };

    orders.push(newOrder);
    localStorage.setItem(this.ordersKey, JSON.stringify(orders));
    this.ordersSubject.next(orders);

    // Mettre à jour les statistiques utilisateur
    this.updateUserStats(newOrder.userId, newOrder.total);

    return newOrder;
  }

  getOrders(): Order[] {
    return JSON.parse(localStorage.getItem(this.ordersKey) || '[]');
  }

  getUserOrders(userId: number): Order[] {
    return this.getOrders().filter(order => order.userId === userId);
  }

  updateOrderStatus(orderId: string, status: Order['status']): boolean {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id === orderId);

    if (index !== -1) {
      orders[index].status = status;
      if (status === 'delivered') {
        orders[index].deliveredAt = new Date();
      }
      localStorage.setItem(this.ordersKey, JSON.stringify(orders));
      this.ordersSubject.next(orders);
      return true;
    }

    return false;
  }

  getStats() {
    const orders = this.getOrders();
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    const monthlyOrders = orders.filter(o => new Date(o.createdAt) > lastMonth).length;
    const monthlyRevenue = orders
      .filter(o => new Date(o.createdAt) > lastMonth)
      .reduce((sum, order) => sum + order.total, 0);

    const statusCounts = {
      pending: orders.filter(o => o.status === 'pending').length,
      processing: orders.filter(o => o.status === 'processing').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length
    };

    return {
      totalOrders,
      totalRevenue,
      monthlyOrders,
      monthlyRevenue,
      statusCounts
    };
  }

  private updateUserStats(userId: number, orderTotal: number): void {
    const usersKey = 'fashionstore_users';
    const usersJson = localStorage.getItem(usersKey);

    if (usersJson) {
      const users = JSON.parse(usersJson);
      const index = users.findIndex((u: any) => u.id === userId);

      if (index !== -1) {
        users[index].ordersCount = (users[index].ordersCount || 0) + 1;
        users[index].totalSpent = (users[index].totalSpent || 0) + orderTotal;
        localStorage.setItem(usersKey, JSON.stringify(users));
      }
    }
  }
}
