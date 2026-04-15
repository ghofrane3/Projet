import {
  Component, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { WishlistService } from '../../services/wishlist.service';
import { Product } from '../../models/product.model';
import { ReviewService } from '../../services/review.service';

interface SlideWord { t: string; italic?: boolean; }
interface Slide {
  img: string; tag: string;
  words: SlideWord[]; sub: string; cta: string;
}

interface Review {
  _id: string;
  user: { name: string; avatar?: string; };
  product: { _id: string; name: string; };
  rating: number;
  comment: string;
  createdAt: Date;
  helpful?: number;
}

interface ImageObject {
  url: string;
  isMain?: boolean;
  alt?: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DecimalPipe],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {

  ready = false;
  loading = true;

  announceIdx = 0;
  announcements = [
    'Livraison gratuite à partir de 99 DT',
    'Retours faciles sous 30 jours',
    'Nouveautés chaque semaine',
    'Paiement sécurisé · SSL'
  ];

  marqueeItems = [
    'Free Shipping Over 99 DT', 'New Arrivals Every Week', 'Premium Quality',
    'Easy Returns', 'Secure Checkout', 'Handpicked Selection',
    'Sustainable Fashion', 'Exclusive Members Offers'
  ];

  slideIdx = 0;
  slides: Slide[] = [
    {
      img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80',
      tag: 'Collection Été 2026',
      words: [{ t: 'Dress' }, { t: 'with', italic: true }, { t: 'intention' }],
      sub: 'Des pièces pensées pour durer — matières nobles, silhouettes précises, couleurs intemporelles.',
      cta: 'Explorer la collection'
    },
    {
      img: 'https://www.masculin.com/wp-content/uploads/sites/2/2020/07/vetements-homme-scaled.jpg',
      tag: 'Offres Spéciales · Jusqu\'à 50% OFF',
      words: [{ t: 'Summer' }, { t: 'Essentials', italic: true }],
      sub: 'Notre sélection estivale soigneusement éditée.',
      cta: 'Voir les offres'
    },
    {
      img: 'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?w=1600&h=1000&fit=crop',
      tag: 'Homme · Nouvelle Saison',
      words: [{ t: 'Effortless' }, { t: 'style', italic: true }],
      sub: 'Pour l\'homme moderne — coupes nettes, matières respirantes.',
      cta: 'Shop Homme'
    }
  ];

  cats = [
    {
      name: 'Femme',
      slug: 'femme',
      img: 'https://res.cloudinary.com/dn58shb9y/image/upload/v1776167794/fashion-store/products/robes/x2ix3worvx9hpfs3lw7o.jpg'
    },
    {
      name: 'Homme',
      slug: 'homme',
      img: 'https://res.cloudinary.com/dn58shb9y/image/upload/v1776167625/fashion-store/products/t-shirts/iiku9x5ggag4cnc4b39v.jpg'
    }
  ];

  popularTab = 'trending';
  popularTabs = [
    { id: 'trending',  label: 'Tendances',   icon: '🔥' },
    { id: 'top-rated', label: 'Mieux notés', icon: '⭐' },
  ];

  popularProducts: Product[] = [];
  shownPopular: Product[] = [];

  stats = [
    { value: '50K+', label: 'Clients satisfaits', icon: '👥' },
    { value: '4.9★', label: 'Note moyenne',       icon: '⭐' },
    { value: '1200+', label: 'Produits',          icon: '👗' },
    { value: '48h',  label: 'Livraison express',  icon: '🚚' },
  ];

  brands = ['Totême','A.P.C.','Arket','COS','Sandro','Maje','Jacquemus','& Other Stories'];

  editFeats = [
    { icon: '🚚', text: 'Livraison gratuite dès 99 DT · Express 24h' },
    { icon: '↩️', text: '30 jours pour changer d\'avis, sans frais' },
    { icon: '🌱', text: 'Matières sélectionnées & production responsable' },
  ];

  reviews: Review[] = [];
  reviewsLoading = true;

  email = '';
  nlPerks = ['10% sur votre 1ère commande', 'Accès aux ventes privées', 'Conseils style exclusifs'];

  toastOn = false;
  toastMsg = '';

  private _slideTimer: any;
  private _announceTimer: any;
  private _toastTimer: any;

  constructor(
    private router: Router,
    private cartService: CartService,
    private productService: ProductService,
    private wishlistService: WishlistService,
    private reviewService: ReviewService
  ) {}

  ngOnInit(): void {
    setTimeout(() => (this.ready = true), 60);
    this.loadPopularProducts();
    this.loadReviews();
    this.startSlide();
    this.startAnnounce();
  }

  ngOnDestroy(): void {
    clearInterval(this._slideTimer);
    clearInterval(this._announceTimer);
    clearTimeout(this._toastTimer);
  }

  private loadPopularProducts(): void {
    this.loading = true;
    this.productService.getTrendingProducts(8).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.popularProducts = response.products || [];
          this.setPopularTab('trending');
          this.loading = false;
        }
      },
      error: (err) => {
        console.error('Erreur chargement produits populaires:', err);
        this.loading = false;
      }
    });
  }

  setPopularTab(id: string): void {
    this.popularTab = id;
    const sorted = [...this.popularProducts];

    if (id === 'trending') {
      this.shownPopular = sorted.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
    } else {
      this.shownPopular = sorted.sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));
    }
  }

  private loadReviews(): void {
    this.reviewsLoading = true;
    this.reviewService.getFeaturedReviews(6).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.reviews = response.reviews || [];
          this.reviewsLoading = false;
        }
      },
      error: (err) => {
        console.error('Erreur chargement avis:', err);
        this.reviewsLoading = false;
        this.reviews = this.getDefaultReviews();
      }
    });
  }

  private getDefaultReviews(): Review[] {
    return [
      { _id: '1', user: { name: 'Amira B.' }, product: { _id: '1', name: 'Robe Lin Naturel' }, rating: 5, comment: 'Qualité irréprochable, coupe parfaite. Je recommande vivement !', createdAt: new Date(), helpful: 24 },
      { _id: '2', user: { name: 'Karim T.' }, product: { _id: '2', name: 'Chemise Oxford Slim' }, rating: 5, comment: 'Enfin une chemise qui tient ses promesses. Matière premium et coupe impeccable.', createdAt: new Date(), helpful: 18 },
      { _id: '3', user: { name: 'Sana M.' }, product: { _id: '3', name: 'Sac Cuir Naturel' }, rating: 5, comment: 'Le sac est encore plus beau en vrai. Cuir de qualité, finitions parfaites.', createdAt: new Date(), helpful: 31 }
    ];
  }

  goToReviews(): void {
    this.router.navigate(['/reviews']);
  }

  getRatingStars(rating: number): number[] {
    const full = Math.floor(rating);
    return Array(5).fill(0).map((_, i) =>
      i < full ? 1 : (i === full && rating % 1 >= 0.5 ? 0.5 : 0)
    );
  }

  getRatingPercent(rating: number): number {
    return (rating / 5) * 100;
  }

  private getPlaceholderImage(): string {
    return 'https://res.cloudinary.com/dn58shb9y/image/upload/v1/placeholder.jpg';
  }

  getProductMainImage(product: Product): string {
    if (!product.images || product.images.length === 0) {
      return this.getPlaceholderImage();
    }

    const mainImg = product.images.find((img): img is ImageObject =>
      typeof img === 'object' && img !== null && 'isMain' in img && img.isMain === true
    );

    if (mainImg?.url) return mainImg.url;

    const first = product.images[0];
    return typeof first === 'string' ? first : (first?.url || this.getPlaceholderImage());
  }

  getProductSecondImage(product: Product): string {
    if (!product.images || product.images.length < 2) {
      return this.getProductMainImage(product);
    }

    const second = product.images[1];
    return typeof second === 'string' ? second : (second?.url || this.getProductMainImage(product));
  }

  getProductDiscount(product: Product): number {
    if (product.originalPrice && product.originalPrice > product.price) {
      return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    }
    return 0;
  }

  isProductOnSale(product: Product): boolean {
    return !!(product.originalPrice && product.originalPrice > product.price);
  }

  getUserInitials(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Wishlist
  isInWishlist(productId: string | number | undefined): boolean {
    if (!productId) return false;
    return this.wishlistService.isInWishlist(String(productId));
  }

  addToCart(product: Product, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!product.inStock) {
      this.toast('Produit en rupture de stock');
      return;
    }

    const size = product.sizes && product.sizes.length > 0 ? product.sizes[0] : 'Unique';

    this.cartService.addToCart(product, 1, size, 'Standard');
    this.toast(`"${product.name}" ajouté au panier ✓`);
  }

  toggleWishlist(product: Product, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const productId = (product._id || product.id)?.toString();
    if (!productId) return;

    if (this.wishlistService.isInWishlist(productId)) {
      this.wishlistService.removeFromWishlist(productId);
      this.toast('Retiré des favoris');
    } else {
      this.wishlistService.addToWishlist(product);
      this.toast('Ajouté aux favoris ♥');
    }
  }

  subscribe(e: Event): void {
    e.preventDefault();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email || !this.email.trim()) {
      this.toast('Veuillez entrer votre email');
      return;
    }
    if (re.test(this.email)) {
      this.toast('Inscription confirmée ! 🎉');
      this.email = '';
    } else {
      this.toast('Email invalide');
    }
  }

  private toast(msg: string): void {
    this.toastMsg = msg;
    this.toastOn = true;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastOn = false, 3000);
  }

  private startSlide(): void {
    this._slideTimer = setInterval(() => {
      this.slideIdx = (this.slideIdx + 1) % this.slides.length;
    }, 6000);
  }

  goSlide(i: number): void {
    this.slideIdx = i;
    clearInterval(this._slideTimer);
    this.startSlide();
  }

  private startAnnounce(): void {
    this._announceTimer = setInterval(() => {
      this.announceIdx = (this.announceIdx + 1) % this.announcements.length;
    }, 4000);
  }
}
