import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['../login/login.component.scss']
})
export class ResetPasswordComponent implements OnInit {
  password        = '';
  confirmPassword = '';
  showPassword    = false;
  loading         = false;
  error           = '';
  success         = false;
  tokenInvalid    = false;
  private token   = '';

  constructor(
    private route:  ActivatedRoute,
    private router: Router,
    private http:   HttpClient
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.tokenInvalid = true;
    }
  }

  get passwordStrength(): { score: number; label: string; color: string } {
    const p = this.password;
    if (!p) return { score: 0, label: '', color: '' };
    let score = 0;
    if (p.length >= 8)          score++;
    if (p.length >= 12)         score++;
    if (/[A-Z]/.test(p))        score++;
    if (/[0-9]/.test(p))        score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { score: 1, label: 'Très faible', color: '#ef4444' };
    if (score === 2) return { score: 2, label: 'Faible',     color: '#f97316' };
    if (score === 3) return { score: 3, label: 'Moyen',      color: '#eab308' };
    if (score === 4) return { score: 4, label: 'Fort',       color: '#22c55e' };
    return             { score: 5, label: 'Très fort',   color: '#16a34a' };
  }

  onSubmit(): void {
    if (this.password !== this.confirmPassword) {
      this.error = 'Les mots de passe ne correspondent pas';
      return;
    }
    if (this.password.length < 6) {
      this.error = 'Le mot de passe doit faire au moins 6 caractères';
      return;
    }

    this.loading = true;
    this.error   = '';

    this.http.post(`${environment.apiUrl}/auth/reset-password`, {
      token:    this.token,
      password: this.password,
    }).subscribe({
      next: () => {
        this.success = true;
        this.loading = false;
      },
      error: (err) => {
        if (err.status === 400) {
          this.tokenInvalid = true;
        } else {
          this.error = err.error?.message || 'Erreur serveur, réessayez.';
        }
        this.loading = false;
      }
    });
  }
}
