export interface ImageObject {
  url: string;
  isMain?: boolean;
}

export interface Product {
  _id: string;                    // Important : MongoDB renvoie _id
  id?: number;                    // Compatibilité ancienne

  name: string;
  description: string;
  price: number;
  originalPrice?: number;

  featured?: boolean;
  salesCount?: number;

  images: string[] | ImageObject[];   // Accepte les deux formats

  category: string;
  subcategory: 'homme' | 'femme' | 'enfant' | 'accessoire';
  sizes: string[];
  colors: string[];
  inStock: boolean;               // ← Utilisé dans addToCart

  rating?: {
    average: number;
    count: number;
  };

  reviews?: number;
  tags: string[];
  createdAt: Date;
}
