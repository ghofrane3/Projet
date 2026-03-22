import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  // ════════════════════════════════════════════════════════════
  // PAGES PUBLIQUES
  // ════════════════════════════════════════════════════════════
  {
    path: '',
    loadComponent: () => import('./components/home/home.component')
      .then(m => m.HomeComponent),
    title: 'Maison Élite - Accueil'
  },

  // ════════════════════════════════════════════════════════════
  // AUTH MODULE (Lazy Loaded)
  // ════════════════════════════════════════════════════════════
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.module')
      .then(m => m.AuthModule)
  },

  // ════════════════════════════════════════════════════════════
  // ANCIEN ROUTES AUTH (Compatibilité)
  // ════════════════════════════════════════════════════════════
  {
    path: 'login',
    redirectTo: 'auth/login',
    pathMatch: 'full'
  },
  {
    path: 'register',
    redirectTo: 'auth/register',
    pathMatch: 'full'
  },
  {
    path: 'verify-email',
    redirectTo: 'auth/verify-email',
    pathMatch: 'full'
  },

  // ════════════════════════════════════════════════════════════
  // PRODUCTS MODULE (Lazy Loaded)
  // ════════════════════════════════════════════════════════════
  {
    path: 'products',
    loadChildren: () => import('./features/products/products.module')
      .then(m => m.ProductsModule)
  },

  // ════════════════════════════════════════════════════════════
  // CATÉGORIES (Redirection vers products)
  // ════════════════════════════════════════════════════════════
  {
    path: 'category/:subcategory',
    redirectTo: 'products/category/:subcategory',
    pathMatch: 'full'
  },

  // ════════════════════════════════════════════════════════════
  // CART MODULE (Lazy Loaded)
  // ════════════════════════════════════════════════════════════
  {
    path: 'cart',
    loadChildren: () => import('./features/cart/cart.module')
      .then(m => m.CartModule)
  },

  // ════════════════════════════════════════════════════════════
  // ANCIEN ROUTES CART (Compatibilité)
  // ════════════════════════════════════════════════════════════
  {
    path: 'checkout',
    redirectTo: 'cart/checkout',
    pathMatch: 'full'
  },
  {
    path: 'order-confirmation',
    redirectTo: 'cart/confirmation',
    pathMatch: 'full'
  },

  // ════════════════════════════════════════════════════════════
  // COMPTE CLIENT (Standalone)
  // ════════════════════════════════════════════════════════════
  {
    path: 'account',
    loadComponent: () => import('./components/account/account.component')
      .then(m => m.AccountComponent),
    canActivate: [authGuard],
    title: 'Maison Élite - Mon Compte'
  },

  // ════════════════════════════════════════════════════════════
  // ADMIN MODULE (Lazy Loaded avec Guards)
  // ════════════════════════════════════════════════════════════
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.module')
      .then(m => m.AdminModule),
    canActivate: [authGuard, adminGuard]
  },

  // ════════════════════════════════════════════════════════════
  // WILDCARD - TOUJOURS EN DERNIER
  // ════════════════════════════════════════════════════════════
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];
