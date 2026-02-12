export interface Product {
  id: number;
  name: string;
  description: string;
  price: number; // En dinar
  discountPrice?: number;
  images: string[];
  category: string;
  subcategory: 'homme' | 'femme' | 'enfant' | 'accessoire';
  sizes: string[];
  colors: string[];
  inStock: boolean;
  rating: number;
  reviews: number;
  tags: string[];
  createdAt: Date;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize: string;
  selectedColor: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  count: number;
  color: string;
  gradient: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  date: Date;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
}
