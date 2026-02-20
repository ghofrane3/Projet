import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent {

  // Form fields
  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  acceptTerms = false;
  showPassword = false;
  showConfirmPassword = false;

  // UI states
  error = '';
  successMessage = '';
  showEmailSent = false;
  loading = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  /**
   * Soumission formulaire inscription
   */
  onRegister(): void {

    this.error = '';
    this.successMessage = '';
    this.showEmailSent = false;

    // Validation champs
    if (!this.name || !this.email || !this.password || !this.confirmPassword) {
      this.error = 'Veuillez remplir tous les champs';
      return;
    }

    if (this.name.trim().length < 2) {
      this.error = 'Le nom doit contenir au moins 2 caractères';
      return;
    }

    if (!this.isValidEmail(this.email)) {
      this.error = 'Veuillez entrer un email valide';
      return;
    }

    if (this.password.length < 6) {
      this.error = 'Le mot de passe doit contenir au moins 6 caractères';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error = 'Les mots de passe ne correspondent pas';
      return;
    }

    if (!this.acceptTerms) {
      this.error = 'Veuillez accepter les conditions d\'utilisation';
      return;
    }

    this.loading = true;

    this.authService.register({
      name: this.name.trim(),
      email: this.email.trim(),
      password: this.password
    }).subscribe({

      next: (response) => {
        this.loading = false;

        console.log('✅ Inscription réussie:', response);

        // MESSAGE SUCCÈS
        this.successMessage = response.message ||
          'Inscription réussie ! Vérifiez votre email pour activer votre compte.';

        // AFFICHER MESSAGE EMAIL ENVOYÉ
        this.showEmailSent = true;

        // RESET FORMULAIRE (optionnel)
        this.name = '';
        this.email = '';
        this.password = '';
        this.confirmPassword = '';
        this.acceptTerms = false;

        // ❌ PAS DE REDIRECTION AUTOMATIQUE
        // utilisateur doit vérifier son email d'abord
      },

      error: (error) => {
        this.loading = false;
        console.error('❌ Erreur inscription:', error);

        if (error.status === 400 && error.error?.message?.includes('email')) {
          this.error = 'Cet email est déjà utilisé';
        } else if (error.status === 0) {
          this.error = 'Impossible de contacter le serveur';
        } else {
          this.error = error.error?.message || 'Erreur lors de l\'inscription';
        }
      }
    });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  getPasswordStrength(): { level: string; color: string; text: string } {
    if (!this.password) return { level: '', color: '', text: '' };

    const length = this.password.length;
    const hasUpperCase = /[A-Z]/.test(this.password);
    const hasLowerCase = /[a-z]/.test(this.password);
    const hasNumbers = /\d/.test(this.password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(this.password);

    let strength = 0;
    if (length >= 6) strength++;
    if (length >= 8) strength++;
    if (hasUpperCase && hasLowerCase) strength++;
    if (hasNumbers) strength++;
    if (hasSpecialChar) strength++;

    if (strength <= 2) return { level: 'weak', color: '#ef4444', text: 'Faible' };
    if (strength <= 3) return { level: 'medium', color: '#f59e0b', text: 'Moyen' };
    return { level: 'strong', color: '#10b981', text: 'Fort' };
  }

}
