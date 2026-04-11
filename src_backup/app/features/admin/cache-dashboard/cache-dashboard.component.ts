import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewInit
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// ─── Interfaces existantes ────────────────────────────────
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

// ─── Nouvelles interfaces métriques ──────────────────────
interface CacheMetrics {
  totalHits: number;
  totalMisses: number;
  totalRequests: number;
  hitRate: number;
  l1Hits: number;
  l1Misses: number;
  l1HitRate: number;
  l1AvgResponseTime: number;
  l2Hits: number;
  l2Misses: number;
  l2HitRate: number;
  l2AvgResponseTime: number;
  l3Requests: number;
  l3AvgResponseTime: number;
}

interface MetricsSnapshot {
  timestamp: string;
  hitRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  l1Hits: number;
  l2Hits: number;
  l3Requests: number;
}

@Component({
  selector: 'app-cache-dashboard',
  templateUrl: './cache-dashboard.component.html',
  styleUrls: ['./cache-dashboard.component.scss']
})
export class CacheDashboardComponent implements OnInit, OnDestroy, AfterViewInit {

  private readonly API = 'http://localhost:5000/api/admin/cache';

  // ─── État existant ────────────────────────────────────
  stats: CacheStats | null = null;
  redisInfo: RedisInfo | null = null;
  selectedType = 'all';
  searchPattern = '*';
  loading = false;
  autoRefresh = true;
  refreshInterval: any;
  message = '';
  messageType: 'success' | 'error' | '' = '';

  // ─── État métriques ───────────────────────────────────
  metrics: CacheMetrics | null = null;
  metricsHistory: MetricsSnapshot[] = [];
  metricsLoading = false;
  lastRefresh: Date | null = null;

  // Chart.js
  @ViewChild('hitMissChart') hitMissChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('hitRateChart') hitRateChartRef!: ElementRef<HTMLCanvasElement>;
  private hitMissChart: Chart | null = null;
  private hitRateChart: Chart | null = null;

  private metricsSub: Subscription | null = null;

  constructor(private http: HttpClient) {}

  // Ajouter ces propriétés
// Ajouter ces propriétés dans la classe
searchCacheKeys:   any[]    = [];
searchKeysLoading  = false;
searchStats = {
  totalSearchKeys:      0,
  textSearchKeys:       0,
  categoryFilterKeys:   0,
  priceFilterKeys:      0,
  suggestionKeys:       0,
  popularKeys:          0,
};

// Charger les clés de recherche depuis Redis
loadSearchCacheKeys(): void {
  this.searchKeysLoading = true;

  // Récupérer TOUTES les clés puis filtrer côté client
  this.http.get<any>(`${this.API}/stats`, { withCredentials: true })
    .subscribe({
      next: (res) => {
        if (res.success && res.stats?.recentKeys) {
          // Filtrer les clés liées à la recherche
          this.searchCacheKeys = res.stats.recentKeys.filter((k: any) =>
            k.key.includes('search') ||
            k.key.startsWith('products:')
          );

          // Calculer les stats par type
          this.searchStats = {
            totalSearchKeys:    this.searchCacheKeys.length,
            textSearchKeys:     this.searchCacheKeys.filter(k =>
              k.key.includes('search:')).length,
            categoryFilterKeys: this.searchCacheKeys.filter(k =>
              k.key.includes('gender:') || k.key.includes('category:')).length,
            priceFilterKeys:    this.searchCacheKeys.filter(k =>
              k.key.includes('minPrice') || k.key.includes('maxPrice')).length,
            suggestionKeys:     this.searchCacheKeys.filter(k =>
              k.key.includes('search-suggestions')).length,
            popularKeys:        this.searchCacheKeys.filter(k =>
              k.key.includes('search-popular')).length,
          };
        }
        this.searchKeysLoading = false;
      },
      error: () => { this.searchKeysLoading = false; }
    });
}


clearSearchCache(): void {
  if (!confirm('Vider tout le cache de recherche ?')) return;

  this.http.delete(`${this.API}/pattern`, {
    body: { pattern: 'products:*' },
    withCredentials: true
  }).subscribe({
    next: (res: any) => {
      // Vider aussi les suggestions
      this.http.delete(`${this.API}/pattern`, {
        body: { pattern: '*search*' },
        withCredentials: true
      }).subscribe(() => {
        this.showMessage(
          `Cache recherche vidé (${res.deleted} clés)`, 'success'
        );
        this.loadSearchCacheKeys();
        this.loadStats();
      });
    },
    error: () => this.showMessage('Erreur vidage cache recherche', 'error')
  });
}

getSearchKeyType(key: string): string {
  if (key.includes('search-suggestions')) return 'suggestions';
  if (key.includes('search-popular'))     return 'popular';
  if (key.includes('search:'))            return 'text';
  if (key.includes('gender:') ||
      key.includes('category:'))          return 'category';
  if (key.includes('minPrice') ||
      key.includes('maxPrice'))           return 'price';
  return 'general';
}

getSearchKeyTypeLabel(key: string): string {
  const labels: {[k: string]: string} = {
    suggestions: '💡 Suggestion',
    popular:     '🔥 Populaire',
    text:        '🔤 Recherche',
    category:    '📂 Catégorie',
    price:       '💰 Prix',
    general:     '📋 Général',
  };
  return labels[this.getSearchKeyType(key)] || '❓';
}

getSearchKeyTTLClass(ttl: number | string): string {
  if (ttl === 'permanent') return '';
  const t = Number(ttl);
  if (t < 60)  return 'ttl-critical';
  if (t < 300) return 'ttl-warning';
  return 'ttl-ok';
}
getTTLPercent(ttl: number | string): number {
  if (ttl === 'permanent') return 100;
  const t = Number(ttl);
  // Max TTL = 3600s (1h), calculer le pourcentage restant
  const maxTTL = 3600;
  return Math.min(100, Math.round((t / maxTTL) * 100));
}
  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.loadStats();
    this.loadRedisInfo();
    this.loadMetrics();
    this.loadHistory();
    this.loadSearchCacheKeys();

    if (this.autoRefresh) {
      this.startAutoRefresh();
    }

    // Auto-refresh métriques toutes les 5s
   this.metricsSub = interval(5000).pipe(
    switchMap(() => this.http.get<any>(`${this.API}/metrics`))
  ).subscribe({
    next: (res) => {
      if (res.success) {
        this.metrics     = res.data;
        this.lastRefresh = new Date();
        this.updateHitMissChart();
        // Rafraîchir aussi les clés search
        this.loadSearchCacheKeys();
      }
    },
    error: (err) => console.error('❌ Metrics refresh error:', err)
  });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initCharts(), 400);
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.metricsSub?.unsubscribe();
    this.hitMissChart?.destroy();
    this.hitRateChart?.destroy();
  }

  // ════════════════════════════════════════════════════════
  // DONNÉES EXISTANTES
  // ════════════════════════════════════════════════════════

  loadStats(): void {
    this.loading = true;
    this.http.get<any>(`${this.API}/stats`).subscribe({
      next: (res) => {
        if (res.success) this.stats = res.stats;
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement stats:', err);
        this.loading = false;
      }
    });
  }

  loadRedisInfo(): void {
    this.http.get<any>(`${this.API}/info`).subscribe({
      next: (res) => {
        if (res.success) this.redisInfo = res.redis;
      },
      error: (err) => console.error('Erreur Redis info:', err)
    });
  }

  deleteKey(key: string): void {
    if (!confirm(`Supprimer la clé "${key}" ?`)) return;
    this.http.delete(`${this.API}/key/${encodeURIComponent(key)}`).subscribe({
      next: () => { this.showMessage('Clé supprimée avec succès', 'success'); this.loadStats(); },
      error: () => this.showMessage('Erreur suppression clé', 'error')
    });
  }

  deleteByPattern(): void {
    if (!this.searchPattern || this.searchPattern === '*') {
      alert('Spécifiez un pattern (ex: products:*)');
      return;
    }
    if (!confirm(`Supprimer toutes les clés correspondant à "${this.searchPattern}" ?`)) return;
    this.http.delete(`${this.API}/pattern`, { body: { pattern: this.searchPattern } }).subscribe({
      next: (res: any) => { this.showMessage(`${res.deleted} clés supprimées`, 'success'); this.loadStats(); },
      error: () => this.showMessage('Erreur suppression pattern', 'error')
    });
  }

  clearAll(): void {
    if (!confirm('⚠️ ATTENTION : Vider TOUT le cache Redis ?')) return;
    if (!confirm('Êtes-vous VRAIMENT sûr ? Cette action est irréversible.')) return;
    this.http.delete(`${this.API}/all`).subscribe({
      next: () => { this.showMessage('Cache entièrement vidé', 'success'); this.loadStats(); },
      error: () => this.showMessage('Erreur vidage cache', 'error')
    });
  }

  warmupCache(): void {
    this.loading = true;
    this.http.post(`${this.API}/warmup`, { types: ['products', 'categories'] }).subscribe({
      next: () => { this.showMessage('Cache préchauffé avec succès', 'success'); this.loadStats(); this.loading = false; },
      error: () => { this.showMessage('Erreur warmup cache', 'error'); this.loading = false; }
    });
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    this.autoRefresh ? this.startAutoRefresh() : this.stopAutoRefresh();
  }

  startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => {
      this.loadStats();
      this.loadRedisInfo();
    }, 5000);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  getFilteredKeys(): CacheKey[] {
    if (!this.stats) return [];
    if (this.selectedType === 'all') return this.stats.recentKeys;
    return this.stats.recentKeys.filter(k => k.type === this.selectedType);
  }

  getTypes(): string[] {
    if (!this.stats) return [];
    return Object.keys(this.stats.keysByType);
  }

  showMessage(text: string, type: 'success' | 'error'): void {
    this.message = text;
    this.messageType = type;
    setTimeout(() => { this.message = ''; this.messageType = ''; }, 3000);
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

  // ════════════════════════════════════════════════════════
  // MÉTRIQUES
  // ════════════════════════════════════════════════════════

  loadMetrics(): void {
    this.metricsLoading = true;
    this.http.get<any>(`${this.API}/metrics`).subscribe({
      next: (res) => {
        if (res.success) {
          this.metrics = res.data;
          this.lastRefresh = new Date();
          this.updateHitMissChart();
        }
        this.metricsLoading = false;
      },
      error: (err) => { console.error('❌ Load metrics error:', err); this.metricsLoading = false; }
    });
  }

  loadHistory(): void {
    this.http.get<any>(`${this.API}/metrics/history`).subscribe({
      next: (res) => {
        if (res.success) {
          this.metricsHistory = res.data;
          this.updateHitRateChart();
        }
      },
      error: (err) => console.error('❌ Load history error:', err)
    });
  }

  resetMetrics(): void {
    if (!confirm('Réinitialiser toutes les métriques ?')) return;
    this.http.post(`${this.API}/metrics/reset`, {}).subscribe({
      next: () => { this.showMessage('Métriques réinitialisées', 'success'); this.loadMetrics(); this.loadHistory(); },
      error: () => this.showMessage('Erreur reset métriques', 'error')
    });
  }

  getHitRateClass(): string {
    const rate = this.metrics?.hitRate ?? 0;
    if (rate >= 80) return 'excellent';
    if (rate >= 60) return 'good';
    if (rate >= 40) return 'average';
    return 'poor';
  }

  formatTime(ms: number): string {
    return ms < 1 ? '< 1ms' : `${ms.toFixed(1)}ms`;
  }

  // ════════════════════════════════════════════════════════
  // CHART.JS
  // ════════════════════════════════════════════════════════

  private initCharts(): void {
    this.initHitMissChart();
    this.initHitRateChart();
  }

  private initHitMissChart(): void {
    if (!this.hitMissChartRef?.nativeElement) return;
    const ctx = this.hitMissChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    this.hitMissChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['L1 Hits', 'L2 Hits', 'Misses'],
        datasets: [{
          data: [
            this.metrics?.l1Hits ?? 0,
            this.metrics?.l2Hits ?? 0,
            this.metrics?.totalMisses ?? 0
          ],
          backgroundColor: ['#6366f1', '#3b82f6', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed}`
            }
          }
        }
      }
    });
  }

  private initHitRateChart(): void {
    if (!this.hitRateChartRef?.nativeElement) return;
    const ctx = this.hitRateChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = this.metricsHistory.map(s =>
      new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    );
    const data = this.metricsHistory.map(s => s.hitRate);

    this.hitRateChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Hit Rate (%)',
          data,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { callback: (v) => `${v}%`, font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.04)' }
          },
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 8, font: { size: 11 } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` Hit Rate: ${ctx.parsed.y}%` } }
        }
      }
    });
  }

  updateHitMissChart(): void {
    if (!this.hitMissChart || !this.metrics) return;
    this.hitMissChart.data.datasets[0].data = [
      this.metrics.l1Hits,
      this.metrics.l2Hits,
      this.metrics.totalMisses
    ];
    this.hitMissChart.update('none');
  }

  updateHitRateChart(): void {
    if (!this.hitRateChart) return;
    this.hitRateChart.data.labels = this.metricsHistory.map(s =>
      new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    );
    this.hitRateChart.data.datasets[0].data = this.metricsHistory.map(s => s.hitRate);
    this.hitRateChart.update();
  }
}
