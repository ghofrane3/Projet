// prediction-widget.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

interface PeakSlot {
  slotIndex: number;
  time: string;
  avgRequests: number;
  confidence: number;
}

interface WarmupLog {
  timestamp: string;
  slotIndex: number;
  time: string;
  keysWarmed: number;
}

interface DashboardData {
  profile: number[];
  today: (number | null)[];
  peaks: PeakSlot[];
  globalMedian: number;
  currentSlot: number;
  nextPeak: PeakSlot | null;
  labels: string[];
  warmupHistory: WarmupLog[];
}

@Component({
  selector: 'app-prediction-widget',
  templateUrl: './prediction-widget.component.html',
  styleUrls: ['./prediction-widget.component.scss']
})
export class PredictionWidgetComponent implements OnInit, OnDestroy {
  data: DashboardData | null = null;
  loading = true;
  warmupLoading = false;
  warmupSuccess = false;
  private sub: Subscription | null = null;

  // Slots visibles dans le graphe (toutes les 2h = slot 0,4,8,...)
  visibleLabels: string[] = [];
  maxRequests = 0;

  // ✅ FIX: credentials pour envoyer le cookie JWT
  private httpOptions = { withCredentials: true };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.sub = interval(60000).pipe(
      startWith(0),
      switchMap(() =>
        this.http.get<any>(`${environment.apiUrl}/prediction/dashboard`, this.httpOptions)
      )
    ).subscribe({
      next: (res) => {
        this.data = res.data;
        this.loading = false;
        this.computeChartMeta();
      },
      error: (err) => {
        console.error('[Prediction] dashboard error:', err);
        this.loading = false;
      }
    });
  }

  computeChartMeta() {
    if (!this.data) return;
    // Labels toutes les 4 tranches = toutes les 2h
    this.visibleLabels = this.data.labels.filter((_, i) => i % 4 === 0);
    // Max pour normaliser les barres
    const allValues = [...this.data.profile, ...this.data.today.filter(v => v !== null) as number[]];
    this.maxRequests = Math.max(...allValues, 1);
  }

  barHeight(value: number | null): string {
    if (value === null || value === 0) return '2px';
    return `${Math.max(4, (value / this.maxRequests) * 100)}%`;
  }

  isPeak(slotIndex: number): boolean {
    return !!this.data?.peaks.some(p => p.slotIndex === slotIndex);
  }

  isCurrentSlot(slotIndex: number): boolean {
    return this.data?.currentSlot === slotIndex;
  }

  isFuture(slotIndex: number): boolean {
    return (this.data?.currentSlot ?? 0) < slotIndex;
  }

  minutesUntilNextPeak(): number | null {
    if (!this.data?.nextPeak) return null;
    const peakMinutes = this.data.nextPeak.slotIndex * 30;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return Math.max(0, peakMinutes - currentMinutes);
  }

  triggerWarmup() {
    this.warmupLoading = true;
    this.http.post<any>(`${environment.apiUrl}/prediction/warmup/trigger`, {}, this.httpOptions).subscribe({
      next: () => {
        this.warmupLoading = false;
        this.warmupSuccess = true;
        // Refresh après warmup pour voir les nouvelles données
        setTimeout(() => {
          this.warmupSuccess = false;
          this.http.get<any>(`${environment.apiUrl}/prediction/dashboard`, this.httpOptions)
            .subscribe(res => { this.data = res.data; this.computeChartMeta(); });
        }, 2000);
      },
      error: (err) => {
        console.error('[Prediction] warmup error:', err);
        this.warmupLoading = false;
      }
    });
  }

  timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'à l\'instant';
    if (m < 60) return `il y a ${m}min`;
    return `il y a ${Math.floor(m / 60)}h`;
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
