import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/product.model';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.scss']
})
export class ProductListComponent implements OnInit {
  products: Product[] = [];
  categories: any[] = [];
  selectedCategory: string = 'all';
  sortBy: string = 'default';

  constructor(
    private productService: ProductService,
    private cartService: CartService,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    this.products = this.productService.getProducts();
    this.categories = this.productService.getCategories();
      this.api.getProducts().subscribe(data => {
    console.log(data);
  });
  }

  addToCart(product: Product): void {
    this.cartService.addToCart(product, 1, product.sizes[0], product.colors[0]);
  }

  filterByCategory(category: string): void {
    this.selectedCategory = category;
    if (category === 'all') {
      this.products = this.productService.getProducts();
    } else {
      this.products = this.productService.getProductsByCategory(category);
    }
  }

  sortProducts(event: any): void {
    this.sortBy = event.target.value;

    switch(this.sortBy) {
      case 'price-low':
        this.products.sort((a, b) => {
          const priceA = a.discountPrice || a.price;
          const priceB = b.discountPrice || b.price;
          return priceA - priceB;
        });
        break;
      case 'price-high':
        this.products.sort((a, b) => {
          const priceA = a.discountPrice || a.price;
          const priceB = b.discountPrice || b.price;
          return priceB - priceA;
        });
        break;
      case 'rating':
        this.products.sort((a, b) => b.rating - a.rating);
        break;
      default:
        this.products.sort((a, b) => a.id - b.id);
    }
  }

  getDiscountPercentage(product: Product): number {
    if (!product.discountPrice) return 0;
    return Math.round(((product.price - product.discountPrice) / product.price) * 100);
  }
}
