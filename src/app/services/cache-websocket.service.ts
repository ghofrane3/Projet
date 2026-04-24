/**
 * cache-websocket.service.ts  –  VERSION AMÉLIORÉE v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Nouveautés :
 *  - Observable `alerts$` pour les alertes intelligentes (hit rate, mémoire…)
 *  - Observable `alertResolved$` quand une alerte se résout
 *  - Méthode statique `contextLabel()` pour les libellés UI
 *  - Interface `CacheAlert` avec severité et données
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject, BehaviorSubject, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';

// ── Types événements existants ────────────────────────────────────────────────

export interface EvictionKeyEvent {
  key:       string;
  reason:    string;
  label?:    string;
  level:     string;
  ttl:       number | null;
  context:   string;
  timestamp: string;
}

export interface EvictionBatchEvent {
  keys?:     string[];
  pattern?:  string;
  count:     number;
  reason:    string;
  label?:    string;
  context?:  string;
  timestamp: string;
}

export interface CacheClearedEvent {
  message:   string;
  count:     number;
  reason:    string;
  label?:    string;
  context?:  string;
  timestamp: string;
}

// ── ★ NOUVEAUX types ──────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'urgent';

export interface CacheAlert {
  id:          string;
  type:        string;
  severity:    AlertSeverity;
  title:       string;
  message:     string;
  data:        Record<string, any>;
  timestamp:   string;
  active:      boolean;
  resolvedAt?: string;
}

export interface CacheAlertResolved {
  type:       string;
  resolvedAt: string;
}

/** Événement unifié pour le feed des dernières évictions */
export interface UnifiedEvictionEvent {
  type:      'key' | 'batch' | 'cleared';
  reason:    string;
  label:     string;
  context:   string;
  count:     number;
  keys?:     string[];
  pattern?:  string;
  timestamp: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// ── Traductions ───────────────────────────────────────────────────────────────

export const REASON_LABELS: Record<string, string> = {
  manual_delete:   '🗑️ Suppression manuelle',
  ttl_expired:     '⏱️ TTL expiré',
  pattern_delete:  '🔍 Suppression par pattern',
  batch_eviction:  '📦 Éviction batch',
  full_flush:      '🧹 Vidage total',
  warmup:          '🔥 Préchauffage',
  reset:           '🔄 Reset métriques',
  eviction:        '⚡ Éviction automatique',
};

export const CONTEXT_LABELS: Record<string, string> = {
  order_created:   '🛍️ Nouvelle commande client',
  order_updated:   '🛒 Commande mise à jour',
  product_created: '👔 Nouveau produit ajouté',
  product_updated: '✏️ Produit modifié',
  product_deleted: '🗑️ Produit supprimé',
  user_registered: '👋 Nouvel utilisateur inscrit',
  user_updated:    '👤 Utilisateur modifié',
  user_deleted:    '❌ Utilisateur supprimé',
  'auto-expiry':   '⏱️ Expiration TTL automatique',
  manual_delete:   '🗑️ Suppression manuelle',
  full_flush:      '🧹 Vidage total du cache',
};

export const ALERT_SEVERITY_CLASS: Record<AlertSeverity, string> = {
  info:     'alert-info',
  warning:  'alert-warning',
  critical: 'alert-critical',
  urgent:   'alert-urgent',
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CacheWebSocketService implements OnDestroy {

  private socket: Socket | null = null;
  private readonly WS_URL = 'http://localhost:5000';
  private readonly NS     = '/cache-admin';

  // ── Subjects internes ────────────────────────────────────────────────────
  private _evictionKey$    = new Subject<EvictionKeyEvent>();
  private _evictionBatch$  = new Subject<EvictionBatchEvent>();
  private _cacheCleared$   = new Subject<CacheClearedEvent>();
  private _metrics$        = new Subject<any>();
  private _status$         = new BehaviorSubject<ConnectionStatus>('disconnected');
  private _alerts$         = new Subject<CacheAlert>();          // ★ NOUVEAU
  private _alertResolved$  = new Subject<CacheAlertResolved>();  // ★ NOUVEAU

  // ── Observables publics ───────────────────────────────────────────────────
  readonly evictionKey$   = this._evictionKey$.asObservable();
  readonly evictionBatch$ = this._evictionBatch$.asObservable();
  readonly cacheCleared$  = this._cacheCleared$.asObservable();
  readonly metrics$       = this._metrics$.asObservable();
  readonly status$        = this._status$.asObservable();
  readonly alerts$        = this._alerts$.asObservable();               // ★ NOUVEAU
  readonly alertResolved$ = this._alertResolved$.asObservable();        // ★ NOUVEAU

  /** Flux unifié de tous les événements d'éviction */
  readonly allEvents$: Observable<UnifiedEvictionEvent> = merge(
    this._evictionKey$.pipe(
      map(ev => ({
        type:      'key' as const,
        reason:    ev.reason,
        label:     ev.label ?? CacheWebSocketService.reasonLabel(ev.reason),
        context:   ev.context ?? '',
        count:     1,
        keys:      [ev.key],
        timestamp: ev.timestamp,
      }))
    ),
    this._evictionBatch$.pipe(
      map(ev => ({
        type:      'batch' as const,
        reason:    ev.reason,
        label:     ev.label ?? CacheWebSocketService.reasonLabel(ev.reason),
        context:   ev.context ?? '',
        count:     ev.count,
        keys:      ev.keys,
        pattern:   ev.pattern,
        timestamp: ev.timestamp,
      }))
    ),
    this._cacheCleared$.pipe(
      map(ev => ({
        type:      'cleared' as const,
        reason:    ev.reason,
        label:     ev.label ?? CacheWebSocketService.reasonLabel(ev.reason),
        context:   ev.context ?? '',
        count:     ev.count ?? 0,
        timestamp: ev.timestamp,
      }))
    ),
  );

  // ── Connexion ─────────────────────────────────────────────────────────────
  connect(): void {
    if (this.socket?.connected) return;
    this._status$.next('connecting');

    this.socket = io(`${this.WS_URL}${this.NS}`, {
      withCredentials: true,
      transports:      ['websocket', 'polling'],
      reconnection:    true,
      reconnectionDelay:    1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect',    () => this._status$.next('connected'));
    this.socket.on('disconnect', () => this._status$.next('disconnected'));
    this.socket.on('connect_error', () => this._status$.next('error'));
    this.socket.on('reconnect',  () => this._status$.next('connected'));

    this.socket.on('eviction:key',   (d: EvictionKeyEvent)   => this._evictionKey$.next(d));
    this.socket.on('eviction:batch', (d: EvictionBatchEvent) => this._evictionBatch$.next(d));
    this.socket.on('cache:cleared',  (d: CacheClearedEvent)  => this._cacheCleared$.next(d));
    this.socket.on('metrics:snapshot', (d: any)              => this._metrics$.next(d));

    // ★ NOUVEAUX événements d'alerte
    this.socket.on('cache:alert',          (d: CacheAlert)          => this._alerts$.next(d));
    this.socket.on('cache:alert:resolved', (d: CacheAlertResolved)  => this._alertResolved$.next(d));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this._status$.next('disconnected');
  }

  get isConnected(): boolean { return this.socket?.connected ?? false; }

  static reasonLabel(reason: string): string {
    return REASON_LABELS[reason] ?? reason;
  }

  static contextLabel(context: string): string {
    return CONTEXT_LABELS[context] ?? context;
  }

  static alertSeverityClass(severity: AlertSeverity): string {
    return ALERT_SEVERITY_CLASS[severity] ?? 'alert-info';
  }

  ngOnDestroy(): void {
    this.disconnect();
    this._evictionKey$.complete();
    this._evictionBatch$.complete();
    this._cacheCleared$.complete();
    this._metrics$.complete();
    this._status$.complete();
    this._alerts$.complete();
    this._alertResolved$.complete();
  }
}
