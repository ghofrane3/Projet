import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CartComponent } from './cart/cart.component';
import { CheckoutComponent } from './checkout/checkout.component';
import { OrderConfirmationComponent } from './order-confirmation/order-confirmation.component';
import { authGuard } from '../../guards/auth.guard';
import { CartService } from '../../services/cart.service';

const routes: Routes = [
  { path: '', component: CartService },
  { path: 'checkout', component: CheckoutComponent, canActivate: [authGuard] },
  { path: 'confirmation/:orderId', component: OrderConfirmationComponent, canActivate: [authGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CartRoutingModule { }
