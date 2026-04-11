export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  address?: string;
  city?: string;
  zipCode?: string;
  avatar?: string;
  role: 'client' | 'admin';
  createdAt: Date;
  ordersCount: number;
  totalSpent: number;
  isActive: boolean;
}

export interface Order {
  id: string;
  userId: number;
  items: OrderItem[];
  total: number;
  shippingAddress: Address;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  createdAt: Date;
  deliveredAt?: Date;
}

export interface OrderItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  size: string;
  color: string;
  image: string;
}

export interface Address {
  street: string;
  city: string;
  zipCode: string;
  country: string;
}

export interface Review {
  id: number;
  userId: number;
  productId: number;
  rating: number;
  comment: string;
  date: Date;
}

export interface WishlistItem {
  id: number;
  userId: number;
  productId: number;
  addedAt: Date;
}
