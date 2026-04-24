// src/app/services/delivery.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_BASE = 'http://localhost:5000/api/delivery';

export interface DeliveryHistory {
  status:    string;
  message:   string;
  location:  string;
  timestamp: Date;
}

export interface DeliveryInfo {
  carrier:        string;
  trackingNumber: string;
  estimatedDate?: Date;
  shippedAt?:     Date;
  deliveredAt?:   Date;
  notes:          string;
  history:        DeliveryHistory[];
}

export interface DeliveryOrder {
  _id:             string;
  userId:          any;
  products:        any[];
  shippingAddress: any;
  totalAmount:     number;
  status:          string;
  delivery:        DeliveryInfo;
  createdAt:       Date;
  updatedAt:       Date;
}

export interface DeliveryStats {
  total:      number;
  pending:    number;
  processing: number;
  shipped:    number;
  delivered:  number;
  cancelled:  number;
}

@Injectable({ providedIn: 'root' })
export class DeliveryService {

  constructor(private http: HttpClient) {}

  // Liste paginée avec filtre de statut
  getOrders(status: string = 'all', page: number = 1, limit: number = 20): Observable<any> {
    let params = new HttpParams()
      .set('page',  page.toString())
      .set('limit', limit.toString());
    if (status !== 'all') params = params.set('status', status);
    return this.http.get<any>(API_BASE, { params });
  }

  // Stats par statut
  getStats(): Observable<{ success: boolean; stats: DeliveryStats }> {
    return this.http.get<any>(`${API_BASE}/stats`);
  }

  // Détail d'une commande
  getOrderDetail(orderId: string): Observable<any> {
    return this.http.get<any>(`${API_BASE}/${orderId}`);
  }

  // Assigner transporteur
  assignCarrier(orderId: string, data: {
    carrier:       string;
    trackingNumber: string;
    estimatedDate?: string;
    notes?:         string;
  }): Observable<any> {
    return this.http.put<any>(`${API_BASE}/${orderId}/assign`, data);
  }

  // Marquer expédiée
  shipOrder(orderId: string, data?: { location?: string; message?: string }): Observable<any> {
    return this.http.put<any>(`${API_BASE}/${orderId}/ship`, data || {});
  }

  // Marquer livrée
  deliverOrder(orderId: string, data?: { location?: string; message?: string }): Observable<any> {
    return this.http.put<any>(`${API_BASE}/${orderId}/deliver`, data || {});
  }

  // Ajouter étape historique
  addHistoryStep(orderId: string, data: {
    status:    string;
    message:   string;
    location?: string;
  }): Observable<any> {
    return this.http.post<any>(`${API_BASE}/${orderId}/history`, data);
  }
}
