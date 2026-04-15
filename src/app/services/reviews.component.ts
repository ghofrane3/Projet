import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService } from '../services/review.service';
import { AuthService } from '../services/auth.service';
import { ProductService } from '../services/product.service';

interface Review {
  _id: string;
  user: { name: string; avatar?: string } | null;
  product: { _id: string; name: string } | null;
  rating: number;
  comment: string;
  createdAt: Date | string;
  helpful?: number;
}

interface Product {
  _id: string;
  name: string;
}

// ✅ Interface pour la réponse backend
interface CreateReviewResponse {
  success: boolean;
  review: Review;
}

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reviews.component.html',
  styleUrls: ['./reviews.component.scss']
})
export class ReviewsComponent implements OnInit {

  reviews: Review[] = [];
  allProducts: Product[] = [];
  loading = true;
  submitting = false;

  newReview = {
    productId: '',
    rating: 5,
    comment: ''
  };

  currentUser: any = null;
  successMessage = '';
  errorMessage = '';

  constructor(
    private reviewService: ReviewService,
    private productService: ProductService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadReviews();
    this.loadAllProducts();
  }

  loadAllProducts(): void {
    this.productService.getAllProducts().subscribe({
      next: (res: any) => {
        this.allProducts = res.products || res.data || res || [];
      },
      error: (err) => console.error('Erreur chargement produits:', err)
    });
  }

  loadReviews(): void {
    this.loading = true;
    this.reviewService.getFeaturedReviews(20).subscribe({
      next: (res: any) => {
        this.reviews = res.reviews || [];
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
      }
    });
  }

  submitReview(): void {
    if (!this.currentUser) {
      this.errorMessage = "Vous devez être connecté pour laisser un avis";
      this.clearMessages();
      return;
    }

    if (!this.newReview.productId) {
      this.errorMessage = "Veuillez sélectionner un produit";
      this.clearMessages();
      return;
    }

    if (this.newReview.comment.trim().length < 10) {
      this.errorMessage = "Le commentaire doit contenir au moins 10 caractères";
      this.clearMessages();
      return;
    }

    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const reviewData = {
      product: this.newReview.productId,
      rating: this.newReview.rating,
      comment: this.newReview.comment.trim()
    };

    this.reviewService.createReview(reviewData).subscribe({
      next: (res: CreateReviewResponse) => {
        this.successMessage = "✅ Merci ! Votre avis a été publié avec succès.";

        // ✅ plus d'erreur TypeScript ici
        this.reviews.unshift(res.review);

        this.resetForm();
        this.submitting = false;
      },
      error: (err) => {
        console.error(err);
        this.errorMessage = err.error?.message || "Erreur lors de la publication de l'avis";
        this.submitting = false;
      }
    });
  }

  resetForm(): void {
    this.newReview = { productId: '', rating: 5, comment: '' };
  }

  clearMessages(): void {
    setTimeout(() => {
      this.successMessage = '';
      this.errorMessage = '';
    }, 4000);
  }

  markHelpful(review: Review): void {
    this.reviewService.markHelpful(review._id).subscribe(() => {
      review.helpful = (review.helpful || 0) + 1;
    });
  }

  getStars(rating: number): number[] {
    return Array(Math.floor(rating)).fill(0);
  }

  getInitial(name: string | undefined | null): string {
    if (!name || name.trim() === '') return '?';
    return name.charAt(0).toUpperCase();
  }

  formatDate(date: any): string {
    if (!date) return 'Date inconnue';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
}
