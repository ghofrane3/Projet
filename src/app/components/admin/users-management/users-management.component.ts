import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  isVerified: boolean;
  createdAt: string;
  lastLogin?: string;
}

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users-management.component.html',
  styleUrls: ['./users-management.component.scss']
})
export class UsersManagementComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  loading = true;
  searchTerm = '';
  filterStatus: 'all' | 'verified' | 'unverified' = 'all';
  filterRole: 'all' | 'customer' | 'admin' = 'all';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  // ═══════════════════════════════════════════════════════════
  // CHARGER LES UTILISATEURS
  // ═══════════════════════════════════════════════════════════
  loadUsers(): void {
    this.loading = true;
    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

    this.http.get<any>('http://localhost:5000/api/admin/users', { headers })
      .subscribe({
        next: (response) => {
          this.users = response.users;
          this.applyFilters();
          this.loading = false;
          console.log('✅ Utilisateurs chargés:', this.users.length);
        },
        error: (error) => {
          console.error('❌ Erreur chargement:', error);
          this.loading = false;
          alert('Erreur lors du chargement des utilisateurs');
        }
      });
  }

  // ═══════════════════════════════════════════════════════════
  // VÉRIFIER UN UTILISATEUR
  // ═══════════════════════════════════════════════════════════
  verifyUser(user: User): void {
    if (!confirm(`Vérifier manuellement l'email de ${user.name} ?`)) {
      return;
    }

    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

    this.http.patch(`http://localhost:5000/api/admin/users/${user._id}/verify`, {}, { headers })
      .subscribe({
        next: (response: any) => {
          console.log('✅ Utilisateur vérifié:', response);
          alert(`✅ ${user.name} a été vérifié avec succès !`);
          this.loadUsers(); // Recharger la liste
        },
        error: (error) => {
          console.error('❌ Erreur vérification:', error);
          alert(error.error?.message || 'Erreur lors de la vérification');
        }
      });
  }

  // ═══════════════════════════════════════════════════════════
  // CHANGER LE RÔLE
  // ═══════════════════════════════════════════════════════════
  changeRole(user: User, newRole: 'customer' | 'admin'): void {
    if (!confirm(`Changer le rôle de ${user.name} en ${newRole} ?`)) {
      return;
    }

    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

    this.http.patch(
      `http://localhost:5000/api/admin/users/${user._id}/role`,
      { role: newRole },
      { headers }
    ).subscribe({
      next: () => {
        alert(`✅ Rôle mis à jour !`);
        this.loadUsers();
      },
      error: (error) => {
        alert('Erreur lors du changement de rôle');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SUPPRIMER UN UTILISATEUR
  // ═══════════════════════════════════════════════════════════
  deleteUser(user: User): void {
    if (!confirm(`⚠️ Supprimer définitivement ${user.name} ?`)) {
      return;
    }

    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

    this.http.delete(`http://localhost:5000/api/admin/users/${user._id}`, { headers })
      .subscribe({
        next: () => {
          alert('✅ Utilisateur supprimé');
          this.loadUsers();
        },
        error: (error) => {
          alert('Erreur lors de la suppression');
        }
      });
  }

  // ═══════════════════════════════════════════════════════════
  // FILTRES
  // ═══════════════════════════════════════════════════════════
  applyFilters(): void {
    let result = [...this.users];

    // Filtre par statut
    if (this.filterStatus === 'verified') {
      result = result.filter(u => u.isVerified);
    } else if (this.filterStatus === 'unverified') {
      result = result.filter(u => !u.isVerified);
    }

    // Filtre par rôle
    if (this.filterRole !== 'all') {
      result = result.filter(u => u.role === this.filterRole);
    }

    // Recherche
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)
      );
    }

    this.filteredUsers = result;
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  // ═══════════════════════════════════════════════════════════
  // STATISTIQUES
  // ═══════════════════════════════════════════════════════════
  get totalUsers(): number {
    return this.users.length;
  }

  get verifiedCount(): number {
    return this.users.filter(u => u.isVerified).length;
  }

  get unverifiedCount(): number {
    return this.users.filter(u => !u.isVerified).length;
  }

  get adminCount(): number {
    return this.users.filter(u => u.role === 'admin').length;
  }
}
