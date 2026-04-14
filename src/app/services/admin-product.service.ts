import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface AdminProduct {
  _id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  category: string;
  gender: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
  images: { url: string; publicId: string; isMain: boolean }[];
  stock: number;
  material: string;
  brand: string;
  sku?: string;
  tags: string[];
  featured: boolean;
  isActive: boolean;
  rating: { average: number; count: number };
  salesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductsResponse {
  success: boolean;
  products: AdminProduct[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ProductResponse {
  success: boolean;
  product: AdminProduct;
}

@Injectable({
  providedIn: 'root'
})
export class AdminProductService {

  private readonly API = 'http://localhost:5000/api/admin';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getAccessToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── Liste paginée ──────────────────────────────────────────
  getProducts(page = 1, limit = 12, search = '', category = ''): Observable<ProductsResponse> {
    let params = new HttpParams()
      .set('page', page)
      .set('limit', limit);
    if (search)   params = params.set('search', search);
    if (category) params = params.set('category', category);

    return this.http.get<ProductsResponse>(`${this.API}/products`, {
      headers: this.getHeaders(),
      params
    });
  }

  // ── Récupérer un produit par ID ────────────────────────────
  getProductById(id: string): Observable<ProductResponse> {
    return this.http.get<ProductResponse>(`${this.API}/products/${id}`, {
      headers: this.getHeaders()
    });
  }

  // ── Créer un produit ───────────────────────────────────────
  createProduct(formData: FormData): Observable<ProductResponse> {
    return this.http.post<ProductResponse>(`${this.API}/products`, formData, {
      headers: this.getHeaders()
    });
  }

  // ── Mettre à jour un produit ───────────────────────────────
  updateProduct(id: string, formData: FormData): Observable<ProductResponse> {
    return this.http.put<ProductResponse>(`${this.API}/products/${id}`, formData, {
      headers: this.getHeaders()
    });
  }

  // ── Supprimer un produit ───────────────────────────────────
  deleteProduct(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.API}/products/${id}`,
      { headers: this.getHeaders() }
    );
  }

  // ── Stats pour le dashboard ────────────────────────────────
  getStats(): Observable<any> {
    return this.http.get<any>(`${this.API}/stats`, {
      headers: this.getHeaders()
    });
  }
}
