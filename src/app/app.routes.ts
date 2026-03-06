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
    title: 'Fashion Store - Accueil'
  },
  {
    path: 'login',
    loadComponent: () => import('./components/auth/login.component')
      .then(m => m.LoginComponent),
    title: 'Fashion Store - Connexion'
  },
  {
    path: 'register',
    loadComponent: () => import('./components/auth/register/register.component')
      .then(m => m.RegisterComponent),
    title: 'Fashion Store - Inscription'
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./components/auth/verify-email/verify-email.component')
      .then(m => m.VerifyEmailComponent),
    title: 'Fashion Store - Vérification Email'
  },

  // ════════════════════════════════════════════════════════════
  // BOUTIQUE - ORDRE CRUCIAL !
  // ════════════════════════════════════════════════════════════

  // ✅ 1. DÉTAIL PRODUIT (DOIT ÊTRE AVANT /products)
  {
    path: 'products/:id',
    loadComponent: () => import('./components/product-detail/product-detail.component')
      .then(m => m.ProductDetailComponent),
    title: 'Fashion Store - Détail Produit'
  },

  // ✅ 2. LISTE PRODUITS (APRÈS le détail)
  {
    path: 'products',
    loadComponent: () => import('./components/category/category.component')
      .then(m => m.CategoryComponent),
    title: 'Fashion Store - Boutique'
  },

  // ✅ 3. CATÉGORIE
  {
    path: 'category/:subcategory',
    loadComponent: () => import('./components/category/category.component')
      .then(m => m.CategoryComponent),
    title: 'Fashion Store - Catégorie'
  },

  // ════════════════════════════════════════════════════════════
  // PANIER & COMMANDE
  // ════════════════════════════════════════════════════════════
  {
    path: 'cart',
    loadComponent: () => import('./components/cart/cart.component')
      .then(m => m.CartService), // ✅ CORRIGÉ : CartComponent au lieu de CartService
    title: 'Fashion Store - Panier'
  },
  {
    path: 'checkout',
    loadComponent: () => import('./components/checkout/checkout.component')
      .then(m => m.CheckoutComponent),
    canActivate: [authGuard],
    title: 'Fashion Store - Paiement'
  },
  {
    path: 'order-confirmation',
    loadComponent: () => import('./components/order-confirmation/order-confirmation.component')
      .then(m => m.OrderConfirmationComponent),
    canActivate: [authGuard],
    title: 'Fashion Store - Confirmation'
  },

  // ════════════════════════════════════════════════════════════
  // COMPTE CLIENT
  // ════════════════════════════════════════════════════════════
  {
    path: 'account',
    loadComponent: () => import('./components/account/account.component')
      .then(m => m.AccountComponent),
    canActivate: [authGuard],
    title: 'Fashion Store - Mon Compte'
  },

  // ════════════════════════════════════════════════════════════
  // ADMIN AVEC SIDEBAR
  // ════════════════════════════════════════════════════════════
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./components/admin/admin-layout/admin-layout.component')
      .then(m => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./components/admin/dashboard/dashboard.component')
          .then(m => m.DashboardComponent),
        title: 'Admin - Tableau de bord'
      },
      {
        path: 'users',
        loadComponent: () => import('./components/admin/users-management/users-management.component')
          .then(m => m.UsersManagementComponent),
        title: 'Admin - Gestion Utilisateurs'
      },
      {
        path: 'products',
        loadComponent: () => import('./components/product-list/product-list.component')
          .then(m => m.ProductListComponent),
        title: 'Admin - Produits'
      },
      {
        path: 'products/new',
        loadComponent: () => import('./components/admin/product-form/product-form.component')
          .then(m => m.ProductFormComponent),
        title: 'Admin - Nouveau Produit'
      },

    ]
  },

  // ════════════════════════════════════════════════════════════
  // WILDCARD - TOUJOURS EN DERNIER
  // ════════════════════════════════════════════════════════════
  {
    path: '**',
    redirectTo: ''
  }
];
