// ============================================================
// src/app/shared/recommendation-widget/recommendation-widget.component.ts
// CORRECTION : Tracking de navigation + normalisation des catégories
// ============================================================

import {
  Component, Input, OnInit, OnChanges, SimpleChanges,
  OnDestroy, inject
} from '@angular/core';
import { CommonModule, TitleCasePipe, CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  RecommendationService,
  RecommendedCategory,
} from '../../services/recommendation.service';

@Component({
  selector: 'app-recommendation-widget',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, CurrencyPipe],
  templateUrl: './recommendation-widget.component.html',
  styleUrls: ['./recommendation-widget.component.scss'],
})
export class RecommendationWidgetComponent implements OnInit, OnChanges, OnDestroy {
  @Input() category: string = '';
  @Input() topK: number = 4;
  @Input() excludeVisited: boolean = false;
  @Input() showDebug: boolean = false;
  @Input() mode: 'category' | 'personalized' = 'category';

  recommendations: RecommendedCategory[] = [];
  loading = false;
  isPersonalized = false;

  private recoService = inject(RecommendationService);
  private router      = inject(Router);
  private sub?: Subscription;

  ngOnInit() {
    this.loadRecommendations();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['category'] && !changes['category'].firstChange) {
      this.loadRecommendations();
    }
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  loadRecommendations() {
    this.loading = true;
    this.recommendations = [];

    const obs =
      this.mode === 'personalized'
        ? this.recoService.getPersonalized(this.topK)
        : this.recoService.getByCategory(this.category, {
            topK: this.topK,
            excludeVisited: this.excludeVisited,
          });

    this.sub = obs.subscribe({
      next: (res: any) => {
        const data = res.data || res;
        this.recommendations = data.recommendations || [];
        this.isPersonalized = data.meta?.personalized ?? false;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  getProductImage(product: any): string | null {
    if (!product?.images?.length) return null;
    const img = product.images[0];
    return typeof img === 'string' ? img : img?.url ?? null;
  }

  // ✅ FIX : Navigation + tracking sans productId
  // - normalise la catégorie en lowercase pour matcher le backend (regex insensible)
  // - productId = null car c'est une navigation de catégorie, pas un produit
  navigateToCategory(category: string) {
    // 1. Normalise en lowercase (cohérent avec le $regex ^...$  i du backend)
    const normalizedCategory = category.toLowerCase().trim();

    // 2. Track la navigation (productId null = navigation, pas une vue produit)
    this.recoService.track({
      productId: null,
      category:  normalizedCategory,
      type:      'view',
      dwellTime: 0,
    }).subscribe();

    // 3. Redirige vers la liste filtrée
    this.router.navigate(['/products'], {
      queryParams: { category: normalizedCategory }
    });
  }

  loadMore() {
    this.recoService
      .getByCategory(this.category, { topK: this.topK + 4 })
      .subscribe((res: any) => {
        const data = res.data || res;
        this.recommendations = data.recommendations || [];
      });
  }
}
