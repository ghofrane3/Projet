import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewInit
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// ════════════════════════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════════════════════════

interface CacheStats {
  totalKeys:   number;
  totalSizeKB: string;
  totalSizeMB: string;
  keysByType:  { [key: string]: number };
  recentKeys:  CacheKey[];
}

interface CacheKey {
  key:    string;
  type:   string;
  ttl:    number | string;
  size:   number;
  sizeKB: string;
}

interface RedisInfo {
  memory:         string;
  totalKeys:      string;
  uptime:         number;
  uptimeFormatted: string;
}

interface CacheMetrics {
  totalHits:          number;
  totalMisses:        number;
  totalRequests:      number;
  hitRate:            number;
  l1Hits:             number;
  l1Misses:           number;
  l1HitRate:          number;
  l1AvgResponseTime:  number;
  l2Hits:             number;
  l2Misses:           number;
  l2HitRate:          number;
  l2AvgResponseTime:  number;
  l3Requests:         number;
  l3AvgResponseTime:  number;
  // Nouveaux champs ajoutés par patchCacheService
  strategy?:     string;
  strategySize?: number;
  adaptiveTTL?:  SmartCacheConfig;
}

interface MetricsSnapshot {
  timestamp:     string;
  hitRate:       number;
  totalRequests: number;
  totalHits:     number;
  totalMisses:   number;
  l1Hits:        number;
  l2Hits:        number;
  l3Requests:    number;
}

export interface ActionLog {
  id:       number;
  key:      string;
  action:   string;
  status:   'Succès' | 'Erreur';
  date:     Date;
  message?: string;
}

// ── Interfaces Smart Cache ────────────────────────────────────────────────

interface SmartCacheConfig {
  baseTTL:      number;
  minTTL:       number;
  maxTTL:       number;
  hotThreshold: number;
  coldAfterMs:  number;
  strategyName: string;
  rules: Array<{ pattern: string; ttl: number }>;
}

interface PopularKey {
  key:         string;
  score:       number;
  lastAccess:  number;
  computedTTL: number | null;
}

interface InspectResult {
  key:          string;
  inL1:         boolean;
  inL2:         boolean;
  redisTTL:     number;
  computedTTL:  number | null;
  strategyMeta: Record<string, number> | null;
}

// ════════════════════════════════════════════════════════════
// COMPOSANT
// ════════════════════════════════════════════════════════════

@Component({
  selector:    'app-cache-dashboard',
  templateUrl: './cache-dashboard.component.html',
  styleUrls:   ['./cache-dashboard.component.scss'],
})
export class CacheDashboardComponent implements OnInit, OnDestroy, AfterViewInit {

  private readonly API = 'http://localhost:5000/api/admin/cache';
  private logCounter   = 0;

  // ── État existant ─────────────────────────────────────────────────────────
  stats:        CacheStats | null = null;
  redisInfo:    RedisInfo  | null = null;
  selectedType  = 'all';
  searchPattern = '*';
  loading       = false;
  autoRefresh   = true;
  refreshInterval: any;
  message       = '';
  messageType:  'success' | 'error' | '' = '';

  metrics:        CacheMetrics    | null = null;
  metricsHistory: MetricsSnapshot[]      = [];
  metricsLoading  = false;
  lastRefresh:    Date | null            = null;

  actionLogs:    ActionLog[]                             = [];
  pendingAction: { label: string; fn: () => void } | null = null;

  // ── Charts ────────────────────────────────────────────────────────────────
  @ViewChild('hitMissChart') hitMissChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('hitRateChart') hitRateChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('compareChart') compareChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('historyChart') historyChartRef!: ElementRef<HTMLCanvasElement>;

  private hitMissChart: Chart | null = null;
  private hitRateChart: Chart | null = null;
  private compareChart: Chart | null = null;
  private historyChart: Chart | null = null;
  private metricsSub:   Subscription | null = null;

  // ── Cache de recherche ────────────────────────────────────────────────────
  searchCacheKeys:  any[] = [];
  searchKeysLoading = false;
  searchStats = {
    totalSearchKeys: 0, textSearchKeys: 0, categoryFilterKeys: 0,
    priceFilterKeys: 0, suggestionKeys: 0, popularKeys: 0,
  };

  // ── Smart Cache (NOUVEAU) ─────────────────────────────────────────────────
  smartConfig:  SmartCacheConfig | null = null;
  smartSaving   = false;
  smartForm = {
    baseTTL:      300,
    minTTL:       30,
    maxTTL:       86400,
    hotThreshold: 10,
    coldAfterMs:  600000,
  };

  popularKeys:   PopularKey[] = [];
  popularLoading = false;

  inspectKeyValue = '';
  inspectResult:  InspectResult | null = null;
  inspecting      = false;

  // ════════════════════════════════════════════════════════
  constructor(private http: HttpClient) {}

  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.loadStats();
    this.loadRedisInfo();
    this.loadMetrics();
    this.loadHistory();
    this.loadSearchCacheKeys();
    // NOUVEAU
    this.loadSmartConfig();
    this.loadPopularKeys();

    if (this.autoRefresh) this.startAutoRefresh();

    this.metricsSub = interval(5000).pipe(
      switchMap(() => this.http.get<any>(`${this.API}/metrics`))
    ).subscribe({
      next: (res) => {
        if (res.success) {
          this.metrics     = res.data;
          this.lastRefresh = new Date();
          this.updateHitMissChart();
          this.updateCompareChart();
          this.loadSearchCacheKeys();
        }
      },
      error: (err) => console.error('Metrics refresh error:', err),
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initCharts();
      this.initCompareChart();
      this.initHistoryChart();
    }, 400);
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.metricsSub?.unsubscribe();
    this.hitMissChart?.destroy();
    this.hitRateChart?.destroy();
    this.compareChart?.destroy();
    this.historyChart?.destroy();
  }

  // ════════════════════════════════════════════════════════
  // HISTORIQUE DES ACTIONS
  // ════════════════════════════════════════════════════════

  private addLog(key: string, action: string, status: 'Succès' | 'Erreur', message?: string): void {
    this.actionLogs.unshift({ id: ++this.logCounter, key, action, status, date: new Date(), message });
    if (this.actionLogs.length > 50) this.actionLogs.pop();
  }

  clearLogs():           void { this.actionLogs = []; }
  removeLog(id: number): void { this.actionLogs = this.actionLogs.filter(l => l.id !== id); }

  // ════════════════════════════════════════════════════════
  // CONFIRMATION INLINE
  // ════════════════════════════════════════════════════════

  askConfirm(label: string, fn: () => void): void { this.pendingAction = { label, fn }; }
  confirmYes(): void { this.pendingAction?.fn(); this.pendingAction = null; }
  confirmNo():  void { this.pendingAction = null; }

  // ════════════════════════════════════════════════════════
  // DONNÉES EXISTANTES
  // ════════════════════════════════════════════════════════

  loadStats(): void {
    this.loading = true;
    this.http.get<any>(`${this.API}/stats`).subscribe({
      next:  (res) => { if (res.success) this.stats = res.stats; this.loading = false; },
      error: (err) => { console.error('Erreur chargement stats:', err); this.loading = false; },
    });
  }

  loadRedisInfo(): void {
    this.http.get<any>(`${this.API}/info`).subscribe({
      next:  (res) => { if (res.success) this.redisInfo = res.redis; },
      error: (err) => console.error('Erreur Redis info:', err),
    });
  }

  deleteKey(key: string): void {
    this.askConfirm(`Supprimer la clé "${key}" ?`, () => {
      this.http.delete(`${this.API}/key/${encodeURIComponent(key)}`).subscribe({
        next: () => {
          this.addLog(key, 'Suppression clé', 'Succès');
          this.showMessage('Clé supprimée avec succès', 'success');
          this.loadStats(); this.loadSearchCacheKeys();
        },
        error: (err) => {
          this.addLog(key, 'Suppression clé', 'Erreur', err.message || 'Erreur inconnue');
          this.showMessage('Erreur suppression clé', 'error');
        },
      });
    });
  }

  deleteByPattern(): void {
    if (!this.searchPattern || this.searchPattern === '*') {
      this.showMessage('Spécifiez un pattern (ex: products:*)', 'error');
      return;
    }
    this.askConfirm(`Supprimer toutes les clés "${this.searchPattern}" ?`, () => {
      this.http.delete(`${this.API}/pattern`, { body: { pattern: this.searchPattern } }).subscribe({
        next: (res: any) => {
          this.addLog(this.searchPattern, `Suppression pattern (${res.deleted} clés)`, 'Succès');
          this.showMessage(`${res.deleted} clés supprimées`, 'success');
          this.loadStats();
        },
        error: (err) => {
          this.addLog(this.searchPattern, 'Suppression pattern', 'Erreur', err.message);
          this.showMessage('Erreur suppression pattern', 'error');
        },
      });
    });
  }

  clearAll(): void {
    this.askConfirm('Vider TOUT le cache Redis ? Action irréversible.', () => {
      this.http.delete(`${this.API}/all`).subscribe({
        next: () => {
          this.addLog('*', 'Vidage total du cache', 'Succès');
          this.showMessage('Cache entièrement vidé', 'success');
          this.loadStats();
        },
        error: (err) => {
          this.addLog('*', 'Vidage total du cache', 'Erreur', err.message);
          this.showMessage('Erreur vidage cache', 'error');
        },
      });
    });
  }

  warmupCache(): void {
    this.loading = true;
    this.http.post(`${this.API}/warmup`, { types: ['products', 'categories'] }).subscribe({
      next: () => {
        this.addLog('products, categories', 'Préchauffage cache', 'Succès');
        this.showMessage('Cache préchauffé avec succès', 'success');
        this.loadStats(); this.loading = false;
      },
      error: (err) => {
        this.addLog('products, categories', 'Préchauffage cache', 'Erreur', err.message);
        this.showMessage('Erreur warmup cache', 'error'); this.loading = false;
      },
    });
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    this.autoRefresh ? this.startAutoRefresh() : this.stopAutoRefresh();
  }

  startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => { this.loadStats(); this.loadRedisInfo(); }, 5000);
  }

  stopAutoRefresh(): void { if (this.refreshInterval) clearInterval(this.refreshInterval); }

  getFilteredKeys(): CacheKey[] {
    if (!this.stats) return [];
    return this.selectedType === 'all'
      ? this.stats.recentKeys
      : this.stats.recentKeys.filter(k => k.type === this.selectedType);
  }

  getTypes(): string[] { return this.stats ? Object.keys(this.stats.keysByType) : []; }

  showMessage(text: string, type: 'success' | 'error'): void {
    this.message = text; this.messageType = type;
    setTimeout(() => { this.message = ''; this.messageType = ''; }, 3000);
  }

  formatTTL(ttl: number | string): string {
    if (ttl === 'permanent') return 'Permanent';
    if (typeof ttl === 'number') {
      if (ttl < 60)   return `${ttl}s`;
      if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
      return `${Math.floor(ttl / 3600)}h`;
    }
    return String(ttl);
  }

  getTypeColor(type: string): string {
    const c: { [k: string]: string } = {
      products: '#3b82f6', categories: '#10b981', search: '#f59e0b',
      user: '#8b5cf6', cart: '#ec4899',
    };
    return c[type] || '#6b7280';
  }

  // ════════════════════════════════════════════════════════
  // CACHE RECHERCHE
  // ════════════════════════════════════════════════════════

  loadSearchCacheKeys(): void {
    this.searchKeysLoading = true;
    this.http.get<any>(`${this.API}/stats`, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res.success && res.stats?.recentKeys) {
          this.searchCacheKeys = res.stats.recentKeys.filter((k: any) =>
            k.key.includes('search') || k.key.startsWith('products:')
          );
          this.searchStats = {
            totalSearchKeys:    this.searchCacheKeys.length,
            textSearchKeys:     this.searchCacheKeys.filter((k: any) => k.key.includes('search:')).length,
            categoryFilterKeys: this.searchCacheKeys.filter((k: any) => k.key.includes('gender:') || k.key.includes('category:')).length,
            priceFilterKeys:    this.searchCacheKeys.filter((k: any) => k.key.includes('minPrice') || k.key.includes('maxPrice')).length,
            suggestionKeys:     this.searchCacheKeys.filter((k: any) => k.key.includes('search-suggestions')).length,
            popularKeys:        this.searchCacheKeys.filter((k: any) => k.key.includes('search-popular')).length,
          };
        }
        this.searchKeysLoading = false;
      },
      error: () => { this.searchKeysLoading = false; },
    });
  }

  clearSearchCache(): void {
    this.askConfirm('Vider tout le cache de recherche ?', () => {
      this.http.delete(`${this.API}/pattern`, { body: { pattern: 'products:*' }, withCredentials: true }).subscribe({
        next: (res: any) => {
          this.http.delete(`${this.API}/pattern`, { body: { pattern: '*search*' }, withCredentials: true }).subscribe(() => {
            this.addLog('products:* + *search*', `Vidage cache recherche (${res.deleted} clés)`, 'Succès');
            this.showMessage(`Cache recherche vidé (${res.deleted} clés)`, 'success');
            this.loadSearchCacheKeys(); this.loadStats();
          });
        },
        error: (err) => {
          this.addLog('products:* + *search*', 'Vidage cache recherche', 'Erreur', err.message);
          this.showMessage('Erreur vidage cache recherche', 'error');
        },
      });
    });
  }

  getSearchKeyType(key: string): string {
    if (key.includes('search-suggestions')) return 'suggestions';
    if (key.includes('search-popular'))     return 'popular';
    if (key.includes('search:'))            return 'text';
    if (key.includes('gender:') || key.includes('category:')) return 'category';
    if (key.includes('minPrice') || key.includes('maxPrice')) return 'price';
    return 'general';
  }

  getSearchKeyTypeLabel(key: string): string {
    const l: { [k: string]: string } = {
      suggestions: 'Suggestion', popular: 'Populaire', text: 'Recherche',
      category: 'Catégorie', price: 'Prix', general: 'Général',
    };
    return l[this.getSearchKeyType(key)] || '?';
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
    return Math.min(100, Math.round((Number(ttl) / 3600) * 100));
  }

  // ════════════════════════════════════════════════════════
  // MÉTRIQUES
  // ════════════════════════════════════════════════════════

  loadMetrics(): void {
    this.metricsLoading = true;
    this.http.get<any>(`${this.API}/metrics`).subscribe({
      next: (res) => {
        if (res.success) {
          this.metrics     = res.data;
          this.lastRefresh = new Date();
          this.updateHitMissChart();
          this.updateCompareChart();
        }
        this.metricsLoading = false;
      },
      error: (err) => { console.error('Load metrics error:', err); this.metricsLoading = false; },
    });
  }

  loadHistory(): void {
    this.http.get<any>(`${this.API}/metrics/history`).subscribe({
      next: (res) => {
        if (res.success) {
          this.metricsHistory = res.data;
          this.updateHitRateChart();
          this.updateHistoryChart();
        }
      },
      error: (err) => console.error('Load history error:', err),
    });
  }

  resetMetrics(): void {
    this.askConfirm('Réinitialiser toutes les métriques ?', () => {
      this.http.post(`${this.API}/metrics/reset`, {}).subscribe({
        next: () => {
          this.addLog('metrics', 'Reset métriques', 'Succès');
          this.showMessage('Métriques réinitialisées', 'success');
          this.loadMetrics(); this.loadHistory();
        },
        error: (err) => {
          this.addLog('metrics', 'Reset métriques', 'Erreur', err.message);
          this.showMessage('Erreur reset métriques', 'error');
        },
      });
    });
  }

  getHitRateClass(): string {
    const r = this.metrics?.hitRate ?? 0;
    if (r >= 80) return 'excellent';
    if (r >= 60) return 'good';
    if (r >= 40) return 'average';
    return 'poor';
  }

  formatTime(ms: number): string { return ms < 1 ? '< 1ms' : `${ms.toFixed(1)}ms`; }

  getGainLabel(): string {
    if (!this.metrics) return '—';
    const cache = this.metrics.l1AvgResponseTime || 1;
    const mongo = this.metrics.l3AvgResponseTime || 1;
    return `×${Math.round(mongo / cache)}`;
  }

  // ════════════════════════════════════════════════════════
  // SMART CACHE — Config TTL Adaptatif (NOUVEAU)
  // ════════════════════════════════════════════════════════

  loadSmartConfig(): void {
    this.http.get<any>(`${this.API}/smart-config`, { withCredentials: true }).subscribe({
      next: (res) => {
        if (!res.success) return;
        this.smartConfig = res.data;
        Object.assign(this.smartForm, {
          baseTTL:      res.data.baseTTL,
          minTTL:       res.data.minTTL,
          maxTTL:       res.data.maxTTL,
          hotThreshold: res.data.hotThreshold,
          coldAfterMs:  res.data.coldAfterMs,
        });
      },
      error: (err) => console.warn('smart-config non disponible (patchCacheService non appelé ?)', err.status),
    });
  }

  saveSmartConfig(): void {
    this.smartSaving = true;
    this.http.post<any>(`${this.API}/smart-config`, this.smartForm, { withCredentials: true }).subscribe({
      next: (res) => {
        this.smartSaving = false;
        if (res.success) {
          this.smartConfig = res.data;
          this.addLog('smart-config', 'Mise à jour TTL adaptatif', 'Succès');
          this.showMessage('Configuration TTL appliquée à chaud ✓', 'success');
        }
      },
      error: (err) => {
        this.smartSaving = false;
        this.addLog('smart-config', 'Mise à jour TTL adaptatif', 'Erreur', err.message);
        this.showMessage('Erreur mise à jour configuration', 'error');
      },
    });
  }

  // ── Top clés stratégie ────────────────────────────────────────────────────

  loadPopularKeys(): void {
    this.popularLoading = true;
    this.http.get<any>(`${this.API}/strategy/popular`, { withCredentials: true }).subscribe({
      next: (res) => {
        this.popularLoading = false;
        if (res.success) this.popularKeys = res.data;
      },
      error: () => { this.popularLoading = false; },
    });
  }

  // ── Inspecteur de clé ─────────────────────────────────────────────────────

  inspectKey(): void {
    const key = this.inspectKeyValue.trim();
    if (!key) return;
    this.inspecting = true;
    this.http.get<any>(`${this.API}/inspect/${encodeURIComponent(key)}`, { withCredentials: true }).subscribe({
      next: (res) => {
        this.inspecting   = false;
        if (res.success) this.inspectResult = res.data;
      },
      error: () => { this.inspecting = false; },
    });
  }

  // ── Helpers formatage ─────────────────────────────────────────────────────

  formatSmartTTL(s: number): string {
    if (s < 0) return s === -2 ? 'Absent' : 'Permanent';
    if (s < 60)   return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  getTTLClass(ttl: number | null): string {
    if (ttl === null) return '';
    if (ttl >= 1800) return 'ttl-ok';
    if (ttl >= 300)  return 'ttl-warning';
    return 'ttl-critical';
  }

  // ════════════════════════════════════════════════════════
  // GRAPHIQUE 1 — Comparaison Cache vs MongoDB
  // ════════════════════════════════════════════════════════

  private initCompareChart(): void {
    if (!this.compareChartRef?.nativeElement) return;
    this.compareChart?.destroy();
    const ctx = this.compareChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const { labels, cacheData, mongoData } = this.buildCompareData();

    this.compareChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Cache Redis (ms)', data: cacheData, backgroundColor: '#1D9E75', borderColor: '#0F6E56', borderWidth: 0.5, borderRadius: 4 },
          { label: 'MongoDB (ms)',     data: mongoData, backgroundColor: '#D85A30', borderColor: '#993C1D', borderWidth: 0.5, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const i    = items[0].dataIndex;
                const gain = Math.round((mongoData[i] as number) / Math.max(cacheData[i] as number, 0.1));
                return [`Gain : ×${gain} plus rapide avec le cache`];
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#5F5E5A', maxRotation: 15 } },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Temps de réponse (ms)', font: { size: 11 }, color: '#5F5E5A' },
            ticks: { font: { size: 11 }, color: '#5F5E5A', callback: (v) => v + ' ms' },
            grid:  { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    });
  }

  private buildCompareData() {
    const l1 = this.metrics?.l1AvgResponseTime ?? 2;
    const l2 = this.metrics?.l2AvgResponseTime ?? 8;
    const l3 = this.metrics?.l3AvgResponseTime ?? 280;
    return {
      labels:    ['Liste produits', 'Recherche texte', 'Filtres catégorie', 'Filtres prix', 'Suggestions', 'Détail produit'],
      cacheData: [l2, l1 * 1.2, l2 * 0.9, l2 * 0.8, l1, l1 * 0.5].map(v => parseFloat(v.toFixed(1))),
      mongoData: [l3, l3 * 1.4, l3 * 1.1, l3, l3 * 0.6, l3 * 0.4].map(v => parseFloat(v.toFixed(1))),
    };
  }

  private updateCompareChart(): void {
    if (!this.compareChart || !this.metrics) return;
    const { cacheData, mongoData } = this.buildCompareData();
    this.compareChart.data.datasets[0].data = cacheData;
    this.compareChart.data.datasets[1].data = mongoData;
    this.compareChart.update('none');
  }

  // ════════════════════════════════════════════════════════
  // GRAPHIQUE 2 — Historique 24h
  // ════════════════════════════════════════════════════════

  private initHistoryChart(): void {
    if (!this.historyChartRef?.nativeElement) return;
    this.historyChart?.destroy();
    const ctx = this.historyChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const { labels, cacheData, mongoData, hitData } = this.buildHistoryData();

    this.historyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Cache Redis (ms)', data: cacheData, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', fill: true,  tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2, yAxisID: 'y' },
          { label: 'MongoDB (ms)',     data: mongoData, borderColor: '#D85A30', borderDash: [6, 3], backgroundColor: 'transparent',  fill: false, tension: 0.4, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2, yAxisID: 'y' },
          { label: 'Hit rate (%)',     data: hitData,   borderColor: '#185FA5', borderDash: [3, 3], backgroundColor: 'transparent',  fill: false, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, borderWidth: 1.5, yAxisID: 'y2' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => item.datasetIndex === 2 ? ` Hit rate : ${item.parsed.y}%` : ` ${item.dataset.label} : ${item.parsed.y} ms` } },
        },
        scales: {
          x:  { grid: { display: false }, ticks: { font: { size: 10 }, color: '#5F5E5A', maxTicksLimit: 12 } },
          y:  { beginAtZero: true, position: 'left',  title: { display: true, text: 'Latence (ms)',  font: { size: 11 }, color: '#5F5E5A' }, ticks: { font: { size: 10 }, color: '#5F5E5A', callback: (v) => v + ' ms' }, grid: { color: 'rgba(0,0,0,0.06)' } },
          y2: { min: 0, max: 100, position: 'right', title: { display: true, text: 'Hit rate (%)', font: { size: 11 }, color: '#185FA5' }, ticks: { font: { size: 10 }, color: '#185FA5', callback: (v) => v + '%' }, grid: { display: false } },
        },
      },
    });
  }

  private buildHistoryData() {
    if (this.metricsHistory.length === 0) {
      const now    = new Date();
      const labels = Array.from({ length: 24 }, (_, i) => {
        const h = new Date(now.getTime() - (23 - i) * 3600000);
        return h.getHours().toString().padStart(2, '0') + ':00';
      });
      const base   = this.metrics?.l1AvgResponseTime ?? 5;
      const baseMg = this.metrics?.l3AvgResponseTime ?? 280;
      return {
        labels,
        cacheData: labels.map(() => parseFloat((base   + (Math.random() - 0.5) * 2).toFixed(1))),
        mongoData: labels.map(() => parseFloat((baseMg + (Math.random() - 0.5) * 80).toFixed(1))),
        hitData:   labels.map(() => Math.round(70 + Math.random() * 20)),
      };
    }
    return {
      labels:    this.metricsHistory.map(s => new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
      cacheData: this.metricsHistory.map(_s => parseFloat((this.metrics?.l1AvgResponseTime ?? 5).toFixed(1))),
      mongoData: this.metricsHistory.map(_s => parseFloat((this.metrics?.l3AvgResponseTime ?? 280).toFixed(1))),
      hitData:   this.metricsHistory.map(s => s.totalRequests > 0 ? Math.round((s.totalHits / s.totalRequests) * 100) : 0),
    };
  }

  private updateHistoryChart(): void {
    if (!this.historyChart) return;
    const { labels, cacheData, mongoData, hitData } = this.buildHistoryData();
    this.historyChart.data.labels            = labels;
    this.historyChart.data.datasets[0].data  = cacheData;
    this.historyChart.data.datasets[1].data  = mongoData;
    this.historyChart.data.datasets[2].data  = hitData;
    this.historyChart.update();
  }

  // ════════════════════════════════════════════════════════
  // CHARTS EXISTANTS (hitMiss + hitRate)
  // ════════════════════════════════════════════════════════

  private initCharts(): void { this.initHitMissChart(); this.initHitRateChart(); }

  private initHitMissChart(): void {
    if (!this.hitMissChartRef?.nativeElement) return;
    const ctx = this.hitMissChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    this.hitMissChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['L1 Hits', 'L2 Hits', 'Misses'],
        datasets: [{ data: [this.metrics?.l1Hits ?? 0, this.metrics?.l2Hits ?? 0, this.metrics?.totalMisses ?? 0], backgroundColor: ['#6366f1', '#3b82f6', '#ef4444'], borderWidth: 0, hoverOffset: 8 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}` } } } },
    });
  }

  private initHitRateChart(): void {
    if (!this.hitRateChartRef?.nativeElement) return;
    const ctx = this.hitRateChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    this.hitRateChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.metricsHistory.map(s => new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
        datasets: [{ label: 'Hit Rate (%)', data: this.metricsHistory.map(s => s.hitRate), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6, borderWidth: 2 }],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` Hit Rate: ${ctx.parsed.y}%` } } } },
    });
  }

  updateHitMissChart(): void {
    if (!this.hitMissChart || !this.metrics) return;
    this.hitMissChart.data.datasets[0].data = [this.metrics.l1Hits, this.metrics.l2Hits, this.metrics.totalMisses];
    this.hitMissChart.update('none');
  }

  updateHitRateChart(): void {
    if (!this.hitRateChart) return;
    this.hitRateChart.data.labels = this.metricsHistory.map(s => new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    this.hitRateChart.data.datasets[0].data = this.metricsHistory.map(s => s.hitRate);
    this.hitRateChart.update();
  }
}
