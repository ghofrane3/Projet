import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AdminLayoutComponent } from './admin-layout/admin-layout.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { UsersManagementComponent } from './users-management/users-management.component';
import { CacheDashboardComponent } from './cache-dashboard/cache-dashboard.component';
import { ProductFormComponent } from './product-form/product-form.component';
import { AdminProductListComponent } from './product-list/admin-product-list.component'; // ✅ NOUVEAU

const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        component: DashboardComponent,
        title: 'Admin - Tableau de bord'
      },
      {
        path: 'users',
        component: UsersManagementComponent,
        title: 'Admin - Gestion Utilisateurs'
      },
      {
        path: 'cache',
        component: CacheDashboardComponent,
        title: 'Admin - Gestion Cache'
      },
      // ✅ Liste des produits (admin dédié)
      {
        path: 'products',
        component: AdminProductListComponent,
        title: 'Admin - Liste Produits'
      },
      // ✅ Création d'un nouveau produit
      {
        path: 'products/new',
        component: ProductFormComponent,
        title: 'Admin - Nouveau Produit'
      },
      // ✅ Modification d'un produit existant
      {
        path: 'products/edit/:id',
        component: ProductFormComponent,
        title: 'Admin - Modifier Produit'
      },
      // ✅ Commandes
      {
        path: 'orders',
        loadComponent: () => import('../../features/admin/orders/orders.component')
          .then(m => m.OrdersComponent),
        title: 'Admin - Commandes'
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
