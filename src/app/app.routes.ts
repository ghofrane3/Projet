import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { AdminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent),
    title: 'Fashion Store - Accueil'
  },
  {
    path: 'login',
    loadComponent: () => import('./components/auth/login.component').then(m => m.LoginComponent),
    title: 'Fashion Store - Connexion'
  },
  {
    path: 'register',
    loadComponent: () => import('./components/auth/login.component').then(m => m.LoginComponent),
    title: 'Fashion Store - Inscription'
  },
  {
    path: 'account',
    loadComponent: () => import('./components/account/account.component').then(m => m.AccountComponent),
    canActivate: [AuthGuard],
    title: 'Fashion Store - Mon Compte'
  },
  {
    path: 'admin',
    loadComponent: () => import('./components/admin/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [AdminGuard],
    title: 'Fashion Store - Administration'
  },
  {
    path: 'products',
    loadComponent: () => import('./components/product-list/product-list.component').then(m => m.ProductListComponent),
    title: 'Fashion Store - Boutique'
  },
  {
    path: 'category/:subcategory',
    loadComponent: () => import('./components/category/category.component').then(m => m.CategoryComponent),
    title: 'Fashion Store - Catégorie'
  },
  {
    path: 'cart',
    loadComponent: () => import('./components/cart/cart.component').then(m => m.CartComponent),
    title: 'Fashion Store - Panier'
  },
  {
    path: 'checkout',
    loadComponent: () => import('./components/checkout/checkout.component').then(m => m.CheckoutComponent),
    canActivate: [AuthGuard],
    title: 'Fashion Store - Paiement'
  },
  {
    path: 'order-confirmation',
    loadComponent: () => import('./components/order-confirmation/order-confirmation.component').then(m => m.OrderConfirmationComponent),
    canActivate: [AuthGuard],
    title: 'Fashion Store - Confirmation'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
