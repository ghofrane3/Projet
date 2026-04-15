import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ✅ Interface Review (optionnel mais recommandé)
export interface Review {
  _id: string;
  user: { name: string; avatar?: string } | null;
  product: { _id: string; name: string } | null;
  rating: number;
  comment: string;
  createdAt: Date | string;
  helpful?: number;
}

// ✅ Interface réponse backend
export interface CreateReviewResponse {
  success: boolean;
  review: Review;
}

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private apiUrl = `${environment.apiUrl}/reviews`;

  constructor(private http: HttpClient) {}

  // Récupérer les avis en vedette
  getFeaturedReviews(limit: number = 6): Observable<any> {
    return this.http.get(`${this.apiUrl}/featured`, {
      params: { limit: limit.toString() }
    });
  }

  // Récupérer les avis d’un produit
  getProductReviews(productId: string, page: number = 1, limit: number = 10): Observable<any> {
    return this.http.get(`${this.apiUrl}/product/${productId}`, {
      params: {
        page: page.toString(),
        limit: limit.toString()
      }
    });
  }

  // ✅ Créer un avis (corrigé + typé)
  createReview(data: any): Observable<CreateReviewResponse> {
    return this.http.post<CreateReviewResponse>(
      `${this.apiUrl}`,
      data,
      { withCredentials: true } // 🔥 obligatoire
    );
  }

  // Marquer utile
  markHelpful(reviewId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${reviewId}/helpful`, {});
  }
}
