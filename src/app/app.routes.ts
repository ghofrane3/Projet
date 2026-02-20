import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent),
    title: 'Fashion Store - Accueil'
  },

{
  path: 'verify-email',
  loadComponent: () => import('./components/auth/verify-email/verify-email.component')
    .then(m => m.VerifyEmailComponent)
},
{
  path: 'admin/users',
  canActivate: [adminGuard],
  loadComponent: () => import('./components/admin/users-management/users-management.component')
    .then(m => m.UsersManagementComponent)
},
  {
  path: 'admin/products/new',
  canActivate: [adminGuard],
  loadComponent: () => import('./components/admin/product-form/product-form.component')
    .then(m => m.ProductFormComponent)
},
  {
    path: 'login',
    loadComponent: () => import('./components/auth/login.component').then(m => m.LoginComponent),
    title: 'Fashion Store - Connexion'
  },
  {
  path: 'register',
  loadComponent: () => import('./components/auth/register/register.component').then(m => m.RegisterComponent)
},
  {
    path: 'account',
    loadComponent: () => import('./components/account/account.component').then(m => m.AccountComponent),
    canActivate: [authGuard],
    title: 'Fashion Store - Mon Compte'
  },
  {
  path: 'admin/dashboard',
  canActivate: [adminGuard],
  loadComponent: () => import('./components/admin/dashboard/dashboard.component').then(m => m.AdminDashboardComponent)
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
    canActivate: [authGuard],
    title: 'Fashion Store - Paiement'
  },
  {
    path: 'order-confirmation',
    loadComponent: () => import('./components/order-confirmation/order-confirmation.component').then(m => m.OrderConfirmationComponent),
    canActivate: [authGuard],
    title: 'Fashion Store - Confirmation'
  },

  {
    path: '**',
    redirectTo: ''
  }
];
