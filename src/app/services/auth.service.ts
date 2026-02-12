import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private usersKey = 'fashionstore_users';
  private currentUserKey = 'fashionstore_current_user';

  constructor(private router: Router) {
    this.loadCurrentUser();
  }

  private loadCurrentUser(): void {
    const userJson = localStorage.getItem(this.currentUserKey);
    if (userJson) {
      const user = JSON.parse(userJson);
      this.currentUserSubject.next(user);
    }
  }

  register(userData: Partial<User>): boolean {
    const users = this.getUsers();

    // Vérifier si l'email existe déjà
    if (users.find(u => u.email === userData.email)) {
      return false;
    }

    const newUser: User = {
      id: users.length + 1,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      email: userData.email || '',
      phone: userData.phone || '',
      password: userData.password || '',
      role: 'client',
      createdAt: new Date(),
      ordersCount: 0,
      totalSpent: 0,
      isActive: true,
      avatar: this.getRandomAvatar()
    };

    users.push(newUser);
    localStorage.setItem(this.usersKey, JSON.stringify(users));
    this.login(newUser.email, userData.password!);
    return true;
  }

  login(email: string, password: string): boolean {
    const users = this.getUsers();
    const user = users.find(u => u.email === email && u.password === password && u.isActive);

    if (user) {
      localStorage.setItem(this.currentUserKey, JSON.stringify(user));
      this.currentUserSubject.next(user);
      return true;
    }

    return false;
  }

  logout(): void {
    localStorage.removeItem(this.currentUserKey);
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  isAdmin(): boolean {
    return this.currentUserSubject.value?.role === 'admin';
  }

  updateProfile(userData: Partial<User>): boolean {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return false;

    const users = this.getUsers();
    const index = users.findIndex(u => u.id === currentUser.id);

    if (index !== -1) {
      users[index] = { ...users[index], ...userData };
      localStorage.setItem(this.usersKey, JSON.stringify(users));
      localStorage.setItem(this.currentUserKey, JSON.stringify(users[index]));
      this.currentUserSubject.next(users[index]);
      return true;
    }

    return false;
  }

  private getUsers(): User[] {
    const usersJson = localStorage.getItem(this.usersKey);
    if (!usersJson) {
      // Créer un admin par défaut
      const defaultUsers: User[] = [
        {
          id: 1,
          firstName: 'Admin',
          lastName: 'System',
          email: 'admin@fashionstore.com',
          phone: '1234567890',
          password: 'admin123',
          role: 'admin',
          createdAt: new Date(),
          ordersCount: 0,
          totalSpent: 0,
          isActive: true,
          avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        }
      ];
      localStorage.setItem(this.usersKey, JSON.stringify(defaultUsers));
      return defaultUsers;
    }

    return JSON.parse(usersJson);
  }

  private getRandomAvatar(): string {
    const avatars = [
      'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=100&h=100&fit=crop&crop=face'
    ];
    return avatars[Math.floor(Math.random() * avatars.length)];
  }
}
