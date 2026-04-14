import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminRoutingModule } from './admin-routing.module';

import { DashboardComponent } from './dashboard/dashboard.component';
import { UsersManagementComponent } from './users-management/users-management.component';
import { CacheDashboardComponent } from './cache-dashboard/cache-dashboard.component';
import { ProductFormComponent } from './product-form/product-form.component';
import { AdminLayoutComponent } from './admin-layout/admin-layout.component';
import { AdminProductListComponent } from './product-list/admin-product-list.component'; // ✅ NOUVEAU

@NgModule({
  declarations: [
    DashboardComponent,
    UsersManagementComponent,
    CacheDashboardComponent,
    ProductFormComponent,
    AdminLayoutComponent,
    AdminProductListComponent, // ✅ NOUVEAU
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    AdminRoutingModule,
  ]
})
export class AdminModule { }
