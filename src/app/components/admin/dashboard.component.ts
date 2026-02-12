import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { ProductService } from '../../services/product.service';
import { User } from '../../models/user.model';
import { Order } from '../../models/user.model';
import { Product } from '../../models/product.model';
import { RouterModule } from '@angular/router';
@Component({
  selector: 'admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  activeTab: 'overview' | 'orders' | 'products' | 'users' | 'settings' = 'overview';
  orders: Order[] = [];
  users: User[] = [];
  products: Product[] = [];
  stats: any = {};
  recentOrders: Order[] = [];
  topProducts: any[] = [];

  // Product management
  showProductForm = false;
  editProductId: number | null = null;
  productForm = {
    name: '',
    description: '',
    price: 0,
    discountPrice: 0,
    category: '',
    subcategory: 'homme',
    sizes: ['S', 'M', 'L'],
    colors: ['Blanc', 'Noir'],
    inStock: true
  };

  constructor(
    private authService: AuthService,
    private orderService: OrderService,
    private productService: ProductService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAdmin()) {
      this.router.navigate(['/']);
      return;
    }

    this.loadData();
  }

  loadData(): void {
    this.orders = this.orderService.getOrders();
    this.products = this.productService.getProducts();
    this.stats = this.orderService.getStats();
    this.recentOrders = this.orders.slice(0, 5).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    this.loadUsers();
    this.calculateTopProducts();
  }

  loadUsers(): void {
    const usersJson = localStorage.getItem('fashionstore_users');
    this.users = usersJson ? JSON.parse(usersJson) : [];
  }

  calculateTopProducts(): void {
    const productSales: {[key: number]: {product: Product, quantity: number}} = {};

    this.orders.forEach(order => {
      order.items.forEach(item => {
        const product = this.products.find(p => p.name === item.name);
        if (product) {
          if (!productSales[product.id]) {
            productSales[product.id] = { product, quantity: 0 };
          }
          productSales[product.id].quantity += item.quantity;
        }
      });
    });

    this.topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }

  updateOrderStatus(orderId: string, status: Order['status']): void {
    const success = this.orderService.updateOrderStatus(orderId, status);
    if (success) {
      this.loadData();
    }
  }

  deleteProduct(productId: number): void {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
      // Dans une vraie application, vous appelleriez un service ici
      alert('Produit supprimé!');
      this.loadData();
    }
  }

  toggleUserStatus(userId: number): void {
    const users = this.users;
    const user = users.find(u => u.id === userId);
    if (user) {
      user.isActive = !user.isActive;
      localStorage.setItem('fashionstore_users', JSON.stringify(users));
      this.loadUsers();
    }
  }

  openProductForm(product?: Product): void {
    this.showProductForm = true;
    if (product) {
      this.editProductId = product.id;
      this.productForm = {
        name: product.name,
        description: product.description,
        price: product.price,
        discountPrice: product.discountPrice || 0,
        category: product.category,
        subcategory: product.subcategory,
        sizes: [...product.sizes],
        colors: [...product.colors],
        inStock: product.inStock
      };
    } else {
      this.editProductId = null;
      this.productForm = {
        name: '',
        description: '',
        price: 0,
        discountPrice: 0,
        category: '',
        subcategory: 'homme',
        sizes: ['S', 'M', 'L'],
        colors: ['Blanc', 'Noir'],
        inStock: true
      };
    }
  }

  saveProduct(): void {
    // Dans une vraie application, vous appelleriez un service ici
    alert('Produit sauvegardé!');
    this.showProductForm = false;
    this.loadData();
  }

  exportData(type: string): void {
    let data: any;
    let filename = '';

    switch(type) {
      case 'orders':
        data = this.orders;
        filename = 'commandes.json';
        break;
      case 'users':
        data = this.users;
        filename = 'utilisateurs.json';
        break;
      case 'products':
        data = this.products;
        filename = 'produits.json';
        break;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
