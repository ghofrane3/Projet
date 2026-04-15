import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = `${environment.apiUrl}/products`;

  constructor(private http: HttpClient) {}

  // ==================== NOUVELLE MÉTHODE AJOUTÉE ====================
  // Récupérer TOUS les produits (sans filtre)
  getAllProducts(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  // Récupérer tous les produits avec filtres
  getProducts(filters?: any): Observable<any> {
    let params = new HttpParams();

    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
          params = params.set(key, filters[key].toString());
        }
      });
    }

    return this.http.get(this.apiUrl, { params });
  }

  // Récupérer un produit par ID
  getProduct(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  // Récupérer les produits en vedette
  getFeaturedProducts(limit: number = 8): Observable<any> {
    return this.http.get(`${this.apiUrl}/featured`, {
      params: { limit: limit.toString() }
    });
  }

  // Récupérer les produits tendance (top ventes)
  getTrendingProducts(limit: number = 8): Observable<any> {
    return this.http.get(`${this.apiUrl}/trending`, {
      params: { limit: limit.toString() }
    });
  }

  // Récupérer les catégories disponibles
  getCategories(): Observable<any> {
    return this.http.get(`${this.apiUrl}/categories`);
  }

  // Recherche avec suggestions
  searchSuggestions(query: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/search/suggestions`, {
      params: { q: query }
    });
  }

  // Recherches populaires
  getPopularSearches(): Observable<any> {
    return this.http.get(`${this.apiUrl}/search/popular`);
  }


}
