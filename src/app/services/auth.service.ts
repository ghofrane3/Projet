// auth.service.ts - CORRIGÉ
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

interface AuthResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  message?: string;
}

interface RefreshResponse {
  success: boolean;
  accessToken: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:5000/api/auth';
  private currentUserSubject = new BehaviorSubject<any>(this.getCurrentUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  private refreshTokenTimeout?: any;

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    if (this.getAccessToken()) {
      this.startRefreshTokenTimer();
    }
  }

  /**
   * Inscription d'un nouvel utilisateur
   */
  register(userData: { name: string; email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/register`, userData).pipe(
      catchError(error => {
        console.error('Erreur d\'inscription:', error);
        return throwError(() => error);
      })
    );
    // ✅ NOTE : on ne stocke plus le token ici car l'utilisateur doit d'abord vérifier son email
  }

  /**
   * Connexion d'un utilisateur
   */
  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        if (response.success) {
          this.storeAuthData(response.accessToken, response.refreshToken, response.user);
          this.startRefreshTokenTimer();
        }
      }),
      catchError(error => {
        console.error('Erreur de connexion:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * ✅ AJOUTÉ : Renvoyer l'email de vérification
   */
  resendVerification(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/resend-verification`, { email }).pipe(
      catchError(error => {
        console.error('Erreur renvoi vérification:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Déconnexion de l'utilisateur
   */
  logout(): Observable<any> {
    const refreshToken = this.getRefreshToken();
    this.stopRefreshTokenTimer();
    this.clearAuthData();

    if (refreshToken) {
      return this.http.post(`${this.apiUrl}/logout`, { refreshToken }).pipe(
        tap(() => {
          this.router.navigate(['/login']);
        }),
        catchError(error => {
          console.error('Erreur de déconnexion:', error);
          this.router.navigate(['/login']);
          return throwError(() => error);
        })
      );
    }

    this.router.navigate(['/login']);
    return new Observable(observer => {
      observer.next({ success: true });
      observer.complete();
    });
  }

  /**
   * Rafraîchir l'access token
   */
  refreshToken(): Observable<RefreshResponse> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      console.error('Pas de refresh token disponible');
      this.clearAuthData();
      this.router.navigate(['/login']);
      return throwError(() => new Error('No refresh token'));
    }

    return this.http.post<RefreshResponse>(`${this.apiUrl}/refresh`, { refreshToken }).pipe(
      tap(response => {
        if (response.success) {
          localStorage.setItem('accessToken', response.accessToken);
          if (response.user) {
            localStorage.setItem('user', JSON.stringify(response.user));
            this.currentUserSubject.next(response.user);
          }
          this.startRefreshTokenTimer();
          console.log('✅ Token rafraîchi avec succès');
        }
      }),
      catchError(error => {
        console.error('❌ Erreur de rafraîchissement du token:', error);
        this.clearAuthData();
        this.router.navigate(['/login']);
        return throwError(() => error);
      })
    );
  }

  /**
   * Stocker les données d'authentification
   */
  private storeAuthData(accessToken: string, refreshToken: string, user: any): void {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUserSubject.next(user);
    console.log('✅ Données d\'authentification stockées');
  }

  /**
   * Effacer les données d'authentification
   */
  private clearAuthData(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
    console.log('🗑️ Données d\'authentification effacées');
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  getCurrentUser(): any {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const isAuth = !!token;
    console.log('🔐 isAuthenticated:', isAuth);
    return isAuth;
  }

  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  updateProfile(profileData: { name?: string; email?: string; password?: string }): boolean {
    try {
      const currentUser = this.getCurrentUser();
      if (!currentUser) {
        console.error('Aucun utilisateur connecté');
        return false;
      }
      const updatedUser = { ...currentUser, ...profileData };
      if ('password' in updatedUser) {
        delete updatedUser.password;
      }
      localStorage.setItem('user', JSON.stringify(updatedUser));
      this.currentUserSubject.next(updatedUser);
      console.log('✅ Profil mis à jour localement');
      return true;
    } catch (error) {
      console.error('❌ Erreur de mise à jour du profil:', error);
      return false;
    }
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  }

  isTokenExpired(): boolean {
    const token = this.getAccessToken();
    if (!token) return true;
    try {
      const jwtToken = JSON.parse(atob(token.split('.')[1]));
      const expires = new Date(jwtToken.exp * 1000);
      return new Date() >= expires;
    } catch {
      return true;
    }
  }

  private startRefreshTokenTimer(): void {
    const accessToken = this.getAccessToken();
    if (!accessToken) return;

    try {
      const jwtToken = JSON.parse(atob(accessToken.split('.')[1]));
      const expires = new Date(jwtToken.exp * 1000);
      const timeout = expires.getTime() - Date.now() - 60000;

      if (timeout > 0) {
        this.refreshTokenTimeout = setTimeout(() => {
          this.refreshToken().subscribe({
            next: () => console.log('✅ Token rafraîchi automatiquement'),
            error: (err) => console.error('❌ Erreur rafraîchissement auto:', err)
          });
        }, timeout);
      } else {
        this.refreshToken().subscribe();
      }
    } catch (error) {
      console.error('❌ Erreur décodage token:', error);
    }
  }

  private stopRefreshTokenTimer(): void {
    if (this.refreshTokenTimeout) {
      clearTimeout(this.refreshTokenTimeout);
    }
  }
}
