import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { CartRoutingModule } from './cart-routing.module';

// Composants Cart
import { CartComponent } from './cart/cart.component';
import { CheckoutComponent } from './checkout/checkout.component';
import { OrderConfirmationComponent } from './order-confirmation/order-confirmation.component';

@NgModule({
  declarations: [
    CartComponent,
    CheckoutComponent,
    OrderConfirmationComponent
  ],
  imports: [
    SharedModule,
    CartRoutingModule
  ]
})
export class CartModule { }
