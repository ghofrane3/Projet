import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('🔐 Admin Guard - Vérification...');
  console.log('📍 Route demandée:', state.url);

  // Vérifier l'authentification
  const isAuthenticated = authService.isAuthenticated();
  console.log('👤 Authentifié:', isAuthenticated);

  if (!isAuthenticated) {
    console.log('❌ Non authentifié, redirection vers /login');
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  // Récupérer l'utilisateur
  const user = authService.getCurrentUser();
  console.log('👤 Utilisateur complet:', user);
  console.log('🔑 Rôle de l\'utilisateur:', user?.role);

  // Vérifier le rôle admin
  const isAdmin = authService.isAdmin();
  console.log('👨‍💼 Est Admin:', isAdmin);

  if (!isAdmin) {
    console.log('❌ Pas admin, redirection vers /');
    console.log('💡 Pour être admin, le rôle doit être "admin" (actuellement:', user?.role + ')');
    router.navigate(['/']);
    return false;
  }

  console.log('✅ Accès admin autorisé');
  return true;
};
