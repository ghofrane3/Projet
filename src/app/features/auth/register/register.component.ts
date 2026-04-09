import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = false;
  error = '';
  success = false;
  showPassword = false;
  showConfirmPassword = false;
  passwordTouched = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  // ── Indicateur de force du mot de passe ──────────────────
  get passwordStrength(): { score: number; label: string; color: string } {
    const p = this.password;
    if (!p) return { score: 0, label: '', color: '' };

    let score = 0;
    if (p.length >= 8)           score++;
    if (p.length >= 12)          score++;
    if (/[A-Z]/.test(p))         score++;
    if (/[0-9]/.test(p))         score++;
    if (/[^A-Za-z0-9]/.test(p))  score++;

    if (score <= 1) return { score: 1, label: 'Très faible', color: '#ef4444' };
    if (score === 2) return { score: 2, label: 'Faible',     color: '#f97316' };
    if (score === 3) return { score: 3, label: 'Moyen',      color: '#eab308' };
    if (score === 4) return { score: 4, label: 'Fort',       color: '#22c55e' };
    return             { score: 5, label: 'Très fort',   color: '#16a34a' };
  }

  // Critères individuels (pour affichage checklist)
  get criteria() {
    const p = this.password;
    return {
      length:    p.length >= 8,
      uppercase: /[A-Z]/.test(p),
      number:    /[0-9]/.test(p),
      special:   /[^A-Za-z0-9]/.test(p)
    };
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

  get passwordsMatch(): boolean {
    return this.password === this.confirmPassword;
  }
  // ─────────────────────────────────────────────────────────

  onSubmit(): void {
    this.error = '';

    // Validation champs requis
    if (!this.firstName || !this.lastName || !this.email || !this.password || !this.confirmPassword) {
      this.error = 'Veuillez remplir tous les champs';
      return;
    }

    // Validation mot de passe fort
    if (!this.isPasswordValid) {
      this.error = 'Le mot de passe ne respecte pas les critères de sécurité';
      this.passwordTouched = true;
      return;
    }

    // Validation confirmation
    if (!this.passwordsMatch) {
      this.error = 'Les mots de passe ne correspondent pas';
      return;
    }

    this.loading = true;

    const name = `${this.firstName} ${this.lastName}`;

    this.authService.register({ name, email: this.email, password: this.password })
      .subscribe({
        next: (response) => {
          console.log('✅ Inscription réussie:', response);
          this.success = true;
          this.loading = false;

          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 2000);
        },
        error: (error) => {
          console.error('❌ Erreur inscription:', error);

          if (error.status === 400) {
            this.error = 'Cet email est déjà utilisé';
          } else {
            this.error = error.error?.message || 'Erreur lors de l\'inscription';
          }

          this.loading = false;
        }
      });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onPasswordInput(): void {
    this.passwordTouched = true;
  }
}
