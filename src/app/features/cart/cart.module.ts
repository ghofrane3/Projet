import { NgModule, Component } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { CartRoutingModule } from './cart-routing.module';
import { CommonModule } from '@angular/common';
// Composants Cart
import { CartComponent } from './cart/cart.component';
import { CheckoutComponent } from './checkout/checkout.component';
import { OrderConfirmationComponent } from './order-confirmation/order-confirmation.component';
import { OrderDetailComponent } from './order-detail/order-detail.component';
@NgModule({
  declarations: [
    CartComponent,
    CheckoutComponent,
    OrderConfirmationComponent,
    OrderDetailComponent
  ],
  imports: [
    SharedModule,
    CartRoutingModule,
    CommonModule
  ]
})
export class CartModule { }
