import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CartComponent } from './cart/cart.component';
import { CheckoutComponent } from './checkout/checkout.component';
import { OrderConfirmationComponent } from './order-confirmation/order-confirmation.component';
import { OrderDetailComponent } from './order-detail/order-detail.component';
import { authGuard } from '../../guards/auth.guard';

const routes: Routes = [
  { path: '', component: CartComponent },                                                              // ✅ Fix #1
  { path: 'checkout', component: CheckoutComponent, canActivate: [authGuard] },
  { path: 'confirmation/:orderId', component: OrderConfirmationComponent, canActivate: [authGuard] },
  { path: 'order/:id', component: OrderDetailComponent, canActivate: [authGuard] },                   // ✅ Fix #3
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CartRoutingModule { }
