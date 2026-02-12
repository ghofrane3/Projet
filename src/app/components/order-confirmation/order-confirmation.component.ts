import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './order-confirmation.component.html',
  styleUrls: ['./order-confirmation.component.scss']
})
export class OrderConfirmationComponent implements OnInit {
  orderId: string = '';
  orderTotal: number = 0;
  estimatedDelivery: Date;
  today: Date = new Date();

  constructor(private router: Router) {
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras.state as any;

    this.orderId = state?.transactionId || 'ORD-' + Date.now();
    this.orderTotal = state?.orderTotal || 0;
    this.estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 jours
  }

  ngOnInit(): void {}

  continueShopping(): void {
    this.router.navigate(['/products']);
  }

  trackOrder(): void {
    alert(`Vous pouvez suivre votre commande avec le numéro : ${this.orderId}`);
  }
}
