import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: '../login/login.component.html',
  styleUrls: ['../login/login.component.scss']
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  error = '';
  showPassword = false;

  // Informations de démo
  demoInfo = {
    client: { email: 'sophie@email.com', password: '123456' },
    admin: { email: 'admin@maisonelite.com', password: 'admin123' }
  };

  // ── Indicateur de force du mot de passe ──────────────────
  get passwordStrength(): { score: number; label: string; color: string } {
    const p = this.password;
    if (!p) return { score: 0, label: '', color: '' };

    let score = 0;
    if (p.length >= 8)  score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;

    if (score <= 1) return { score: 1, label: 'Très faible', color: '#ef4444' };
    if (score === 2) return { score: 2, label: 'Faible',     color: '#f97316' };
    if (score === 3) return { score: 3, label: 'Moyen',      color: '#eab308' };
    if (score === 4) return { score: 4, label: 'Fort',       color: '#22c55e' };
    return             { score: 5, label: 'Très fort',   color: '#16a34a' };
  }

  get passwordErrors(): string[] {
    const errors: string[] = [];
    const p = this.password;
    if (!p) return errors;
    if (p.length < 8)            errors.push('Au moins 8 caractères');
    if (!/[A-Z]/.test(p))        errors.push('Au moins une majuscule');
    if (!/[0-9]/.test(p))        errors.push('Au moins un chiffre');
    if (!/[^A-Za-z0-9]/.test(p)) errors.push('Au moins un caractère spécial (!@#$…)');
    return errors;
  }

  get isPasswordValid(): boolean {
    return this.passwordErrors.length === 0;
  }
  // ─────────────────────────────────────────────────────────

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/account']);
    }
  }

  onSubmit(): void {
    if (!this.email || !this.password) {
      this.error = 'Veuillez remplir tous les champs';
      return;
    }

    this.loading = true;
    this.error = '';

    this.authService.login({
      email: this.email,
      password: this.password
    }).subscribe({
      next: (response) => {
        console.log('✅ Connexion réussie:', response.user);

        if (this.authService.isAdmin()) {
          this.router.navigate(['/admin/dashboard']);
        } else {
          this.router.navigate(['/account']);
        }

        this.loading = false;
      },
      error: (error) => {
        console.error('❌ Erreur connexion:', error);

        if (error.status === 403) {
          this.error = 'Email non vérifié. Veuillez vérifier votre boîte mail.';
        } else if (error.status === 401) {
          this.error = 'Email ou mot de passe incorrect';
        } else if (error.status === 0) {
          this.error = 'Impossible de se connecter au serveur. Vérifiez que le backend est démarré.';
        } else {
          this.error = error.error?.message || 'Erreur lors de la connexion';
        }

        this.loading = false;
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  useDemoAccount(type: 'client' | 'admin'): void {
    const demo = this.demoInfo[type];
    this.email = demo.email;
    this.password = demo.password;
  }
}
