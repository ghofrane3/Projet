import { Component, OnInit, AfterViewInit} from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { loadStripe, Stripe, StripeCardElement } from '@stripe/stripe-js';
import { CartService } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit, AfterViewInit {

  // ── Panier
  cartItems: any[] = [];
  subtotal = 0;
  shipping = 0;
  total = 0;

  // ── Formulaire livraison
  deliveryForm = {
    firstName: '', lastName: '', email: '',
    phone: '', address: '', city: '',
    postalCode: '', country: 'France'
  };

  // ── Stripe
  private stripe: Stripe | null = null;
  private cardElement: StripeCardElement | null = null;

  // ── États
  loading = false;
  error = '';
  step = 1; // 1 = Livraison, 2 = Paiement

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

  async ngAfterViewInit(): Promise<void> {
    // Initialiser Stripe (ne monte le widget que si on est à l'étape 2)
  }

  // ════════════════════════════════════════════
  // PANIER
  // ════════════════════════════════════════════

  loadCart(): void {
    this.cartItems = this.cartService.getCartItems();
    this.calculateTotals();
  }

  loadUserInfo(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      const [firstName, ...rest] = user.name.split(' ');
      this.deliveryForm.firstName = firstName;
      this.deliveryForm.lastName = rest.join(' ');
      this.deliveryForm.email = user.email;
    }
  }

  calculateTotals(): void {
    this.subtotal = this.cartService.getCartTotal();
    this.shipping = this.subtotal >= 150 ? 0 : 9.99;
    this.total = this.subtotal + this.shipping;
  }

  // ════════════════════════════════════════════
  // ÉTAPE 1 — LIVRAISON
  // ════════════════════════════════════════════

  onDeliverySubmit(): void {
    if (!this.validateDeliveryForm()) {
      this.error = 'Veuillez remplir tous les champs obligatoires';
      return;
    }
    this.error = '';
    this.step = 2;

    // Monter le widget Stripe après le changement d'étape
    setTimeout(() => this.initStripe(), 100);
  }

  validateDeliveryForm(): boolean {
    const f = this.deliveryForm;
    return !!(f.firstName && f.lastName && f.email && f.phone && f.address && f.city && f.postalCode);
  }

  // ════════════════════════════════════════════
  // ÉTAPE 2 — PAIEMENT STRIPE
  // ════════════════════════════════════════════

  async initStripe(): Promise<void> {
    this.stripe = await loadStripe('pk_test_51TKj5eBPfnUYGnULxTSCXLbc5RZXqx2MMN4doJb7EfHvN7qHu5On8jDh4S9yRTcLKvI7BZvj5H9bYJqmHZAVw92n003xmQrpm0');

    if (!this.stripe) return;

    const elements = this.stripe.elements();

    // Créer le widget carte
    this.cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#424770',
          '::placeholder': { color: '#aab7c4' }
        },
        invalid: { color: '#9e2146' }
      }
    });

    // Monter dans le div #card-element du HTML
    this.cardElement.mount('#card-element');
  }

  async onPaymentSubmit(): Promise<void> {
    if (!this.stripe || !this.cardElement) {
      this.error = 'Stripe non initialisé. Actualisez la page.';
      return;
    }

    this.loading = true;
    this.error = '';

    const token = localStorage.getItem('token') || localStorage.getItem('accessToken') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    const products = this.cartItems.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    }));

    const shippingAddress = {
      street: this.deliveryForm.address,
      city: this.deliveryForm.city,
      zipCode: this.deliveryForm.postalCode,
      country: this.deliveryForm.country
    };

    // ── 1. Demander le clientSecret au backend
    this.http.post<any>(
      'http://localhost:5000/api/payment/create-payment-intent',
      { products, shippingAddress, totalAmount: this.total },
      { headers }
    ).subscribe({
      next: async (res) => {
        // ── 2. Confirmer le paiement avec Stripe
        const result = await this.stripe!.confirmCardPayment(res.clientSecret, {
          payment_method: { card: this.cardElement! }
        });

        if (result.error) {
          this.error = result.error.message || 'Paiement refusé';
          this.loading = false;
          return;
        }

        // ── 3. Confirmer la commande en base
        this.http.post<any>(
          `http://localhost:5000/api/payment/confirm/${res.orderId}`,
          {},
          { headers }
        ).subscribe({
          next: () => {
            this.cartService.clearCart().subscribe();
            this.router.navigate(['/cart/confirmation', res.orderId], {
              queryParams: { orderId: res.orderId }
            });
          },
          error: () => {
            // Le paiement a réussi même si la confirmation échoue
            this.router.navigate(['/cart/confirmation', res.orderId], {
              queryParams: { orderId: res.orderId }
            });
          }
        });
      },
      error: (err) => {
        this.error = err.error?.message || 'Erreur serveur';
        this.loading = false;
      }
    });
  }

  goBackToDelivery(): void {
    this.step = 1;
    this.error = '';
    if (this.cardElement) {
      this.cardElement.unmount();
      this.cardElement = null;
    }
  }
}
