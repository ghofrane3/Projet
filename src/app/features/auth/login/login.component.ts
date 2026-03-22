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

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    // Rediriger si déjà connecté
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

    // ✅ Passer un OBJET avec email et password
    this.authService.login({
      email: this.email,
      password: this.password
    }).subscribe({
      next: (response) => {
        console.log('✅ Connexion réussie:', response.user);

        // Rediriger selon le rôle
        if (this.authService.isAdmin()) {
          this.router.navigate(['/admin/dashboard']);
        } else {
          this.router.navigate(['/account']);
        }

        this.loading = false;
      },
      error: (error) => {
        console.error('❌ Erreur connexion:', error);

        // Gestion des erreurs
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
