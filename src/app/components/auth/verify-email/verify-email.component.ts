import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss']
})
export class VerifyEmailComponent implements OnInit {
  loading = true;
  success = false;
  error = '';
  userName = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    // Récupérer le token depuis l'URL
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.loading = false;
      this.error = 'Token de vérification manquant';
      return;
    }

    // Appeler l'API de vérification
    this.http.get(`http://localhost:5000/api/auth/verify-email/${token}`)
      .subscribe({
        next: (response: any) => {
          this.loading = false;
          if (response.success) {
            this.success = true;
            this.userName = response.user.name;
            // Redirection automatique après 3 secondes
            setTimeout(() => {
              this.router.navigate(['/login']);
            }, 3000);
          } else {
            this.error = response.message;
          }
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.message || 'Erreur lors de la vérification';
        }
      });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
