// ============================================================
// src/app/services/recommendation.service.ts
// CORRECTION : Gestion des tracking sans productId
// ============================================================

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap, catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface RecommendedCategory {
  category: string;
  score: number;
  breakdown: {
    markov:          number;
    popularity:      number;
    personalization: number;
    novelty:         number;
  };
  sampleProducts: {
    _id: string;
    name: string;
    price: number;
    images: Array<{url: string; publicId: string}> | string[]; // ✅ Supporte les deux formats
    rating: number;
  }[];
}

export interface RecommendationResult {
  currentCategory: string | null;
  recommendations: RecommendedCategory[];
  meta: {
    algorithm: string;
    personalized: boolean;
    fromCache?: boolean;
  };
}

// ✅ CORRECTION : productId devient nullable
export interface TrackingPayload {
  productId: string | null;  // ← null pour les navigations de catégorie
  category:  string;
  type:      'view' | 'click' | 'cart' | 'purchase';
  dwellTime?: number;
}

@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/recommendations`;

  private _cache = new Map<string, Observable<RecommendationResult>>();
  private _recs$ = new BehaviorSubject<RecommendedCategory[]>([]);
  public recommendations$ = this._recs$.asObservable();

  private get sessionId(): string {
    let id = sessionStorage.getItem('reco_session_id');
    if (!id) {
      id = `s-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      sessionStorage.setItem('reco_session_id', id);
    }
    return id;
  }

  private get headers() {
    return { 'X-Session-Id': this.sessionId };
  }

  getByCategory(
    category: string,
    options: { topK?: number; excludeVisited?: boolean } = {}
  ): Observable<RecommendationResult> {
    const cacheKey = `cat:${category}:${options.topK ?? 5}`;

    if (!this._cache.has(cacheKey)) {
      const params = new HttpParams()
        .set('category', category)
        .set('topK',     String(options.topK ?? 5))
        .set('excludeVisited', String(options.excludeVisited ?? false));

      const obs$ = this.http
        .get<{ success: boolean; data: RecommendationResult }>(
          this.baseUrl,
          { params, headers: this.headers }
        )
        .pipe(
          tap((res) => {
            if (res.success) {
              this._recs$.next(res.data.recommendations);
            }
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        ) as any;

      setTimeout(() => this._cache.delete(cacheKey), 2 * 60 * 1000);
      this._cache.set(cacheKey, obs$);
    }

    return this._cache.get(cacheKey)!;
  }

  getPersonalized(topK = 5): Observable<RecommendationResult> {
    const params = new HttpParams().set('topK', String(topK));

    return this.http
      .get<{ success: boolean; data: RecommendationResult }>(
        `${this.baseUrl}/personalized`,
        { params, headers: this.headers }
      )
      .pipe(
        tap((res) => {
          if (res.success) this._recs$.next(res.data.recommendations);
        })
      ) as any;
  }

  // ✅ CORRECTION : Accepte productId=null pour les navigations
  track(payload: TrackingPayload): Observable<{ success: boolean }> {
    return this.http
      .post<{ success: boolean }>(
        `${this.baseUrl}/track`,
        payload,
        { headers: this.headers }
      )
      .pipe(
        catchError((err) => {
          console.warn('[Reco] Tracking échoué (silencieux):', err.message);
          return of({ success: false });
        })
      );
  }

  getPopular(topK = 10) {
    const params = new HttpParams().set('topK', String(topK));
    return this.http.get<any>(`${this.baseUrl}/popular`, { params });
  }

  // ✅ CORRECTION : Validation stricte de productId
  trackProductView(productId: string, category: string): () => void {
    // Vérifie que productId est un ObjectId MongoDB valide
    if (!productId || productId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(productId)) {
      console.error(`[Reco] productId invalide : "${productId}"`);
      return () => {}; // retourne une fonction vide
    }

    const startTime = Date.now();

    // Enregistre la vue immédiatement
    this.track({ productId, category, type: 'view' }).subscribe();

    // Retourne une fonction "cleanup" à appeler quand on quitte la page
    return () => {
      const dwellTime = Math.round((Date.now() - startTime) / 1000);
      if (dwellTime > 3) {
        this.track({ productId, category, type: 'click', dwellTime }).subscribe();
      }
    };
  }
}
