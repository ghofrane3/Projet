import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface CacheStats {
  totalKeys: number;
  totalSizeKB: string;
  totalSizeMB: string;
  keysByType: { [key: string]: number };
  recentKeys: CacheKey[];
}

interface CacheKey {
  key: string;
  type: string;
  ttl: number | string;
  size: number;
  sizeKB: string;
}

interface RedisInfo {
  memory: string;
  totalKeys: string;
  uptime: number;
  uptimeFormatted: string;
}

@Component({
  selector: 'app-cache-dashboard',
  templateUrl: './cache-dashboard.component.html',
  styleUrls: ['./cache-dashboard.component.scss']
})
export class CacheDashboardComponent implements OnInit, OnDestroy {
  stats: CacheStats | null = null;
  redisInfo: RedisInfo | null = null;

  // Filtres
  selectedType = 'all';
  searchPattern = '*';

  // États
  loading = false;
  autoRefresh = true;
  refreshInterval: any;

  // Messages
  message = '';
  messageType: 'success' | 'error' | '' = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadRedisInfo();

    if (this.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  // ════════════════════════════════════════════════════════════
  // CHARGEMENT DONNÉES
  // ════════════════════════════════════════════════════════════

  loadStats(): void {
    this.loading = true;

    this.http.get<any>('http://localhost:5000/api/admin/cache/stats')
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.stats = response.stats;
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Erreur chargement stats:', error);
          this.loading = false;
        }
      });
  }

  loadRedisInfo(): void {
    this.http.get<any>('http://localhost:5000/api/admin/cache/info')
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.redisInfo = response.redis;
          }
        },
        error: (error) => {
          console.error('Erreur chargement Redis info:', error);
        }
      });
  }

  // ════════════════════════════════════════════════════════════
  // ACTIONS CACHE
  // ════════════════════════════════════════════════════════════

  deleteKey(key: string): void {
    if (!confirm(`Supprimer la clé "${key}" ?`)) return;

    this.http.delete(`http://localhost:5000/api/admin/cache/key/${encodeURIComponent(key)}`)
      .subscribe({
        next: (response: any) => {
          this.showMessage('Clé supprimée avec succès', 'success');
          this.loadStats();
        },
        error: (error) => {
          this.showMessage('Erreur suppression clé', 'error');
        }
      });
  }

  deleteByPattern(): void {
    if (!this.searchPattern || this.searchPattern === '*') {
      alert('Spécifiez un pattern (ex: products:*)');
      return;
    }

    if (!confirm(`Supprimer toutes les clés correspondant à "${this.searchPattern}" ?`)) return;

    this.http.delete('http://localhost:5000/api/admin/cache/pattern', {
      body: { pattern: this.searchPattern }
    }).subscribe({
      next: (response: any) => {
        this.showMessage(`${response.deleted} clés supprimées`, 'success');
        this.loadStats();
      },
      error: (error) => {
        this.showMessage('Erreur suppression pattern', 'error');
      }
    });
  }

  clearAll(): void {
    if (!confirm('⚠️ ATTENTION : Vider TOUT le cache Redis ?')) return;
    if (!confirm('Êtes-vous VRAIMENT sûr ? Cette action est irréversible.')) return;

    this.http.delete('http://localhost:5000/api/admin/cache/all')
      .subscribe({
        next: (response: any) => {
          this.showMessage('Cache entièrement vidé', 'success');
          this.loadStats();
        },
        error: (error) => {
          this.showMessage('Erreur vidage cache', 'error');
        }
      });
  }

  warmupCache(): void {
    this.loading = true;

    this.http.post('http://localhost:5000/api/admin/cache/warmup', {
      types: ['products', 'categories']
    }).subscribe({
      next: (response: any) => {
        this.showMessage('Cache préchauffé avec succès', 'success');
        this.loadStats();
        this.loading = false;
      },
      error: (error) => {
        this.showMessage('Erreur warmup cache', 'error');
        this.loading = false;
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // AUTO-REFRESH
  // ════════════════════════════════════════════════════════════

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;

    if (this.autoRefresh) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => {
      this.loadStats();
      this.loadRedisInfo();
    }, 5000); // Toutes les 5 secondes
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  getFilteredKeys(): CacheKey[] {
    if (!this.stats) return [];

    if (this.selectedType === 'all') {
      return this.stats.recentKeys;
    }

    return this.stats.recentKeys.filter(k => k.type === this.selectedType);
  }

  getTypes(): string[] {
    if (!this.stats) return [];
    return Object.keys(this.stats.keysByType);
  }

  showMessage(text: string, type: 'success' | 'error'): void {
    this.message = text;
    this.messageType = type;

    setTimeout(() => {
      this.message = '';
      this.messageType = '';
    }, 3000);
  }

  formatTTL(ttl: number | string): string {
    if (ttl === 'permanent') return 'Permanent';
    if (typeof ttl === 'number') {
      if (ttl < 60) return `${ttl}s`;
      if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
      return `${Math.floor(ttl / 3600)}h`;
    }
    return String(ttl);
  }

  getTypeColor(type: string): string {
    const colors: { [key: string]: string } = {
      'products': '#3b82f6',
      'categories': '#10b981',
      'search': '#f59e0b',
      'user': '#8b5cf6',
      'cart': '#ec4899'
    };
    return colors[type] || '#6b7280';
  }
}
