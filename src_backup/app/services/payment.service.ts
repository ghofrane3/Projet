import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

export interface PaymentMethod {
  id: number;
  name: string;
  icon: string;
  description: string;
}

export interface PaymentData {
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  cvv: string;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private paymentMethods: PaymentMethod[] = [
    { id: 1, name: 'Carte Bancaire', icon: '💳', description: 'Paiement sécurisé par carte' },
    { id: 2, name: 'Paiement à la livraison', icon: '🚚', description: 'Payez lorsque vous recevez votre commande' },
    { id: 3, name: 'Virement Bancaire', icon: '🏦', description: 'Transfert direct vers notre compte' },
    { id: 4, name: 'Porte-monnaie électronique', icon: '📱', description: 'Paiement via application mobile' }
  ];

  constructor() {}

  getPaymentMethods(): PaymentMethod[] {
    return this.paymentMethods;
  }

  processPayment(paymentData: PaymentData): Observable<{ success: boolean; message: string; transactionId: string }> {
    // Simulation de traitement de paiement
    console.log('Processing payment:', paymentData);

    // Simuler un délai de traitement
    return of({
      success: true,
      message: 'Paiement traité avec succès',
      transactionId: 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    }).pipe(delay(2000));
  }

  validateCard(cardNumber: string): boolean {
    // Validation simple de carte (simulation)
    const cleaned = cardNumber.replace(/\s/g, '');
    return cleaned.length === 16 && /^\d+$/.test(cleaned);
  }
}
