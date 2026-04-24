import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewInit,
  ChangeDetectorRef
} from '@angular/core';
import { HttpClient }   from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { switchMap }    from 'rxjs/operators';
import { Chart, registerables } from 'chart.js';

import {
  CacheWebSocketService,
  EvictionKeyEvent,
  EvictionBatchEvent,
  CacheAlert,
  CacheAlertResolved,
  AlertSeverity,
} from '../../../services/cache-websocket.service';

Chart.register(...registerables);

// ════════════════════════════════════════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════════════════════════════════════════

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
  memory:          string;
  totalKeys:       string;
  uptime:          number;
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
  evictions?:         number;
  strategy?:          string;
  strategySize?:      number;
  adaptiveTTL?:       SmartCacheConfig;
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

export interface EvictionNotif {
  id:        number;
  key:       string;
  reason:    string;
  level:     string;
  timestamp: Date;
  isNew:     boolean;
}

// ── ★ NOUVEAUX types ──────────────────────────────────────────────────────────

export interface ActiveAlert {
  id:       string;
  type:     string;
  severity: AlertSeverity;
  title:    string;
  message:  string;
  data:     Record<string, any>;
  timestamp: string;
  dismissed?: boolean;
}

export interface InvalidationEntry {
  timestamp:   string;
  trigger:     string;
  pattern:     string;
  keysDeleted: number;
  context:     string;
}

export interface PreviewDeleteResult {
  pattern:      string;
  matchedCount: number;
  previewCount: number;
  totalSizeKB:  string;
  keys:         { key: string; ttl: number | string | null; sizeKB: string; type: string }[];
  warning:      string | null;
}

export interface CompressionStats {
  totalCompressed:   number;
  totalRawBytes:     number;
  totalCompressBytes: number;
  reductionPercent:  number;
  avgRawKB:          number;
  avgCompressedKB:   number;
}

// ── Types existants ───────────────────────────────────────────────────────────

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

interface PopularCacheKey {
  key:         string;
  accessCount: number;
  lastAccess:  Date;
  size:        number;
}

interface EvictionStats {
  totalEvictions:  number;
  evictionRate:    number;
  recentEvictions: { timestamp: Date; key: string; reason: string }[];
}

interface CacheEfficiencyScore {
  overall:           number;
  hitRateScore:      number;
  responseTimeScore: number;
  evictionScore:     number;
  memoryScore:       number;
}

interface MemoryDistribution {
  type:       string;
  sizeKB:     number;
  percentage: number;
  keyCount:   number;
}

interface SavingsEstimate {
  timeSavedMs:        number;
  dbQueriesAvoided:   number;
  timeSavedFormatted: string;
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT
// ════════════════════════════════════════════════════════════════════════════

@Component({
  selector:    'app-cache-dashboard',
  templateUrl: './cache-dashboard.component.html',
  styleUrls:   ['./cache-dashboard.component.scss'],

})
export class CacheDashboardComponent implements OnInit, OnDestroy, AfterViewInit {

  private readonly API = 'http://localhost:5000/api/admin/cache';
  private logCounter   = 0;
  private notifCounter = 0;

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

  actionLogs:    ActionLog[]                              = [];
  pendingAction: { label: string; fn: () => void } | null = null;

  evictionNotifs:     EvictionNotif[] = [];
  wsStatus:           string          = 'disconnected';
  wsConnected         = false;
  MAX_NOTIFS          = 50;
  showEvictionPanel   = true;

  popularCacheKeys:   PopularCacheKey[]    = [];
  evictionStats:      EvictionStats        = { totalEvictions: 0, evictionRate: 0, recentEvictions: [] };
  efficiencyScore:    CacheEfficiencyScore | null = null;
  memoryDistribution: MemoryDistribution[] = [];
  savingsEstimate:    SavingsEstimate      | null = null;

  // ── ★ NOUVEAUX états ──────────────────────────────────────────────────────
  activeTab: 'overview' | 'search' | 'smart' | 'timeline' | 'alerts' | 'compression' = 'overview';

  activeAlerts: ActiveAlert[] = [];
  alertHistory: CacheAlert[]  = [];
  alertsLoading = false;
  showAlertPanel = true;

  invalidationEntries: InvalidationEntry[] = [];
  invalidationStats: any = null;
  timelineLoading = false;

  previewResult:    PreviewDeleteResult | null = null;
  previewPattern    = '';
  previewLoading    = false;
  showPreviewModal  = false;

  compressionStats: CompressionStats | null = null;
  compressionLoading = false;

  // ── Souscriptions WebSocket ───────────────────────────────────────────────
  private wsSubs: Subscription[] = [];

  // ── Charts ────────────────────────────────────────────────────────────────
  @ViewChild('hitMissChart')      hitMissChartRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('hitRateChart')      hitRateChartRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('compareChart')      compareChartRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('historyChart')      historyChartRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('responseTimeChart') responseTimeChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('distributionChart') distributionChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('efficiencyGauge')   efficiencyGaugeRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('memoryDonutChart')  memoryDonutChartRef!:  ElementRef<HTMLCanvasElement>;

  private hitMissChart:      Chart | null = null;
  private hitRateChart:      Chart | null = null;
  private compareChart:      Chart | null = null;
  private historyChart:      Chart | null = null;
  private metricsSub:        Subscription | null = null;
  private responseTimeChart: Chart | null = null;
  private distributionChart: Chart | null = null;
  private efficiencyGauge:   Chart | null = null;
  private memoryDonutChart:  Chart | null = null;

  // ── Cache de recherche ────────────────────────────────────────────────────
  searchCacheKeys:  any[] = [];
  searchKeysLoading = false;
  searchStats = {
    totalSearchKeys: 0, textSearchKeys: 0, categoryFilterKeys: 0,
    priceFilterKeys: 0, suggestionKeys: 0, popularKeys: 0,
  };

  // ── Smart Cache ───────────────────────────────────────────────────────────
  smartConfig:  SmartCacheConfig | null = null;
  smartSaving   = false;
  smartForm = {
    baseTTL:      300, minTTL: 30, maxTTL: 86400,
    hotThreshold: 10,  coldAfterMs: 600000,
  };

  popularKeys:   PopularKey[] = [];
  popularLoading = false;

  inspectKeyValue = '';
  inspectResult:  InspectResult | null = null;
  inspecting      = false;

  // ════════════════════════════════════════════════════════
  constructor(
    private http:      HttpClient,
    private wsService: CacheWebSocketService,
    private cdr:       ChangeDetectorRef,
  ) {}

  // ════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.loadStats();
    this.loadRedisInfo();
    this.loadMetrics();
    this.loadHistory();
    this.loadSearchCacheKeys();
    this.loadSmartConfig();
    this.loadPopularKeys();
    this.loadPopularCacheKeys();
    this.loadEvictionStats();
    this.loadAlerts();
    this.loadInvalidationHistory();
    this.loadCompressionStats();

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
          this.calculateEfficiencyScore();
          this.calculateMemoryDistribution();
          this.calculateSavings();
        }
      },
      error: (err) => console.error('Metrics refresh error:', err),
    });

    this.connectWebSocket();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initCharts();
      this.initCompareChart();
      this.initHistoryChart();
      this.initResponseTimeChart();
      this.initDistributionChart();
      this.initEfficiencyGauge();
      this.initMemoryDonutChart();
    }, 400);
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.metricsSub?.unsubscribe();
    this.wsSubs.forEach(s => s.unsubscribe());
    this.wsService.disconnect();
    [this.hitMissChart, this.hitRateChart, this.compareChart, this.historyChart,
     this.responseTimeChart, this.distributionChart, this.efficiencyGauge, this.memoryDonutChart]
      .forEach(c => c?.destroy());
  }

  // ════════════════════════════════════════════════════════
  // WEBSOCKET
  // ════════════════════════════════════════════════════════

  private connectWebSocket(): void {
    this.wsService.connect();

    this.wsSubs.push(
      this.wsService.status$.subscribe(status => {
        this.wsStatus    = status;
        this.wsConnected = status === 'connected';
        this.cdr.markForCheck();
      })
    );

    this.wsSubs.push(
      this.wsService.evictionKey$.subscribe((ev: EvictionKeyEvent) => {
        this.addEvictionNotif(ev.key, ev.reason, ev.level ?? 'L1+L2');
        setTimeout(() => this.loadStats(), 300);
      })
    );

    this.wsSubs.push(
      this.wsService.evictionBatch$.subscribe((ev: EvictionBatchEvent) => {
        const label = ev.pattern ?? `${ev.count} clés`;
        this.addEvictionNotif(label, ev.reason, 'batch');
        setTimeout(() => { this.loadStats(); this.loadSearchCacheKeys(); this.loadInvalidationHistory(); }, 300);
      })
    );

    this.wsSubs.push(
      this.wsService.cacheCleared$.subscribe(() => {
        this.addEvictionNotif('*', 'full_flush', 'ALL');
        this.showMessage('Cache vidé — notification WebSocket reçue', 'success');
        setTimeout(() => { this.loadStats(); this.loadInvalidationHistory(); }, 300);
      })
    );

    this.wsSubs.push(
      this.wsService.metrics$.subscribe((m: any) => {
        this.metrics     = m;
        this.lastRefresh = new Date();
        this.updateHitMissChart();
        this.updateCompareChart();
        this.cdr.markForCheck();
      })
    );

    this.wsSubs.push(
      this.wsService.alerts$.subscribe((alert: CacheAlert) => {
        this.addActiveAlert(alert);
        this.cdr.markForCheck();
      })
    );

    this.wsSubs.push(
      this.wsService.alertResolved$.subscribe((ev: CacheAlertResolved) => {
        this.resolveActiveAlert(ev.type);
        this.cdr.markForCheck();
      })
    );
  }

  // ════════════════════════════════════════════════════════
  // ★ ALERTES INTELLIGENTES
  // ════════════════════════════════════════════════════════

  loadAlerts(): void {
    this.alertsLoading = true;
    this.http.get<any>(`${this.API}/alerts`, { withCredentials: true }).subscribe({
      next: (res) => {
        this.alertsLoading = false;
        if (res.success) {
          this.activeAlerts = res.data.active ?? [];
          this.alertHistory = res.data.history ?? [];
        }
      },
      error: () => { this.alertsLoading = false; },
    });
  }

  private addActiveAlert(alert: CacheAlert): void {
    this.activeAlerts = this.activeAlerts.filter(a => a.type !== alert.type);
    this.activeAlerts.unshift({ ...alert, dismissed: false });
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > 100) this.alertHistory.length = 100;

    if (alert.severity === 'info') {
      setTimeout(() => this.dismissAlert(alert.id), 8000);
    }
  }

  private resolveActiveAlert(type: string): void {
    this.activeAlerts = this.activeAlerts.filter(a => a.type !== type);
  }

  dismissAlert(id: string): void {
    this.activeAlerts = this.activeAlerts.filter(a => a.id !== id);
  }

  dismissAllAlerts(): void { this.activeAlerts = []; }

  getAlertClass(severity: AlertSeverity): string {
    return CacheWebSocketService.alertSeverityClass(severity);
  }

  get criticalAlertsCount(): number {
    return this.activeAlerts.filter(a => a.severity === 'critical' || a.severity === 'urgent').length;
  }

  // ════════════════════════════════════════════════════════
  // ★ TIMELINE DES INVALIDATIONS
  // ════════════════════════════════════════════════════════

  loadInvalidationHistory(): void {
    this.timelineLoading = true;
    this.http.get<any>(`${this.API}/invalidation-history?limit=100`, { withCredentials: true }).subscribe({
      next: (res) => {
        this.timelineLoading = false;
        if (res.success) {
          this.invalidationEntries = res.data.entries ?? [];
          this.invalidationStats   = res.data.stats;
        }
      },
      error: () => { this.timelineLoading = false; },
    });
  }

  // ✅ CORRECTION : paramètre accepte `unknown` (keyvalue pipe retourne unknown)
  getTriggerLabel(trigger: unknown): string {
    const labels: Record<string, string> = {
      'manual_delete':   '🗑️ Suppression manuelle',
      'ttl-expired':     '⏱️ TTL expiré',
      'pattern_delete':  '🔍 Pattern',
      'batch_eviction':  '📦 Éviction batch',
      'full_flush':      '🧹 Flush total',
      'product-updated': '✏️ Produit modifié',
      'order-created':   '🛍️ Commande créée',
      'user-updated':    '👤 Utilisateur modifié',
    };
    const key = String(trigger);
    return labels[key] ?? key;
  }

  getTriggerClass(trigger: string): string {
    if (trigger.includes('flush'))   return 'trigger-flush';
    if (trigger.includes('ttl') || trigger.includes('expired')) return 'trigger-ttl';
    if (trigger.includes('product') || trigger.includes('order')) return 'trigger-business';
    return 'trigger-manual';
  }

  // ════════════════════════════════════════════════════════
  // ★ DRY-RUN PREVIEW DELETE
  // ════════════════════════════════════════════════════════

  previewDeletePattern(): void {
    const pattern = this.previewPattern.trim();
    if (!pattern) { this.showMessage('Entrez un pattern à prévisualiser', 'error'); return; }

    this.previewLoading = true;
    this.http.get<any>(`${this.API}/preview-delete?pattern=${encodeURIComponent(pattern)}`, { withCredentials: true }).subscribe({
      next: (res) => {
        this.previewLoading = false;
        if (res.success) {
          this.previewResult   = res.data;
          this.showPreviewModal = true;
        }
      },
      error: (err) => {
        this.previewLoading = false;
        this.showMessage('Erreur preview : ' + (err.message || 'inconnue'), 'error');
      },
    });
  }

  confirmPreviewDelete(): void {
    if (!this.previewResult) return;
    this.showPreviewModal = false;
    const originalPattern = this.searchPattern;
    this.searchPattern    = this.previewResult.pattern;
    this.deleteByPattern();
    this.searchPattern = originalPattern;
    this.previewResult = null;
  }

  closePreviewModal(): void {
    this.showPreviewModal = false;
    this.previewResult    = null;
  }

  // ════════════════════════════════════════════════════════
  // ★ STATS COMPRESSION
  // ════════════════════════════════════════════════════════

  loadCompressionStats(): void {
    this.compressionLoading = true;
    this.http.get<any>(`${this.API}/compression-stats`, { withCredentials: true }).subscribe({
      next: (res) => {
        this.compressionLoading = false;
        if (res.success) this.compressionStats = res.data;
      },
      error: () => { this.compressionLoading = false; },
    });
  }

  getCompressionBarWidth(): number {
    return this.compressionStats?.reductionPercent ?? 0;
  }

  // ════════════════════════════════════════════════════════
  // NOTIFICATIONS ÉVICTION
  // ════════════════════════════════════════════════════════

  private addEvictionNotif(key: string, reason: string, level: string): void {
    const notif: EvictionNotif = {
      id: ++this.notifCounter, key, reason, level, timestamp: new Date(), isNew: true,
    };
    this.evictionNotifs.unshift(notif);
    if (this.evictionNotifs.length > this.MAX_NOTIFS) this.evictionNotifs.pop();

    setTimeout(() => {
      const n = this.evictionNotifs.find(x => x.id === notif.id);
      if (n) { n.isNew = false; this.cdr.markForCheck(); }
    }, 1500);

    this.cdr.markForCheck();
  }

  clearEvictionNotifs(): void   { this.evictionNotifs = []; }
  removeEvictionNotif(id: number): void { this.evictionNotifs = this.evictionNotifs.filter(n => n.id !== id); }

  reasonLabel(reason: string): string { return CacheWebSocketService.reasonLabel(reason); }

  // ════════════════════════════════════════════════════════
  // LOGS ADMIN
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
  // DONNÉES
  // ════════════════════════════════════════════════════════

  loadStats(): void {
    this.loading = true;
    this.http.get<any>(`${this.API}/stats`).subscribe({
      next:  (res) => { if (res.success) this.stats = res.stats; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  loadRedisInfo(): void {
    this.http.get<any>(`${this.API}/info`).subscribe({
      next:  (res) => { if (res.success) this.redisInfo = res.redis; },
      error: () => {},
    });
  }

  deleteKey(key: string): void {
    this.askConfirm(`Supprimer la clé "${key}" ?`, () => {
      this.http.delete(`${this.API}/key/${encodeURIComponent(key)}`).subscribe({
        next: () => {
          this.addLog(key, 'Suppression clé', 'Succès');
          this.showMessage('Clé supprimée', 'success');
          this.loadStats(); this.loadSearchCacheKeys();
        },
        error: (err) => {
          this.addLog(key, 'Suppression clé', 'Erreur', err.message);
          this.showMessage('Erreur suppression', 'error');
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
          this.loadStats(); this.loadInvalidationHistory();
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
          this.addLog('*', 'Vidage total', 'Succès');
          this.showMessage('Cache vidé', 'success');
          this.loadStats(); this.loadInvalidationHistory();
        },
        error: (err) => {
          this.addLog('*', 'Vidage total', 'Erreur', err.message);
          this.showMessage('Erreur vidage', 'error');
        },
      });
    });
  }

  warmupCache(): void {
    this.loading = true;
    this.http.post(`${this.API}/warmup`, { types: ['products', 'categories'] }).subscribe({
      next: () => {
        this.addLog('products, categories', 'Préchauffage', 'Succès');
        this.showMessage('Cache préchauffé', 'success');
        this.loadStats(); this.loading = false;
      },
      error: (err) => {
        this.addLog('products, categories', 'Préchauffage', 'Erreur', err.message);
        this.showMessage('Erreur warmup', 'error'); this.loading = false;
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
      error: () => { this.metricsLoading = false; },
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
      error: () => {},
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
          this.showMessage('Erreur reset', 'error');
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
  // SMART CACHE
  // ════════════════════════════════════════════════════════

  loadSmartConfig(): void {
    this.http.get<any>(`${this.API}/smart-config`, { withCredentials: true }).subscribe({
      next: (res) => {
        if (!res.success) return;
        this.smartConfig = res.data;
        Object.assign(this.smartForm, {
          baseTTL: res.data.baseTTL, minTTL: res.data.minTTL, maxTTL: res.data.maxTTL,
          hotThreshold: res.data.hotThreshold, coldAfterMs: res.data.coldAfterMs,
        });
      },
      error: () => {},
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
          this.showMessage('Configuration TTL appliquée ✓', 'success');
        }
      },
      error: (err) => {
        this.smartSaving = false;
        this.addLog('smart-config', 'Mise à jour TTL adaptatif', 'Erreur', err.message);
        this.showMessage('Erreur mise à jour', 'error');
      },
    });
  }

  loadPopularKeys(): void {
    this.popularLoading = true;
    this.http.get<any>(`${this.API}/strategy/popular`, { withCredentials: true }).subscribe({
      next: (res) => { this.popularLoading = false; if (res.success) this.popularKeys = res.data; },
      error: () => { this.popularLoading = false; },
    });
  }

  inspectKey(): void {
    const key = this.inspectKeyValue.trim();
    if (!key) return;
    this.inspecting = true;
    this.http.get<any>(`${this.API}/inspect/${encodeURIComponent(key)}`, { withCredentials: true }).subscribe({
      next: (res) => { this.inspecting = false; if (res.success) this.inspectResult = res.data; },
      error: () => { this.inspecting = false; },
    });
  }

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
  // POPULAR KEYS & ÉVICTIONS
  // ════════════════════════════════════════════════════════

  loadPopularCacheKeys(): void {
    this.http.get<any>(`${this.API}/popular-keys`).subscribe({
      next: (res) => {
        if (res?.success && Array.isArray(res.data)) {
          this.popularCacheKeys = res.data.map((k: any) => ({
            ...k,
            lastAccess:  k.lastAccess ? new Date(k.lastAccess) : new Date(),
            accessCount: k.hits ?? k.score ?? 1,
          }));
        } else {
          this.popularCacheKeys = [];
        }
      },
      error: () => { this.popularCacheKeys = []; },
    });
  }

  loadEvictionStats(): void {
    this.http.get<any>(`${this.API}/eviction-stats`).subscribe({
      next: (res) => {
        if (res?.success && res.data) {
          this.evictionStats = {
            totalEvictions: res.data.totalEvictions ?? 0,
            evictionRate:   res.data.evictionRate ?? 0,
            recentEvictions: Array.isArray(res.data.recentEvictions)
              ? res.data.recentEvictions.map((e: any) => ({
                  ...e, timestamp: e.timestamp ? new Date(e.timestamp) : new Date()
                }))
              : []
          };
        } else {
          this.evictionStats = { totalEvictions: 0, evictionRate: 0, recentEvictions: [] };
        }
      },
      error: () => { this.evictionStats = { totalEvictions: 0, evictionRate: 0, recentEvictions: [] }; },
    });
  }

  getEvictionRateClass(): string {
    const rate = this.evictionStats.evictionRate;
    if (rate < 5) return 'excellent'; if (rate < 15) return 'good';
    if (rate < 30) return 'warning'; return 'critical';
  }

  // ════════════════════════════════════════════════════════
  // EFFICACITÉ & MÉMOIRE
  // ════════════════════════════════════════════════════════

  calculateEfficiencyScore(): void {
    if (!this.metrics) return;
    const hitRate           = this.metrics.hitRate;
    const avgResponse       = this.metrics.l1AvgResponseTime || 1;
    const l3AvgTime         = this.metrics.l3AvgResponseTime || 280;
    const evictionRate      = this.evictionStats.evictionRate;
    const memoryUsagePct    = this.stats ? (parseFloat(this.stats.totalSizeMB) / 512) * 100 : 0;

    const hitRateScore      = hitRate * 0.40;
    const responseTimeScore = (1 - (avgResponse / l3AvgTime)) * 100 * 0.30;
    const evictionScore     = (1 - (evictionRate / 100)) * 100 * 0.15;
    const memoryScore       = (1 - (memoryUsagePct / 100)) * 100 * 0.15;
    const overall           = Math.max(0, Math.min(100, hitRateScore + responseTimeScore + evictionScore + memoryScore));

    this.efficiencyScore = {
      overall: Math.round(overall), hitRateScore: Math.round(hitRateScore),
      responseTimeScore: Math.round(responseTimeScore), evictionScore: Math.round(evictionScore),
      memoryScore: Math.round(memoryScore),
    };
    this.updateEfficiencyGauge();
  }

  getEfficiencyClass(): string {
    if (!this.efficiencyScore) return '';
    const s = this.efficiencyScore.overall;
    if (s >= 80) return 'excellent'; if (s >= 50) return 'good'; return 'poor';
  }

  calculateMemoryDistribution(): void {
    if (!this.stats) return;
    const distribution = new Map<string, { size: number; count: number }>();
    this.stats.recentKeys.forEach(key => {
      const type  = key.type || 'default';
      const sizeKB = parseFloat(key.sizeKB) || 0;
      if (!distribution.has(type)) distribution.set(type, { size: 0, count: 0 });
      const cur = distribution.get(type)!;
      cur.size += sizeKB; cur.count += 1;
    });
    const totalSize = Array.from(distribution.values()).reduce((s, v) => s + v.size, 0);
    this.memoryDistribution = Array.from(distribution.entries())
      .map(([type, data]) => ({
        type, sizeKB: Math.round(data.size * 100) / 100,
        percentage: totalSize > 0 ? Math.round((data.size / totalSize) * 100) : 0,
        keyCount: data.count,
      }))
      .sort((a, b) => b.sizeKB - a.sizeKB);
    this.updateMemoryDonutChart();
  }

  calculateSavings(): void {
    if (!this.metrics) return;
    const l1Hits    = this.metrics.l1Hits || 0;
    const l2Hits    = this.metrics.l2Hits || 0;
    const avgL3     = this.metrics.l3AvgResponseTime || 280;
    const avgL2     = this.metrics.l2AvgResponseTime || 8;
    const timeSaved = (l1Hits * avgL3) + (l2Hits * (avgL3 - avgL2));
    this.savingsEstimate = {
      timeSavedMs: timeSaved,
      dbQueriesAvoided: l1Hits + l2Hits,
      timeSavedFormatted: this.formatSavedTime(timeSaved),
    };
  }

  formatSavedTime(ms: number): string {
    if (ms < 1000)     return `${Math.round(ms)} ms`;
    if (ms < 60000)    return `${(ms / 1000).toFixed(1)} s`;
    if (ms < 3600000)  return `${(ms / 60000).toFixed(1)} min`;
    return `${(ms / 3600000).toFixed(1)} h`;
  }

  // ════════════════════════════════════════════════════════
  // GRAPHIQUES
  // ════════════════════════════════════════════════════════

  private initCompareChart(): void {
    if (!this.compareChartRef?.nativeElement || !this.metrics) return;
    this.compareChart?.destroy();
    const ctx = this.compareChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const { labels, cacheData, mongoData } = this.buildCompareData();
    this.compareChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Cache Redis (ms)', data: cacheData, backgroundColor: '#10b981', borderRadius: 6 },
          { label: 'MongoDB (ms)',     data: mongoData, backgroundColor: '#ef4444', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, title: { display: true, text: 'Cache Redis vs MongoDB' } },
        scales: { y: { type: 'logarithmic', min: 0.1, ticks: { callback: (v: any) => `${v} ms` } } },
      },
    });
  }

  private buildCompareData() {
    const l1 = this.metrics?.l1AvgResponseTime ?? 2;
    const l2 = this.metrics?.l2AvgResponseTime ?? 8;
    const l3 = this.metrics?.l3AvgResponseTime ?? 7500;
    return {
      labels:    ['Liste produits', 'Recherche texte', 'Filtres catégorie', 'Filtres prix', 'Suggestions', 'Détail produit'],
      cacheData: [l2, l1*1.2, l2*0.9, l2*0.8, l1, l1*0.5].map(v => parseFloat(v.toFixed(1))),
      mongoData: [l3, l3*1.1, l3*1.05, l3*0.95, l3*0.6, l3*0.4].map(v => parseFloat(v.toFixed(1))),
    };
  }

  private updateCompareChart(): void {
    if (!this.compareChart || !this.metrics) return;
    const { cacheData, mongoData } = this.buildCompareData();
    this.compareChart.data.datasets[0].data = cacheData;
    this.compareChart.data.datasets[1].data = mongoData;
    this.compareChart.update('none');
  }

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
          { label: 'Cache Redis (ms)', data: cacheData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 3, tension: 0.4, yAxisID: 'y' },
          { label: 'MongoDB (ms)',     data: mongoData, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)',  borderWidth: 3, tension: 0.4, yAxisID: 'y' },
          { label: 'Hit Rate (%)',     data: hitData,   borderColor: '#3b82f6', borderDash: [5,5], borderWidth: 2, tension: 0.4, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, title: { display: true, text: 'Historique 24h' } },
        scales: {
          y:  { type: 'logarithmic', min: 0.1, position: 'left',  ticks: { callback: (v: any) => `${v} ms` } },
          y1: { type: 'linear', position: 'right', min: 0, max: 100, ticks: { callback: (v: any) => v + '%' }, grid: { drawOnChartArea: false } },
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
      const base = this.metrics?.l1AvgResponseTime ?? 5;
      const baseMg = this.metrics?.l3AvgResponseTime ?? 280;
      return {
        labels,
        cacheData: labels.map(() => parseFloat((base   + (Math.random()-0.5)*2).toFixed(1))),
        mongoData: labels.map(() => parseFloat((baseMg + (Math.random()-0.5)*80).toFixed(1))),
        hitData:   labels.map(() => Math.round(70 + Math.random() * 20)),
      };
    }
    return {
      labels:    this.metricsHistory.map(s => new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
      cacheData: this.metricsHistory.map(_ => parseFloat((this.metrics?.l1AvgResponseTime ?? 5).toFixed(1))),
      mongoData: this.metricsHistory.map(_ => parseFloat((this.metrics?.l3AvgResponseTime ?? 280).toFixed(1))),
      hitData:   this.metricsHistory.map(s => s.totalRequests > 0 ? Math.round((s.totalHits / s.totalRequests) * 100) : 0),
    };
  }

  private updateHistoryChart(): void {
    if (!this.historyChart) return;
    const { labels, cacheData, mongoData, hitData } = this.buildHistoryData();
    this.historyChart.data.labels           = labels;
    this.historyChart.data.datasets[0].data = cacheData;
    this.historyChart.data.datasets[1].data = mongoData;
    this.historyChart.data.datasets[2].data = hitData;
    this.historyChart.update();
  }

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
      options: { responsive: true, maintainAspectRatio: false },
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
        datasets: [{ label: 'Hit Rate (%)', data: this.metricsHistory.map(s => s.hitRate), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } },
    });
  }

  updateHitMissChart(): void {
    if (!this.hitMissChart || !this.metrics) return;
    this.hitMissChart.data.datasets[0].data = [this.metrics.l1Hits, this.metrics.l2Hits, this.metrics.totalMisses];
    this.hitMissChart.update('none');
  }

  updateHitRateChart(): void {
    if (!this.hitRateChart) return;
    this.hitRateChart.data.labels           = this.metricsHistory.map(s => new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    this.hitRateChart.data.datasets[0].data = this.metricsHistory.map(s => s.hitRate);
    this.hitRateChart.update();
  }

  private initResponseTimeChart(): void {
    if (!this.responseTimeChartRef?.nativeElement || !this.metrics) return;
    this.responseTimeChart?.destroy();
    const ctx = this.responseTimeChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const avgTimes = [this.metrics.l1AvgResponseTime||0.1, this.metrics.l2AvgResponseTime||0.1, this.metrics.l3AvgResponseTime||0.1];
    this.responseTimeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['L1 (Mémoire)', 'L2 (Redis)', 'L3 (MongoDB)'],
        datasets: [
          { label: 'Moyenne', data: avgTimes,                               backgroundColor: '#3b82f6', borderRadius: 4 },
          { label: 'p95',     data: avgTimes.map(v => v * 1.5),             backgroundColor: '#f59e0b', borderRadius: 4 },
          { label: 'p99',     data: avgTimes.map((v,i) => v * (i<2?2:1.5)), backgroundColor: '#ef4444', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, title: { display: true, text: 'Temps de réponse par niveau' } },
        scales: { y: { type: 'logarithmic', min: 0.1, ticks: { callback: (v: any) => `${v} ms` } } },
      },
    });
  }

  private initDistributionChart(): void {
    if (!this.distributionChartRef?.nativeElement) return;
    this.distributionChart?.destroy();
    const ctx = this.distributionChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const data = this.buildDistributionData();
    this.distributionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'L1 Hits', data: data.l1Data, backgroundColor: 'rgba(16,185,129,0.3)', borderColor: '#10b981', fill: true, tension: 0.4 },
          { label: 'L2 Hits', data: data.l2Data, backgroundColor: 'rgba(59,130,246,0.3)',  borderColor: '#3b82f6', fill: true, tension: 0.4 },
          { label: 'L3 Req',  data: data.l3Data, backgroundColor: 'rgba(239,68,68,0.3)',   borderColor: '#ef4444', fill: true, tension: 0.4 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { stacked: true, beginAtZero: true } } },
    });
  }

  private buildDistributionData() {
    if (this.metricsHistory.length === 0) return { labels: [], l1Data: [], l2Data: [], l3Data: [] };
    return {
      labels: this.metricsHistory.map(s => new Date(s.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
      l1Data: this.metricsHistory.map(s => s.l1Hits || 0),
      l2Data: this.metricsHistory.map(s => s.l2Hits || 0),
      l3Data: this.metricsHistory.map(s => s.l3Requests || 0),
    };
  }

  private initEfficiencyGauge(): void {
    if (!this.efficiencyGaugeRef?.nativeElement) return;
    this.efficiencyGauge?.destroy();
    const ctx = this.efficiencyGaugeRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const score = this.efficiencyScore?.overall || 0;
    this.efficiencyGauge = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{ data: [score, 100 - score], backgroundColor: [this.getScoreColor(score), '#e5e7eb'], borderWidth: 0, circumference: 180, rotation: 270 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    });
  }

  private updateEfficiencyGauge(): void {
    if (!this.efficiencyGauge || !this.efficiencyScore) return;
    const score = this.efficiencyScore.overall;
    this.efficiencyGauge.data.datasets[0].data = [score, 100 - score];
    (this.efficiencyGauge.data.datasets[0] as any).backgroundColor = [this.getScoreColor(score), '#e5e7eb'];
    this.efficiencyGauge.update('none');
  }

  private getScoreColor(score: number): string {
    if (score >= 80) return '#10b981'; if (score >= 50) return '#f59e0b'; return '#ef4444';
  }

  private initMemoryDonutChart(): void {
    if (!this.memoryDonutChartRef?.nativeElement) return;
    this.memoryDonutChart?.destroy();
    const ctx = this.memoryDonutChartRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
    this.memoryDonutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: this.memoryDistribution.map(d => d.type.toUpperCase()),
        datasets: [{ data: this.memoryDistribution.map(d => d.sizeKB), backgroundColor: colors, borderColor: '#ffffff', borderWidth: 5, hoverOffset: 15 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 13, weight: 500 }, color: '#374151' } },
          tooltip: { callbacks: { label: (ctx: any) => { const d = this.memoryDistribution[ctx.dataIndex]; return d ? ` ${d.sizeKB} KB  •  ${d.percentage}%  •  ${d.keyCount} clés` : ''; } } },
          title:   { display: true, text: 'Répartition Mémoire par Type', font: { size: 16, weight: 600 }, color: '#1f2937' },
        },
      },
    });
  }

  private updateMemoryDonutChart(): void {
    if (!this.memoryDonutChart) return;
    this.memoryDonutChart.data.labels           = this.memoryDistribution.map(d => d.type.toUpperCase());
    this.memoryDonutChart.data.datasets[0].data = this.memoryDistribution.map(d => d.sizeKB);
    this.memoryDonutChart.update('none');
  }
}
