import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface Order {
  _id: string;
  userId: string;
  items: any[];
  total: number;
  status: string;
  createdAt: string;
  shippingAddress: any;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="orders-page">
      <div class="page-header">
        <h1>Gestion des Commandes</h1>
        <p>{{ orders.length }} commande(s)</p>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement des commandes...</p>
      </div>

      <!-- Liste des commandes -->
      <div *ngIf="!loading" class="orders-list">

        <!-- Message si vide -->
        <div *ngIf="orders.length === 0" class="empty">
          <p>📦 Aucune commande pour le moment</p>
        </div>

        <!-- Tableau des commandes -->
        <table *ngIf="orders.length > 0" class="orders-table">
          <thead>
            <tr>
              <th>N° Commande</th>
              <th>Date</th>
              <th>Client</th>
              <th>Articles</th>
              <th>Total</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let order of orders">
              <td>{{ order._id.slice(-8).toUpperCase() }}</td>
              <td>{{ order.createdAt | date:'dd/MM/yyyy' }}</td>
              <td>{{ order.userId }}</td>
              <td>{{ order.items.length }}</td>
              <td>{{ order.total }}€</td>
              <td>
                <span class="status" [class]="order.status">
                  {{ getStatusLabel(order.status) }}
                </span>
              </td>
              <td>
                <button class="btn-view" (click)="viewOrder(order)">
                  👁️ Voir
                </button>
                <button class="btn-update" (click)="updateStatus(order)">
                  🔄 Statut
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .orders-page {
      padding: 2rem;
      background: #f5f3ef;
      min-height: 100vh;
    }

    .page-header {
      margin-bottom: 2rem;

      h1 {
        font-size: 2rem;
        color: #1a1a1a;
        margin-bottom: 0.5rem;
      }

      p {
        color: #666;
      }
    }

    .loading {
      text-align: center;
      padding: 4rem;

      .spinner {
        width: 50px;
        height: 50px;
        border: 4px solid #e0e0e0;
        border-top-color: #d4a574;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty {
      text-align: center;
      padding: 4rem;
      background: white;
      border-radius: 8px;

      p {
        font-size: 1.2rem;
        color: #666;
      }
    }

    .orders-table {
      width: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

      thead {
        background: #1a1a1a;
        color: white;

        th {
          padding: 1rem;
          text-align: left;
          font-weight: 600;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      }

      tbody {
        tr {
          border-bottom: 1px solid #e0e0e0;
          transition: background 0.2s;

          &:hover {
            background: #f8f9fa;
          }

          td {
            padding: 1rem;
            color: #333;
          }
        }
      }

      .status {
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;

        &.pending {
          background: #fff3cd;
          color: #856404;
        }

        &.processing {
          background: #cfe2ff;
          color: #084298;
        }

        &.shipped {
          background: #d1e7dd;
          color: #0f5132;
        }

        &.delivered {
          background: #d1e7dd;
          color: #0f5132;
        }

        &.cancelled {
          background: #f8d7da;
          color: #842029;
        }
      }

      button {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.875rem;
        margin-right: 0.5rem;
        transition: all 0.2s;

        &.btn-view {
          background: #d4a574;
          color: white;

          &:hover {
            background: darken(#d4a574, 10%);
          }
        }

        &.btn-update {
          background: #6c757d;
          color: white;

          &:hover {
            background: darken(#6c757d, 10%);
          }
        }
      }
    }
  `]
})
export class OrdersComponent implements OnInit {
  orders: Order[] = [];
  loading = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading = true;

    this.http.get<any>('http://localhost:5000/api/orders').subscribe({
      next: (response) => {
        console.log('✅ Commandes reçues:', response);
        this.orders = response.orders || response || [];
        this.loading = false;
      },
      error: (error) => {
        console.error('❌ Erreur chargement commandes:', error);
        this.orders = [];
        this.loading = false;
      }
    });
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'processing': 'En traitement',
      'shipped': 'Expédiée',
      'delivered': 'Livrée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  viewOrder(order: Order): void {
    console.log('👁️ Voir commande:', order);
    // TODO: Ouvrir modal ou rediriger vers détail
    alert(`Commande #${order._id.slice(-8).toUpperCase()}\nTotal: ${order.total}€`);
  }

  updateStatus(order: Order): void {
    console.log('🔄 Mettre à jour statut:', order);
    // TODO: Ouvrir modal pour changer le statut
    const newStatus = prompt('Nouveau statut (pending, processing, shipped, delivered, cancelled):');
    if (newStatus) {
      this.http.put(`http://localhost:5000/api/orders/${order._id}/status`, { status: newStatus })
        .subscribe({
          next: () => {
            alert('✅ Statut mis à jour');
            this.loadOrders();
          },
          error: (error) => {
            console.error('❌ Erreur:', error);
            alert('❌ Erreur lors de la mise à jour');
          }
        });
    }
  }
}
