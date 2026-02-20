import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  credentials = {
    email: '',
    password: ''
  };

  errorMessage = '';
  loading = false;
  showPassword = false;
  rememberMe = false;

  // 🆕 NOUVEAU : Gestion de la vérification email
  needsVerification = false;
  emailToVerify = '';
  resendLoading = false;
  resendSuccess = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private http: HttpClient
  ) {}

  // ═══════════════════════════════════════════════════════════
  // CONNEXION
  // ═══════════════════════════════════════════════════════════
  onSubmit(): void {
    this.errorMessage = '';
    this.needsVerification = false;
    this.resendSuccess = false;

    if (!this.credentials.email || !this.credentials.password) {
      this.errorMessage = 'Tous les champs sont requis';
      return;
    }

    this.loading = true;

    console.log('🔐 Tentative de connexion...');

    this.authService.login(this.credentials).subscribe({
      next: (response) => {
        console.log('✅ Connexion réussie:', response);
        this.loading = false;

        // Redirection immédiate
        if (response.user.role === 'admin') {
          this.router.navigate(['/admin/dashboard']);
        } else {
          this.router.navigate(['/']);
        }
      },
      error: (error) => {
        console.error('❌ Erreur connexion:', error);
        this.loading = false;

        // 🆕 NOUVEAU : Vérifier si c'est un problème de vérification
        if (error.status === 403 && error.error?.needsVerification) {
          this.needsVerification = true;
          this.emailToVerify = error.error.email || this.credentials.email;
          this.errorMessage = error.error.message;
        } else {
          this.errorMessage = error.error?.message || 'Email ou mot de passe incorrect';
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 🆕 RENVOYER L'EMAIL DE VÉRIFICATION
  // ═══════════════════════════════════════════════════════════
  resendVerificationEmail(): void {
    this.resendLoading = true;
    this.resendSuccess = false;
    this.errorMessage = '';

    console.log('📧 Renvoi de l\'email de vérification à:', this.emailToVerify);

    this.http.post('http://localhost:5000/api/auth/resend-verification', {
      email: this.emailToVerify
    }).subscribe({
      next: (response: any) => {
        console.log('✅ Email renvoyé:', response);
        this.resendLoading = false;
        this.resendSuccess = true;
      },
      error: (error) => {
        console.error('❌ Erreur renvoi:', error);
        this.resendLoading = false;
        this.errorMessage = error.error?.message || 'Erreur lors du renvoi de l\'email';
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TOGGLE PASSWORD VISIBILITY
  // ═══════════════════════════════════════════════════════════
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}
