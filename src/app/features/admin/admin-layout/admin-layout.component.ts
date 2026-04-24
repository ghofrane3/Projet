// src/app/features/admin/admin-layout/admin-layout.component.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-admin-layout',
  template: `
    <div class="admin-container">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">FashionStore</div>
          <div class="subtitle">ADMINISTRATION</div>
        </div>

        <nav class="nav">
          <div class="nav-section">
            <div class="section-title">PRINCIPAL</div>
            <a routerLink="/admin/dashboard" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">📊</span> Tableau de bord
            </a>
            <a routerLink="/admin/products" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">👗</span> Produits
            </a>
            <a routerLink="/admin/orders" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">🛍️</span> Commandes
            </a>
            <!-- ✅ LIVRAISONS -->
            <a routerLink="/admin/delivery" routerLinkActive="active" class="nav-link nav-link--delivery">
              <span class="nav-icon">🚚</span> Livraisons
            </a>
            <a routerLink="/admin/users" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">👥</span> Clients
            </a>
          </div>

          <div class="nav-section">
            <div class="section-title">ANALYSE & SYSTÈME</div>
            <a routerLink="/admin/cache" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">⚡</span> Gestion Cache
            </a>
          </div>

          <div class="nav-section">
            <div class="section-title">NAVIGATION</div>
            <a routerLink="/" class="nav-link">
              <span class="nav-icon">🏠</span> Retour boutique
            </a>
            <button (click)="logout()" class="nav-link nav-link--btn">
              <span class="nav-icon">🚪</span> Déconnexion
            </button>
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

    /* ── Sidebar ──────────────────────────────────────── */
    .sidebar {
      width: 230px;
      background: #1a1a1a;
      color: white;
      position: fixed;
      height: 100vh;
      overflow-y: auto;
      z-index: 100;
    }

    .sidebar-header {
      padding: 2rem 1.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .logo    { font-size: 1.1rem; letter-spacing: .15em; margin-bottom: .25rem; font-weight: 700; }
    .subtitle{ font-size: .6rem; letter-spacing: .15em; color: rgba(255,255,255,.45); }

    /* ── Nav ──────────────────────────────────────────── */
    .nav         { padding: 1.5rem 0; }
    .nav-section { margin-bottom: 2rem; }
    .section-title {
      font-size: .6rem;
      font-weight: 700;
      letter-spacing: .15em;
      color: rgba(255,255,255,.35);
      padding: 0 1.5rem;
      margin-bottom: .75rem;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: .6rem;
      padding: .6rem 1.5rem;
      color: rgba(255,255,255,.7);
      font-size: .85rem;
      transition: all .2s;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      cursor: pointer;
      text-decoration: none;
      border-left: 2px solid transparent;
    }
    .nav-link:hover { color: #fff; background: rgba(255,255,255,.06); }
    .nav-link.active {
      color: #d4a574;
      background: rgba(212,165,116,.1);
      border-left: 2px solid #d4a574;
    }

    /* ✅ Livraisons — accent vert pour se démarquer */
    .nav-link--delivery { }
    .nav-link--delivery.active {
      color: #4ade80;
      background: rgba(74,222,128,.1);
      border-left: 2px solid #4ade80;
    }
    .nav-link--delivery:hover { color: #4ade80; }

    .nav-link--btn { font-family: inherit; }

    .nav-icon { font-size: 1rem; width: 20px; text-align: center; flex-shrink: 0; }

    /* ── Content ──────────────────────────────────────── */
    .content {
      margin-left: 230px;
      flex: 1;
      background: #f5f3ef;
      min-height: 100vh;
    }
  `]
})
export class AdminLayoutComponent {
  constructor(private authService: AuthService, private router: Router) {}

  logout(): void {
    this.authService.logout().subscribe({
      next:  () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }
}
