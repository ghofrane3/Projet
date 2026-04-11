import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ProductListComponent }   from './product-list/product-list.component';
import { ProductDetailComponent } from './product-detail/product-detail.component';
import { CategoryComponent }      from './category/category.component';

const routes: Routes = [
  // ── Liste produits + recherche (route principale) ──────
  { path: '', component: ProductListComponent },

  // ── Catégorie spécifique ───────────────────────────────
  { path: 'category/:categoryId', component: CategoryComponent },

  // ── Détail produit (doit rester en dernier) ────────────
  { path: ':id', component: ProductDetailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductsRoutingModule {}
