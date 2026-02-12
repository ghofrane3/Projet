import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { Product } from '../../models/product.model';
import { Category } from '../../models/product.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']

})
export class HomeComponent implements OnInit {
  // Données depuis le service
  categories: Category[] = [];
  featuredProducts: Product[] = [];
  newArrivals: Product[] = [];
  discountedProducts: Product[] = [];

  // Données pour le slider
  slides = [
    {
      image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&h=800&fit=crop',
      title: 'Style Printemps 2026',
      subtitle: 'Découvrez les dernières tendances mode pour cette saison',
      badge: 'Nouvelle Collection',
      link: '/category/homme',
      buttonText: 'Explorer la collection'
    },
    {
      image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&h=800&fit=crop',
      title: 'Soldes d\'Été',
      subtitle: 'Jusqu\'à 70% de réduction sur toute la collection',
      badge: 'Promotion',
      link: '/products',
      buttonText: 'Voir les offres'
    },
    {
      image: 'https://images.unsplash.com/photo-1558769132-cb1c458e4222?w=1200&h=800&fit=crop',
      title: 'Nouveautés Femme',
      subtitle: 'Découvrez les dernières pièces de la saison',
      badge: 'Exclusivité',
      link: '/category/femme',
      buttonText: 'Découvrir'
    }
  ];

  currentSlide = 0;
  newsletterEmail = '';

  constructor(
    private cartService: CartService,
    private productService: ProductService
  ) {}

  ngOnInit(): void {
    // Récupérer les données depuis les services
    this.categories = this.productService.getCategories();
    this.featuredProducts = this.productService.getFeaturedProducts();
    this.newArrivals = this.productService.getNewArrivals();
    this.discountedProducts = this.productService.getDiscountedProducts();

    // Démarrer le slider automatique
    this.startAutoSlide();
  }

  // Méthodes pour le slider
  startAutoSlide(): void {
    setInterval(() => {
      this.nextSlide();
    }, 5000);
  }

  nextSlide(): void {
    this.currentSlide = (this.currentSlide + 1) % this.slides.length;
  }

  prevSlide(): void {
    this.currentSlide = (this.currentSlide - 1 + this.slides.length) % this.slides.length;
  }

  goToSlide(index: number): void {
    this.currentSlide = index;
  }

  // Méthodes pour les produits
  getDiscountPercentage(product: Product): number {
    if (!product.discountPrice) return 0;
    const discount = ((product.price - product.discountPrice) / product.price) * 100;
    return Math.round(discount);
  }

  addToCart(product: Product): void {
    // Ajouter la taille et la couleur par défaut
    const cartItem = {
      product: product,
      quantity: 1,
      selectedSize: product.sizes && product.sizes.length > 0 ? product.sizes[0] : 'Unique',
      selectedColor: product.colors && product.colors.length > 0 ? product.colors[0] : 'Standard'
    };

    this.cartService.addToCart(product, 1, cartItem.selectedSize, cartItem.selectedColor);
    this.showNotification(`${product.name} ajouté au panier`);
  }

  addToWishlist(product: Product): void {
    // Logique pour ajouter à la wishlist
    this.showNotification(`${product.name} ajouté à la liste de souhaits`);
  }

  quickView(product: Product): void {
    // Logique pour la vue rapide (modal)
    console.log('Vue rapide:', product);
    // Ici vous pourriez ouvrir un modal avec les détails du produit
  }

  // Méthode pour afficher les couleurs disponibles
  getColorStyles(color: string): any {
    // Convertir les noms de couleurs en codes hex si nécessaire
    const colorMap: { [key: string]: string } = {
      'Bleu': '#2196F3',
      'Blanc': '#FFFFFF',
      'Noir': '#000000',
      'Rose': '#E91E63',
      'Jaune': '#FFEB3B',
      'Beige': '#F5F5DC',
      'Kaki': '#8B4513',
      'Bordeaux': '#800000',
      'Vert': '#4CAF50',
      'Rouge': '#F44336',
      'Gris': '#9E9E9E',
      'Marron': '#795548',
      'Marine': '#3F51B5',
      'Doré': '#FFD700',
      'Argenté': '#C0C0C0'
    };

    return {
      'background-color': colorMap[color] || color,
      'border': color === 'Blanc' ? '1px solid #ddd' : 'none'
    };
  }

  // Méthode pour l'inscription newsletter
  subscribeNewsletter(): void {
    if (this.validateEmail(this.newsletterEmail)) {
      this.showNotification('Merci pour votre inscription à la newsletter !');
      this.newsletterEmail = '';
    } else {
      this.showNotification('Veuillez entrer un email valide');
    }
  }

  // Validation email
  private validateEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  // Méthode pour afficher les notifications
  private showNotification(message: string): void {
    // Vous pouvez implémenter un service de notification ou utiliser un toast
    alert(message); // Solution simple pour l'instant
  }

  // Méthode pour obtenir les produits populaires (les mieux notés)
  getPopularProducts(): Product[] {
    return [...this.featuredProducts].sort((a, b) => b.rating - a.rating);
  }

}
