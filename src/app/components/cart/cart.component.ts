import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { CartItem } from '../../models/product.model';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent implements OnInit {
  cartItems: CartItem[] = [];

  constructor(private cartService: CartService) {}

  ngOnInit(): void {
    this.cartService.cart$.subscribe(items => {
      this.cartItems = items;
    });
  }

  // Méthode pour diminuer la quantité
  decreaseQuantity(item: CartItem): void {
    if (item.quantity > 1) {
      this.updateQuantity(item, item.quantity - 1);
    }
  }

  // Méthode pour augmenter la quantité
  increaseQuantity(item: CartItem): void {
    this.updateQuantity(item, item.quantity + 1);
  }

  // Méthode pour gérer le changement dans l'input
  onQuantityChange(item: CartItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const quantity = parseInt(input.value, 10);

    if (!isNaN(quantity) && quantity >= 1) {
      this.updateQuantity(item, quantity);
    } else {
      // Réinitialiser à la valeur précédente
      input.value = item.quantity.toString();
    }
  }

  // Méthode principale pour mettre à jour la quantité
  updateQuantity(item: CartItem, quantity: number): void {
    this.cartService.updateQuantity(item, quantity);
  }

  removeItem(item: CartItem): void {
    this.cartService.removeFromCart(item);
  }

  getSubtotal(): number {
    return this.cartService.getTotalPrice();
  }

  getShippingCost(): number {
    return this.cartItems.length > 0 ? 4.99 : 0;
  }

  getTotal(): number {
    return this.getSubtotal() + this.getShippingCost();
  }

  clearCart(): void {
    this.cartService.clearCart();
  }

}
