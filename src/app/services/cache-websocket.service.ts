/**
 * cache-websocket.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Service Angular qui gère la connexion Socket.IO au namespace /cache-admin
 * et expose des Observables pour chaque type d'événement.
 *
 * Nouveautés v2 :
 *  - Champ `context` dans tous les événements (ex: 'order_created', 'user_updated')
 *  - Champ `label`  traduit côté serveur
 *  - Observable `allEvents$` pour un flux unifié dans le dashboard
 *  - Méthode statique `contextLabel()` pour les libellés UI
 *
 * Usage dans un composant :
 *   this.wsService.evictionKey$.subscribe(ev => { ... });
 *   this.wsService.allEvents$.subscribe(ev => { ... });
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject, BehaviorSubject, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';

// ── Types des événements reçus ────────────────────────────────────────────────

export interface EvictionKeyEvent {
  key:       string;
  reason:    string;
  label?:    string;    // libellé lisible fourni par le serveur
  level:     string;
  ttl:       number | null;
  context:   string;   // ex: 'order_created', 'product_updated', 'user_deleted'
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

/** Événement unifié pour un feed "dernières évictions" */
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

// ── Traduction des raisons ─────────────────────────────────────────────────────
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

// ── Traduction des contextes métier ──────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CacheWebSocketService implements OnDestroy {

  private socket: Socket | null = null;
  private readonly WS_URL = 'http://localhost:5000';
  private readonly NS     = '/cache-admin';

  // ── Subjects internes ────────────────────────────────────────────────────
  private _evictionKey$   = new Subject<EvictionKeyEvent>();
  private _evictionBatch$ = new Subject<EvictionBatchEvent>();
  private _cacheCleared$  = new Subject<CacheClearedEvent>();
  private _metrics$       = new Subject<any>();
  private _status$        = new BehaviorSubject<ConnectionStatus>('disconnected');

  // ── Observables publics ───────────────────────────────────────────────────

  /** Émis pour chaque suppression unitaire de clé */
  readonly evictionKey$   = this._evictionKey$.asObservable();

  /** Émis pour les suppressions en batch (pattern, flush…) */
  readonly evictionBatch$ = this._evictionBatch$.asObservable();

  /** Émis quand tout le cache est vidé */
  readonly cacheCleared$  = this._cacheCleared$.asObservable();

  /** Snapshot complet des métriques */
  readonly metrics$       = this._metrics$.asObservable();

  /** Statut de la connexion WebSocket */
  readonly status$        = this._status$.asObservable();

  /**
   * Flux unifié de tous les événements d'éviction.
   * Pratique pour un feed "dernières opérations" dans le dashboard.
   */
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

    // ── Événements de connexion ───────────────────────────────────────────
    this.socket.on('connect', () => {
      console.log('🔌 [WS] Connecté au namespace /cache-admin');
      this._status$.next('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('🔌 [WS] Déconnecté :', reason);
      this._status$.next('disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.error('🔌 [WS] Erreur connexion :', err.message);
      this._status$.next('error');
    });

    this.socket.on('reconnect', (attempt) => {
      console.log(`🔌 [WS] Reconnecté après ${attempt} tentative(s)`);
      this._status$.next('connected');
    });

    // ── Événements métier ─────────────────────────────────────────────────
    this.socket.on('eviction:key', (data: EvictionKeyEvent) => {
      this._evictionKey$.next(data);
    });

    this.socket.on('eviction:batch', (data: EvictionBatchEvent) => {
      this._evictionBatch$.next(data);
    });

    this.socket.on('cache:cleared', (data: CacheClearedEvent) => {
      this._cacheCleared$.next(data);
    });

    this.socket.on('metrics:snapshot', (data: any) => {
      this._metrics$.next(data);
    });
  }

  // ── Déconnexion ───────────────────────────────────────────────────────────
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this._status$.next('disconnected');
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Traduit la raison technique en libellé lisible */
  static reasonLabel(reason: string): string {
    return REASON_LABELS[reason] ?? reason;
  }

  /** Traduit le contexte métier en libellé lisible */
  static contextLabel(context: string): string {
    return CONTEXT_LABELS[context] ?? context;
  }

  // ── Nettoyage Angular ─────────────────────────────────────────────────────
  ngOnDestroy(): void {
    this.disconnect();
    this._evictionKey$.complete();
    this._evictionBatch$.complete();
    this._cacheCleared$.complete();
    this._metrics$.complete();
    this._status$.complete();
  }
}
