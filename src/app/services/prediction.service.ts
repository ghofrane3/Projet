// prediction.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, startWith, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PeakSlot {
  slotIndex: number;
  time: string;
  avgRequests: number;
  confidence: number;
}

export interface WarmupLog {
  timestamp: string;
  slotIndex: number;
  time: string;
  keysWarmed: number;
}

export interface PredictionDashboard {
  profile: number[];       // moyenne 7j par slot
  today: (number | null)[];// valeurs réelles aujourd'hui
  peaks: PeakSlot[];
  globalMedian: number;
  currentSlot: number;
  nextPeak: PeakSlot | null;
  labels: string[];        // "00:00", "00:30", ...
  warmupHistory: WarmupLog[];
}

@Injectable({ providedIn: 'root' })
export class PredictionService {
  private baseUrl = `${environment.apiUrl}/prediction`;

  // Auto-refresh toutes les 60 secondes
  dashboard$: Observable<PredictionDashboard> = interval(60000).pipe(
    startWith(0),
    switchMap(() => this.http.get<{ success: boolean; data: PredictionDashboard }>(
      `${this.baseUrl}/dashboard`
    )),
    shareReplay(1)
  ) as any;

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<{ success: boolean; data: PredictionDashboard }> {
    return this.http.get<any>(`${this.baseUrl}/dashboard`);
  }

  triggerWarmup(slotIndex?: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/warmup/trigger`, { slotIndex });
  }
}
