import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['../login/login.component.scss']   // réutilise le même style
})
export class ForgotPasswordComponent {
  email   = '';
  loading = false;
  error   = '';
  success = false;

  constructor(private http: HttpClient) {}

  onSubmit(): void {
    if (!this.email) return;

    this.loading = true;
    this.error   = '';

    this.http.post(`${environment.apiUrl}/auth/forgot-password`, { email: this.email })
      .subscribe({
        next: () => {
          this.success = true;
          this.loading = false;
        },
        error: (err) => {
          this.error   = err.error?.message || 'Erreur serveur, réessayez.';
          this.loading = false;
        }
      });
  }
}
