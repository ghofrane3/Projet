import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { PaymentService, PaymentMethod } from '../../services/payment.service';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit {
  checkoutForm: FormGroup;
  paymentMethods: PaymentMethod[] = [];
  selectedPaymentMethod: number = 1;
  cartItems: any[] = [];
  isProcessing = false;
  paymentSuccess = false;
  transactionId = '';
  searchQuery = '';

  constructor(
    private fb: FormBuilder,
    private cartService: CartService,
    private paymentService: PaymentService,
    private router: Router
  ) {
    // Initialisation du formulaire
    this.checkoutForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
      address: ['', Validators.required],
      city: ['', Validators.required],
      zipCode: ['', [Validators.required, Validators.pattern(/^\d{4}$/)]],
      cardNumber: ['', [Validators.required, Validators.pattern(/^\d{16}$/)]],
      cardHolder: ['', Validators.required],
      expiryDate: ['', [Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/)]],
      cvv: ['', [Validators.required, Validators.pattern(/^\d{3}$/)]]
    });
  }

  ngOnInit(): void {
    this.paymentMethods = this.paymentService.getPaymentMethods();
    this.loadCartItems();

    // Pré-remplir avec les données de l'utilisateur connecté si disponible
    this.prefillUserData();
  }

  loadCartItems(): void {
    this.cartItems = this.cartService.getCartItems();

    // Si le panier est vide, rediriger vers le panier
    if (this.cartItems.length === 0) {
      this.router.navigate(['/cart']);
    }
  }

  prefillUserData(): void {
    // Récupérer l'utilisateur connecté depuis localStorage
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        this.checkoutForm.patchValue({
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || ''
        });
      } catch (error) {
        console.error('Erreur lors du parsing des données utilisateur:', error);
      }
    }
  }

  formatCardNumber(event: any): void {
    let input = event.target.value.replace(/\s/g, '');
    if (input.length > 16) {
      input = input.substring(0, 16);
    }

    // Format: XXXX XXXX XXXX XXXX
    let formatted = '';
    for (let i = 0; i < input.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formatted += ' ';
      }
      formatted += input[i];
    }

    // Mettre à jour la valeur dans le formulaire
    this.checkoutForm.get('cardNumber')?.setValue(formatted, { emitEvent: false });

    // Valider la carte
    if (input.length === 16) {
      const isValid = this.paymentService.validateCard(input);
      const control = this.checkoutForm.get('cardNumber');
      if (control) {
        if (!isValid) {
          control.setErrors({ invalidCard: true });
        } else {
          control.setErrors(null);
        }
      }
    }
  }

  formatExpiryDate(event: any): void {
    let input = event.target.value.replace(/\D/g, '');

    // Limiter à 4 chiffres
    if (input.length > 4) {
      input = input.substring(0, 4);
    }

    // Format: MM/AA
    if (input.length >= 2) {
      input = input.substring(0, 2) + '/' + input.substring(2);
    }

    // Mettre à jour la valeur
    this.checkoutForm.get('expiryDate')?.setValue(input, { emitEvent: false });

    // Valider la date d'expiration
    if (input.length === 5) {
      const [month, year] = input.split('/');
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear() % 100;
      const currentMonth = currentDate.getMonth() + 1;

      const expiryMonth = parseInt(month, 10);
      const expiryYear = parseInt(year, 10);

      const control = this.checkoutForm.get('expiryDate');
      if (control) {
        if (expiryMonth < 1 || expiryMonth > 12) {
          control.setErrors({ invalidMonth: true });
        } else if (expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth)) {
          control.setErrors({ expiredCard: true });
        } else {
          control.setErrors(null);
        }
      }
    }
  }

  getSubtotal(): number {
    return this.cartItems.reduce((total, item) => {
      return total + (item.product.discountPrice || item.product.price) * item.quantity;
    }, 0);
  }

  getShippingCost(): number {
    // Livraison gratuite à partir de 99 DT
    return this.getSubtotal() > 99 ? 0 : 7.99;
  }

  getTotal(): number {
    return this.getSubtotal() + this.getShippingCost();
  }

  goBack(): void {
    this.router.navigate(['/cart']);
  }

  processPayment(): void {
    console.log('🔄 Début du processus de paiement');

    // Marquer tous les champs comme touchés pour afficher les erreurs
    this.checkoutForm.markAllAsTouched();

    // Vérifier si le formulaire est valide
    if (this.checkoutForm.invalid) {
      console.log('❌ Formulaire invalide:', this.checkoutForm.errors);
      this.showFormErrors();
      return;
    }

    // Vérifier si une méthode de paiement est sélectionnée
    if (!this.selectedPaymentMethod) {
      alert('Veuillez sélectionner une méthode de paiement');
      return;
    }

    this.isProcessing = true;
    console.log('⏳ Traitement du paiement en cours...');

    // Préparer les données de paiement
    const formValue = this.checkoutForm.value;
    const paymentData = {
      cardNumber: formValue.cardNumber?.replace(/\s/g, '') || '',
      cardHolder: formValue.cardHolder || '',
      expiryDate: formValue.expiryDate || '',
      cvv: formValue.cvv || ''
    };

    // Appeler le service de paiement
    this.paymentService.processPayment(paymentData).subscribe({
      next: (response) => {
        console.log('✅ Paiement réussi:', response);
        this.isProcessing = false;

        if (response.success) {
          this.transactionId = response.transactionId;
          this.paymentSuccess = true;

          // Vider le panier
          this.cartService.clearCart();

          // Rediriger vers la page de confirmation après 3 secondes
          setTimeout(() => {
            this.router.navigate(['/order-confirmation'], {
              queryParams: {
                orderId: this.transactionId,
                total: this.getTotal()
              }
            });
          }, 3000);
        } else {
          alert('Le paiement a échoué: ' + response.message);
        }
      },
      error: (error) => {
        console.error('❌ Erreur lors du paiement:', error);
        this.isProcessing = false;
        alert('Une erreur est survenue lors du traitement du paiement. Veuillez réessayer.');
      }
    });
  }

  private showFormErrors(): void {
    // Afficher tous les champs invalides
    Object.keys(this.checkoutForm.controls).forEach(key => {
      const control = this.checkoutForm.get(key);
      if (control?.invalid) {
        console.log(`Champ ${key} invalide:`, control.errors);
      }
    });

    // Message d'erreur général
    alert('Veuillez corriger les erreurs dans le formulaire avant de continuer.');
  }

  search(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/products'], {
        queryParams: { search: this.searchQuery }
      });
      this.searchQuery = '';
    }
  }
}
