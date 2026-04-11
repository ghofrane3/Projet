import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

interface AuthResponse {
  success: boolean;
  message?: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isVerified: boolean;
  };
  needsVerification?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:5000/api/auth';

  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.checkAuthStatus();
  }

  // ════════════════════════════════════════════════════════════
  // VÉRIFICATION DE L'AUTHENTIFICATION
  // ════════════════════════════════════════════════════════════

  checkAuthStatus(): void {
    this.http.get<any>(`${this.apiUrl}/me`, {
      withCredentials: true
    }).subscribe({
      next: (response) => {
        if (response.success && response.user) {
          this.currentUserSubject.next(response.user);
          console.log('✅ Utilisateur authentifié:', response.user.email);
        } else {
          this.currentUserSubject.next(null);
        }
      },
      error: () => {
        this.currentUserSubject.next(null);
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // INSCRIPTION
  // ════════════════════════════════════════════════════════════

  register(userData: { name: string; email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/register`, userData, {
      withCredentials: true
    }).pipe(
      tap(response => {
        if (response.success) {
          console.log('✅ Inscription réussie');
        }
      }),
      catchError(error => {
        console.error('❌ Erreur inscription:', error);
        return throwError(() => error);
      })
    );
  }

  resendVerification(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/resend-verification`,
      { email },
      { withCredentials: true }
    ).pipe(
      catchError(error => {
        console.error('❌ Erreur renvoi vérification:', error);
        return throwError(() => error);
      })
    );
  }

  // ════════════════════════════════════════════════════════════
  // CONNEXION
  // ════════════════════════════════════════════════════════════

  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials, {
      withCredentials: true
    }).pipe(
      tap(response => {
        if (response.success && response.user) {
          this.currentUserSubject.next(response.user);
          console.log('✅ Connexion réussie:', response.user.email);
        }
      }),
      catchError(error => {
        console.error('❌ Erreur connexion:', error);
        return throwError(() => error);
      })
    );
  }

  // ════════════════════════════════════════════════════════════
  // DÉCONNEXION
  // ════════════════════════════════════════════════════════════

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}, {
      withCredentials: true
    }).pipe(
      tap(() => {
        this.currentUserSubject.next(null);
        console.log('✅ Déconnexion réussie');
        this.router.navigate(['/auth/login']);
      }),
      catchError(error => {
        console.error('❌ Erreur déconnexion:', error);
        this.currentUserSubject.next(null);
        this.router.navigate(['/auth/login']);
        return throwError(() => error);
      })
    );
  }

  // ════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════

  getCurrentUser(): any {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  isAdmin(): boolean {
    const user = this.currentUserSubject.value;
    return user && user.role === 'admin';
  }

  // ════════════════════════════════════════════════════════════
  // MÉTHODES DE COMPATIBILITÉ (pour ne pas casser l'ancien code)
  // ════════════════════════════════════════════════════════════

  /**
   * ⚠️ DEPRECATED : Cette méthode existe pour compatibilité
   * Les tokens sont maintenant dans des cookies httpOnly
   * Cette méthode retourne toujours null
   */
  getAccessToken(): string | null {
    console.warn('⚠️ getAccessToken() est obsolète. Les tokens sont dans des cookies httpOnly.');
    return null;
  }

  /**
   * ⚠️ DEPRECATED : Cette méthode existe pour compatibilité
   * Les tokens sont maintenant dans des cookies httpOnly
   * Cette méthode retourne toujours null
   */
  getRefreshToken(): string | null {
    console.warn('⚠️ getRefreshToken() est obsolète. Les tokens sont dans des cookies httpOnly.');
    return null;
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  updateProfile(profileData: { name?: string; email?: string; password?: string }): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/profile`, profileData, {
      withCredentials: true
    }).pipe(
      tap(response => {
        if (response.success && response.user) {
          // Mettre à jour l'utilisateur local
          this.currentUserSubject.next(response.user);
          console.log('✅ Profil mis à jour');
        }
      }),
      catchError(error => {
        console.error('❌ Erreur mise à jour profil:', error);
        return throwError(() => error);
      })
    );
  }
}
