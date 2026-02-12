import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/product.model';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './category.component.html',
  styleUrls: ['./category.component.scss']
})
export class CategoryComponent implements OnInit {
  products: Product[] = [];
  subcategory: string = '';
  categoryName: string = '';

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private cartService: CartService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.subcategory = params['subcategory'];
      this.loadProducts();
      this.setCategoryName();
    });
  }

  loadProducts(): void {
    this.products = this.productService.getProductsBySubcategory(this.subcategory);
  }

  setCategoryName(): void {
    const names: {[key: string]: string} = {
      'homme': 'Collection Homme',
      'femme': 'Collection Femme',
      'enfant': 'Collection Enfant',
      'accessoire': 'Accessoires'
    };
    this.categoryName = names[this.subcategory] || 'Catégorie';
  }

  getCategoryGradient(): string {
    const gradients: {[key: string]: string} = {
      'homme': 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
      'femme': 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
      'enfant': 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
      'accessoire': 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
    };
    return gradients[this.subcategory] || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  }

  addToCart(product: Product): void {
    this.cartService.addToCart(product);
  }

  getDiscountPercentage(product: Product): number {
    if (!product.discountPrice) return 0;
    return Math.round(((product.price - product.discountPrice) / product.price) * 100);
  }
}
