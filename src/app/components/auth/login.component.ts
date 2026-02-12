import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  isLoginMode = true;
  formData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  };
  errorMessage = '';
  isLoading = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.formData = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: ''
    };
  }

  onSubmit(): void {
    this.errorMessage = '';

    if (this.isLoginMode) {
      this.login();
    } else {
      this.register();
    }
  }

  private login(): void {
    if (!this.formData.email || !this.formData.password) {
      this.errorMessage = 'Veuillez remplir tous les champs';
      return;
    }

    this.isLoading = true;

    // Simuler un délai de traitement
    setTimeout(() => {
      const success = this.authService.login(this.formData.email, this.formData.password);

      if (success) {
        this.router.navigate(['/']);
      } else {
        this.errorMessage = 'Email ou mot de passe incorrect';
      }

      this.isLoading = false;
    }, 1000);
  }

  private register(): void {
    // Validation
    if (!this.formData.firstName || !this.formData.lastName ||
        !this.formData.email || !this.formData.phone ||
        !this.formData.password) {
      this.errorMessage = 'Veuillez remplir tous les champs obligatoires';
      return;
    }

    if (this.formData.password !== this.formData.confirmPassword) {
      this.errorMessage = 'Les mots de passe ne correspondent pas';
      return;
    }

    if (this.formData.password.length < 6) {
      this.errorMessage = 'Le mot de passe doit contenir au moins 6 caractères';
      return;
    }

    this.isLoading = true;

    // Simuler un délai de traitement
    setTimeout(() => {
      const success = this.authService.register({
        firstName: this.formData.firstName,
        lastName: this.formData.lastName,
        email: this.formData.email,
        phone: this.formData.phone,
        password: this.formData.password
      });

      if (success) {
        this.router.navigate(['/']);
      } else {
        this.errorMessage = 'Un compte existe déjà avec cet email';
      }

      this.isLoading = false;
    }, 1500);
  }

  loginWithDemo(): void {
    this.formData.email = 'admin@fashionstore.com';
    this.formData.password = 'admin123';
    this.login();
  }
}
