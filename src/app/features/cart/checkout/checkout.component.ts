// src/app/features/cart/checkout/checkout.component.ts
import { Component, OnInit, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { loadStripe, Stripe, StripeCardElement } from '@stripe/stripe-js';
import { CartService } from '../../../services/cart.service';
import { AuthService } from '../../../services/auth.service';

const API_BASE = 'http://localhost:5000/api';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit, AfterViewInit {

  // ── Panier ─────────────────────────────────────────────
  cartItems: any[] = [];
  subtotal = 0;
  shipping = 0;
  total    = 0;

  // ── Formulaire livraison ────────────────────────────────
  deliveryForm = {
    firstName: '', lastName: '', email: '',
    phone: '', address: '', city: '',
    postalCode: '', country: 'Tunisie'
  };

  // ── Erreurs de validation ───────────────────────────────
  phoneError  = '';
  postalError = '';

  // ── Stripe ─────────────────────────────────────────────
  private stripe:      Stripe | null          = null;
  private cardElement: StripeCardElement | null = null;

  // ── États ──────────────────────────────────────────────
  loading = false;
  error   = '';
  step    = 1; // 1 = Livraison, 2 = Paiement

  constructor(
    private cartService: CartService,
    private authService: AuthService,
    private http:        HttpClient,
    private router:      Router
  ) {}

  ngOnInit(): void {
    this.loadCart();
    this.loadUserInfo();
  }

  async ngAfterViewInit(): Promise<void> {
    // Stripe monté uniquement à l'étape 2
  }

  // ════════════════════════════════════════════════════════
  // PANIER
  // ════════════════════════════════════════════════════════
  loadCart(): void {
    this.cartItems = this.cartService.getCartItems();
    this.calculateTotals();
  }

  loadUserInfo(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      const [firstName, ...rest] = user.name.split(' ');
      this.deliveryForm.firstName = firstName;
      this.deliveryForm.lastName  = rest.join(' ');
      this.deliveryForm.email     = user.email;
    }
  }

  calculateTotals(): void {
    this.subtotal = this.cartService.getCartTotal();
    this.shipping = this.subtotal >= 150 ? 0 : 9.99;
    this.total    = this.subtotal + this.shipping;
  }

  // ════════════════════════════════════════════════════════
  // VALIDATION
  // ════════════════════════════════════════════════════════
  isValidPhone(phone: string): boolean {
    return /^(\+?\d[\d\s\-]{7,14}\d)$/.test(phone.trim());
  }

  isValidPostalCode(code: string): boolean {
    if (this.deliveryForm.country === 'Tunisie') {
      return /^\d{4}$/.test(code.trim());
    }
    return /^\d{4,5}$/.test(code.trim());
  }

  onPhoneChange(): void {
    const v = this.deliveryForm.phone.trim();
    if (!v) { this.phoneError = ''; return; }
    this.phoneError = this.isValidPhone(v)
      ? ''
      : 'Format invalide (ex : 0612345678 ou +216 XX XXX XXX)';
  }

  onPostalChange(): void {
    const v = this.deliveryForm.postalCode.trim();
    if (!v) { this.postalError = ''; return; }
    const isTunisie = this.deliveryForm.country === 'Tunisie';
    this.postalError = this.isValidPostalCode(v)
      ? ''
      : isTunisie
        ? 'Code postal invalide (4 chiffres requis pour la Tunisie)'
        : 'Code postal invalide (5 chiffres requis)';
  }

  onCountryChange(): void {
    if (this.deliveryForm.postalCode) this.onPostalChange();
  }

  // ════════════════════════════════════════════════════════
  // ÉTAPE 1 — LIVRAISON
  // ════════════════════════════════════════════════════════
  onDeliverySubmit(): void {
    this.onPhoneChange();
    this.onPostalChange();

    if (!this.validateDeliveryForm()) {
      this.error = 'Veuillez corriger les champs invalides avant de continuer';
      return;
    }
    this.error = '';
    this.step  = 2;
    setTimeout(() => this.initStripe(), 100);
  }

  validateDeliveryForm(): boolean {
    const f = this.deliveryForm;
    const allFilled = !!(
      f.firstName && f.lastName && f.email &&
      f.phone && f.address && f.city && f.postalCode
    );
    return allFilled && this.isValidPhone(f.phone) && this.isValidPostalCode(f.postalCode);
  }

  // ════════════════════════════════════════════════════════
  // ÉTAPE 2 — PAIEMENT STRIPE
  // ════════════════════════════════════════════════════════
  async initStripe(): Promise<void> {
    this.stripe = await loadStripe(
      'pk_test_51TKj5eBPfnUYGnULxTSCXLbc5RZXqx2MMN4doJb7EfHvN7qHu5On8jDh4S9yRTcLKvI7BZvj5H9bYJqmHZAVw92n003xmQrpm0'
    );
    if (!this.stripe) return;

    const elements   = this.stripe.elements();
    this.cardElement = elements.create('card', {
      style: {
        base:    { fontSize: '16px', color: '#424770', '::placeholder': { color: '#aab7c4' } },
        invalid: { color: '#9e2146' }
      }
    });
    this.cardElement.mount('#card-element');
  }

  async onPaymentSubmit(): Promise<void> {
    if (!this.stripe || !this.cardElement) {
      this.error = 'Stripe non initialisé. Actualisez la page.';
      return;
    }

    this.loading = true;
    this.error   = '';

    // ── Token JWT ─────────────────────────────────────────
    const token   = localStorage.getItem('token') || localStorage.getItem('accessToken') || '';
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    const products = this.cartItems.map(item => ({
      productId: item.productId,
      name:      item.name,
      price:     item.price,
      quantity:  item.quantity
    }));

    const shippingAddress = {
      street:  this.deliveryForm.address,
      city:    this.deliveryForm.city,
      zipCode: this.deliveryForm.postalCode,
      country: this.deliveryForm.country
    };

    // ── 1. Créer le PaymentIntent ─────────────────────────
    // ✅ URL CORRIGÉE : /api/payments (avec "s")
    this.http.post<any>(
      `${API_BASE}/payments/create-payment-intent`,
      { products, shippingAddress, totalAmount: this.total },
      { headers }
    ).subscribe({
      next: async (res) => {

        // ── 2. Confirmer avec Stripe ────────────────────────
        const result = await this.stripe!.confirmCardPayment(res.clientSecret, {
          payment_method: { card: this.cardElement! }
        });

        if (result.error) {
          this.error   = result.error.message || 'Paiement refusé';
          this.loading = false;
          return;
        }

        // ── 3. Paiement confirmé → vider le panier et rediriger
        //    Le webhook Stripe s'occupe de mettre à jour la commande
        //    et d'envoyer l'email de confirmation côté backend.
        this.cartService.clearCart().subscribe({
          next:  () => {},
          error: () => {}
        });

        this.router.navigate(
          ['/cart/confirmation', res.orderId],
          { queryParams: { orderId: res.orderId } }
        );
      },

      error: (err) => {
        this.error   = err.error?.message || 'Erreur serveur lors de la création du paiement';
        this.loading = false;
      }
    });
  }

  goBackToDelivery(): void {
    this.step  = 1;
    this.error = '';
    if (this.cardElement) {
      this.cardElement.unmount();
      this.cardElement = null;
    }
  }
}
