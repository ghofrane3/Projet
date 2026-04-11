// src/app/services/search.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import {
  debounceTime, distinctUntilChanged,
  switchMap, catchError, filter
} from 'rxjs/operators';

export interface SearchSuggestion {
  type:   'product' | 'brand' | 'category';
  label:  string;
  price?: number;
  image?: string | null;
  id?:    string;
}

export interface SearchResult {
  success:     boolean;
  products:    any[];
  pagination:  { page: number; limit: number; total: number; pages: number };
  searchTerm?: string;
  resultCount?: number;
  _cached?:    boolean;
}

@Injectable({ providedIn: 'root' })
export class SearchService {

  private readonly API = 'http://localhost:5000/api/products';

  // Subject pour déclencher la recherche depuis le header
  private searchSubject = new Subject<string>();

  constructor(private http: HttpClient) {}

  // ── Recherche principale ──────────────────────────────────
  search(params: {
    search?:   string;
    gender?:   string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    page?:     number;
    limit?:    number;
    sort?:     string;
  }): Observable<SearchResult> {

    let httpParams = new HttpParams();

    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        httpParams = httpParams.set(key, String(val));
      }
    });

    return this.http.get<SearchResult>(this.API, {
      params:          httpParams,
      withCredentials: true
    }).pipe(
      catchError(err => {
        console.error('❌ Erreur recherche:', err);
        return of({ success: false, products: [],
                    pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
      })
    );
  }

  // ── Autocomplete avec debounce ────────────────────────────
  getSuggestions(query: string): Observable<SearchSuggestion[]> {
    if (!query || query.trim().length < 2) {
      return of([]);
    }

    const params = new HttpParams().set('q', query.trim());

    return this.http.get<{ success: boolean; suggestions: SearchSuggestion[] }>(
      `${this.API}/search/suggestions`,
      { params, withCredentials: true }
    ).pipe(
      switchMap(res => of(res.suggestions || [])),
      catchError(() => of([]))
    );
  }

  // ── Stream de recherche avec debounce (pour le header) ────
  getSearchStream(inputObservable: Observable<string>): Observable<SearchResult> {
    return inputObservable.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      filter(term => term.trim().length >= 2),
      switchMap(term => this.search({ search: term }))
    );
  }

  // ── Émettre une recherche depuis le header ────────────────
  emitSearch(term: string): void {
    this.searchSubject.next(term);
  }

  get searchStream$(): Observable<string> {
    return this.searchSubject.asObservable();
  }
}
