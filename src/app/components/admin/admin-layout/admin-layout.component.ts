import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="admin-container">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">MAISON ÉLITE</div>
          <div class="subtitle">ADMINISTRATION</div>
        </div>

        <nav class="nav">
          <div class="nav-section">
            <div class="section-title">PRINCIPAL</div>
            <a routerLink="/admin/dashboard" routerLinkActive="active" class="nav-link">
              ◆ Tableau de bord
            </a>
            <a routerLink="/admin/products" routerLinkActive="active" class="nav-link">
              ☐ Produits
            </a>
            <a routerLink="/admin/orders" routerLinkActive="active" class="nav-link">
              ◆ Commandes
            </a>
            <a routerLink="/admin/users" routerLinkActive="active" class="nav-link">
              ◆ Clients
            </a>
          </div>

          <div class="nav-section">
            <div class="section-title">ANALYSE</div>
            <a class="nav-link">☐ Statistiques</a>
            <a class="nav-link">☐ Inventaire</a>
          </div>

          <div class="nav-section">
            <div class="section-title">PARAMÈTRES</div>
            <a routerLink="/" class="nav-link">→ Retour boutique</a>
            <button (click)="logout()" class="nav-link">◆ Déconnexion</button>
          </div>
        </nav>
      </aside>

      <main class="content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .admin-container { display: flex; min-height: 100vh; }
    .sidebar { width: 220px; background: #1a1a1a; color: white; position: fixed; height: 100vh; overflow-y: auto; }
    .sidebar-header { padding: 2rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .logo { font-size: 1.125rem; letter-spacing: 0.15em; margin-bottom: 0.25rem; }
    .subtitle { font-size: 0.625rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.6); }
    .nav { padding: 1.5rem 0; }
    .nav-section { margin-bottom: 2rem; }
    .section-title { font-size: 0.625rem; font-weight: 700; letter-spacing: 0.15em; color: rgba(255,255,255,0.4); padding: 0 1.5rem; margin-bottom: 0.75rem; }
    .nav-link { display: block; padding: 0.625rem 1.5rem; color: rgba(255,255,255,0.7); font-size: 0.875rem; transition: all 0.2s; border: none; background: none; width: 100%; text-align: left; cursor: pointer; text-decoration: none; }
    .nav-link:hover { color: white; background: rgba(255,255,255,0.05); }
    .nav-link.active { color: #d4a574; background: rgba(212,165,116,0.1); border-left: 2px solid #d4a574; }
    .content { margin-left: 220px; flex: 1; background: #f5f3ef; min-height: 100vh; }
  `]
})
export class AdminLayoutComponent {
  constructor(private authService: AuthService, private router: Router) {}

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }
}
