import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule }   from '@angular/router';
import { FormsModule }    from '@angular/forms';
import { CartService }    from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { Product }        from '../../models/product.model';

interface SlideWord { t: string; italic?: boolean; }
interface Slide {
  img: string; tag: string;
  words: SlideWord[]; sub: string; cta: string;
}

interface DemoProd {
  id: number; name: string; cat: string;
  img: string; img2: string;
  price: number; was?: number;
  sizes: string[]; isNew?: boolean; isSale?: boolean; off?: number;
  fav: boolean;
  group: string; // for tabs
  brand?: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DecimalPipe],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {

  // ─── load
  ready = false;

  // ─── announcement
  announceIdx = 0;
  announcements = [
    'Livraison gratuite à partir de 99 DT',
    'Retours faciles sous 30 jours',
    'Nouveautés chaque semaine',
    'Paiement sécurisé · SSL'
  ];

  // ─── hero slider
  slideIdx = 0;
  slides: Slide[] = [
    {
      img: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80',
      tag: 'Collection Été 2026',
      words: [
        { t: 'Dress' },
        { t: 'with', italic: true },
        { t: 'intention' }
      ],
      sub: 'Des pièces pensées pour durer — matières nobles, silhouettes précises, couleurs intemporelles.',
      cta: 'Explorer la collection'
    },
    {
      img: 'https://www.masculin.com/wp-content/uploads/sites/2/2020/07/vetements-homme-scaled.jpg',
      tag: 'Offres Spéciales · Jusqu\'à 50% OFF',
      words: [
        { t: 'Summer' },
        { t: 'Essentials', italic: true },
      ],
      sub: 'Notre sélection estivale soigneusement éditée. Tout ce qu\'il vous faut pour la saison.',
      cta: 'Voir les offres'
    },
    {
      img: 'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?w=1600&h=1000&fit=crop',
      tag: 'Homme · Nouvelle Saison',
      words: [
        { t: 'Effortless' },
        { t: 'style', italic: true },
      ],
      sub: 'Pour l\'homme moderne — coupes nettes, matières respirantes, palette sobre et sophistiquée.',
      cta: 'Shop Homme'
    }
  ];

  // ─── marquee
  marqueeItems = [
    'Free Shipping Over 99 DT',
    'New Arrivals Every Week',
    'Premium Quality',
    'Easy Returns',
    'Secure Checkout',
    'Handpicked Selection',
    'Sustainable Fashion',
    'Exclusive Members Offers'
  ];

  // ─── categories
  cats = [
    {
      name: 'Femme',
      slug: 'femme',
      img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900&h=1200&fit=crop&crop=top'
    },
    {
      name: 'Homme',
      slug: 'homme',
      img: 'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?w=600&h=400&fit=crop'
    },
    {
      name: 'Accessoires',
      slug: 'accessoire',
      img: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&h=400&fit=crop'
    },
    {
      name: 'Enfant',
      slug: 'enfant',
      img: 'https://images.unsplash.com/photo-1543087903-1ac2364fd7aa?w=600&h=400&fit=crop'
    },
    {
      name: 'Sport',
      slug: 'sport',
      img: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=600&h=400&fit=crop'
    }
  ];

  // ─── products
  tab  = 'all';
  tabs = [
    { id: 'all',   label: 'Tout'       },
    { id: 'femme', label: 'Femme'      },
    { id: 'homme', label: 'Homme'      },
    { id: 'new',   label: 'Nouveautés' },
    { id: 'sale',  label: 'Soldes'     },
  ];

  private allProds: DemoProd[] = [
    {
      id: 1, name: 'Robe Lin Naturel',       cat: 'Femme',
      group: 'femme', isNew: true,
      img:  'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500&h=660&fit=crop',
      price: 89.90, sizes: ['XS','S','M','L'], fav: false
    },
    {
      id: 2, name: 'Blazer Structuré Écru',  cat: 'Femme',
      group: 'femme', isSale: true, off: 30,
      img:  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=660&fit=crop',
      price: 99.90, was: 142.00, sizes: ['XS','S','M','L','XL'], fav: false
    },
    {
      id: 3, name: 'Chemise Oxford Slim',    cat: 'Homme',
      group: 'homme', isNew: true,
      img:  'https://images.unsplash.com/photo-1602810316693-3667c854239a?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1594938298603-c8148c4b400b?w=500&h=660&fit=crop',
      price: 65.00, sizes: ['S','M','L','XL','XXL'], fav: false
    },
    {
      id: 4, name: 'Jean Fuselé Brut',       cat: 'Homme',
      group: 'homme',
      img:  'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1613677135043-a2512fbf49fa?w=500&h=660&fit=crop',
      price: 79.90, sizes: ['30','32','34','36','38'], fav: false
    },
    {
      id: 5, name: 'Sac Cuir Naturel',       cat: 'Accessoires',
      group: 'femme', isSale: true, off: 25,
      img:  'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1524498250077-390f9e378fc0?w=500&h=660&fit=crop',
      price: 119.00, was: 159.00, sizes: ['Unique'], fav: false
    },
    {
      id: 6, name: 'Robe Midi Satinée',      cat: 'Femme',
      group: 'new', isNew: true,
      img:  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=500&h=660&fit=crop',
      price: 109.00, sizes: ['XS','S','M','L'], fav: false
    },
    {
      id: 7, name: 'Polo Piqué Premium',     cat: 'Homme',
      group: 'new', isNew: true,
      img:  'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?w=500&h=660&fit=crop',
      price: 55.00, sizes: ['S','M','L','XL'], fav: false
    },
    {
      id: 8, name: 'Manteau Camel Long',     cat: 'Femme',
      group: 'sale', isSale: true, off: 40,
      img:  'https://images.unsplash.com/photo-1544966503-7cc5ac882d5d?w=500&h=660&fit=crop',
      img2: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=500&h=660&fit=crop',
      price: 179.00, was: 299.00, sizes: ['XS','S','M','L'], fav: false
    },
  ];

  shown: DemoProd[] = [];

  // ─── new arrivals
  newArr: DemoProd[] = [];

  // ─── brands
  brands = ['Totême','A.P.C.','Arket','COS','Sandro',
            'Maje','Jacquemus','& Other Stories',
            'Totême','A.P.C.','Arket','COS','Sandro',
            'Maje','Jacquemus','& Other Stories'];

  // ─── editorial feats
  editFeats = [
    { icon: '🚚', text: 'Livraison gratuite dès 99 DT · Express 24h' },
    { icon: '↩️', text: '30 jours pour changer d\'avis, sans frais' },
    { icon: '🌱', text: 'Matières sélectionnées & production responsable' },
  ];

  // ─── reviews
  reviews = [
    {
      name: 'Amira B.', prod: 'Robe Lin Naturel',
      text: 'Qualité irréprochable, coupe parfaite. Le tissu est doux et la robe tombe exactement comme prévu. Je recommande vivement !'
    },
    {
      name: 'Karim T.', prod: 'Chemise Oxford Slim',
      text: 'Enfin une chemise qui tient ses promesses. Tissu de qualité, coupe slim qui reste confortable. Je reviendrai très vite.'
    },
    {
      name: 'Sana M.', prod: 'Sac Cuir Naturel',
      text: 'Le sac est encore plus beau en vrai. Le cuir est magnifique, les finitions soignées. Livraison rapide, emballage soigné.'
    }
  ];

  // ─── newsletter
  email   = '';
  nlPerks = ['10% sur votre 1ère commande', 'Accès aux ventes privées', 'Conseils style exclusifs'];

  // ─── toast
  toastOn  = false;
  toastMsg = '';

  // ─── timers
  private _slideTimer: any;
  private _announceTimer: any;
  private _toastTimer: any;

  constructor(
    private cartService: CartService,
    private productService: ProductService
  ) {}

  ngOnInit(): void {
    setTimeout(() => (this.ready = true), 60);

    // Load products from service if available
    this.loadProducts();

    // Sliders
    this.startSlide();
    this.startAnnounce();
  }

  ngOnDestroy(): void {
    clearInterval(this._slideTimer);
    clearInterval(this._announceTimer);
    clearTimeout(this._toastTimer);
  }

  // ─── products ─────────────────────────────────
  private loadProducts(): void {
    try {
      const ps = this.productService.getFeaturedProducts?.() as any[] || [];
      if (ps.length > 0) {
        this.allProds = ps.slice(0, 8).map((p: any, i: number) => ({
          id: p.id,
          name: p.name,
          cat: p.category,
          group: p.category,
          img:  p.images?.[0] || this.allProds[i % this.allProds.length]?.img,
          img2: p.images?.[1] || this.allProds[i % this.allProds.length]?.img2,
          price: p.discountPrice || p.price,
          was:   p.discountPrice ? p.price : undefined,
          sizes: p.sizes || ['S','M','L'],
          isNew:  p.tags?.includes('nouveau'),
          isSale: !!p.discountPrice,
          off:   p.discountPrice
            ? Math.round(((p.price - p.discountPrice) / p.price) * 100)
            : 0,
          fav: false
        }));
      }
    } catch { /* keep demo */ }

    this.newArr = this.allProds.filter(p => p.isNew).slice(0, 4);
    if (!this.newArr.length) this.newArr = this.allProds.slice(0, 4);
    this.setTab('all');
  }

  setTab(id: string): void {
    this.tab = id;
    this.shown = id === 'all'  ? this.allProds :
                 id === 'new'  ? this.allProds.filter(p => p.isNew) :
                 id === 'sale' ? this.allProds.filter(p => p.isSale) :
                                 this.allProds.filter(p => p.group === id);
    if (!this.shown.length) this.shown = this.allProds;
  }

  // ─── hero ──────────────────────────────────────
  private startSlide(): void {
    this._slideTimer = setInterval(() => {
      this.slideIdx = (this.slideIdx + 1) % this.slides.length;
    }, 6000);
  }

  goSlide(i: number): void {
    this.slideIdx = i;
    clearInterval(this._slideTimer);
    this._slideTimer = setInterval(() => {
      this.slideIdx = (this.slideIdx + 1) % this.slides.length;
    }, 6000);
  }

  // ─── announce ──────────────────────────────────
  private startAnnounce(): void {
    this._announceTimer = setInterval(() => {
      this.announceIdx = (this.announceIdx + 1) % this.announcements.length;
    }, 4000);
  }

  // ─── actions ───────────────────────────────────
  cart(p: DemoProd): void {
    try {
      this.cartService.addToCart(
        { id: p.id, name: p.name, price: p.price } as Product,
        1,
        p.sizes[0] || 'Unique',
        'Standard'
      );
    } catch {}
    this.toast(`"${p.name}" ajouté au panier`);
  }

  wish(p: DemoProd): void {
    p.fav = !p.fav;
    this.toast(p.fav ? `Sauvegardé dans vos favoris` : `Retiré des favoris`);
  }

  subscribe(e: Event): void {
    e.preventDefault();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (re.test(this.email)) {
      this.toast('Inscription confirmée — bienvenue !');
      this.email = '';
    } else {
      this.toast('Veuillez saisir une adresse e-mail valide.');
    }
  }

  // ─── toast ─────────────────────────────────────
  private toast(msg: string): void {
    this.toastMsg = msg;
    this.toastOn  = true;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => (this.toastOn = false), 3000);
  }
}
