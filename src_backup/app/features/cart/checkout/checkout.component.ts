import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CartService } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service';

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  size?: string;
  color?: string;
}

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit {
  // Données panier
  cartItems: CartItem[] = [];
  subtotal = 0;
  shipping = 0;
  total = 0;

  // Formulaire livraison
  deliveryForm = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'France'
  };

  // Formulaire paiement
  paymentForm = {
    cardNumber: '',
    cardName: '',
    expiryDate: '',
    cvv: ''
  };

  // États
  loading = false;
  error = '';
  step = 1; // 1: Livraison, 2: Paiement

  constructor(
    private cartService: CartService,
    private authService: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadCart();
    this.loadUserInfo();
  }

  loadCart(): void {
    this.cartItems = this.cartService.getCartItems();
    this.calculateTotals();
  }

  loadUserInfo(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      const [firstName, ...lastNameParts] = user.name.split(' ');
      this.deliveryForm.firstName = firstName;
      this.deliveryForm.lastName = lastNameParts.join(' ');
      this.deliveryForm.email = user.email;
    }
  }

  calculateTotals(): void {
    this.subtotal = this.cartService.getCartTotal();
    this.shipping = this.subtotal >= 150 ? 0 : 9.99;
    this.total = this.subtotal + this.shipping;
  }

  onDeliverySubmit(): void {
    // Validation
    if (!this.validateDeliveryForm()) {
      this.error = 'Veuillez remplir tous les champs obligatoires';
      return;
    }

    this.error = '';
    this.step = 2; // Passer au paiement
  }

  validateDeliveryForm(): boolean {
    const { firstName, lastName, email, phone, address, city, postalCode } = this.deliveryForm;
    return !!(firstName && lastName && email && phone && address && city && postalCode);
  }

  onPaymentSubmit(): void {
    // Validation
    if (!this.validatePaymentForm()) {
      this.error = 'Veuillez remplir toutes les informations de paiement';
      return;
    }

    this.processOrder();
  }

  validatePaymentForm(): boolean {
    const { cardNumber, cardName, expiryDate, cvv } = this.paymentForm;
    return !!(cardNumber && cardName && expiryDate && cvv);
  }

  processOrder(): void {
    this.loading = true;
    this.error = '';

    const orderData = {
      items: this.cartItems,
      delivery: this.deliveryForm,
      payment: {
        method: 'card',
        last4: this.paymentForm.cardNumber.slice(-4)
      },
      subtotal: this.subtotal,
      shipping: this.shipping,
      total: this.total
    };

    this.http.post('http://localhost:5000/api/orders', orderData)
      .subscribe({
        next: (response: any) => {
          console.log('✅ Commande créée:', response);

          // Vider le panier
          this.cartService.clearCart();

          // Rediriger vers confirmation
          this.router.navigate(['/order-confirmation'], {
            queryParams: { orderId: response.order._id }
          });
        },
        error: (error) => {
          console.error('❌ Erreur commande:', error);
          this.error = 'Erreur lors du paiement. Veuillez réessayer.';
          this.loading = false;
        }
      });
  }

  goBackToDelivery(): void {
    this.step = 1;
    this.error = '';
  }

  formatCardNumber(event: any): void {
    let value = event.target.value.replace(/\s/g, '');
    let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
    this.paymentForm.cardNumber = formattedValue;
  }

  formatExpiryDate(event: any): void {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    this.paymentForm.expiryDate = value;
  }
}
