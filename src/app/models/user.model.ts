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

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface TrackingEvent {
  status: OrderStatus;
  label: string;
  description: string;
  date: Date | null;
  completed: boolean;
  icon: string;
}

export interface ShippingAddress {
  street: string;
  city: string;
  zipCode: string;
  country: string;
  fullName?: string;
  phone?: string;
}

export interface OrderItem {
  productId: string | number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  size?: string;
  color?: string;
}

export interface Order {
  _id?: string | any;  // ou mongoose.Types.ObjectId si tu importes le type

id: string;
  userId: number;
  items: OrderItem[];
  total: number;
  subtotal?: number;
  shippingCost?: number;
  shippingAddress: ShippingAddress;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId?: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  createdAt: Date;
  updatedAt?: Date;
  deliveredAt?: Date;
  notes?: string;
}

export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; description: string; icon: string; color: string }
> = {
  pending: {
    label: 'Commande reçue',
    description: 'Votre commande a été enregistrée',
    icon: '●',
    color: 'amber',
  },
  processing: {
    label: 'En préparation',
    description: 'Nous préparons votre commande',
    icon: '●',
    color: 'blue',
  },
  shipped: {
    label: 'Expédiée',
    description: 'Votre commande est en route',
    icon: '●',
    color: 'purple',
  },
  delivered: {
    label: 'Livrée',
    description: 'Votre commande est arrivée',
    icon: '●',
    color: 'green',
  },
  cancelled: {
    label: 'Annulée',
    description: 'Cette commande a été annulée',
    icon: '●',
    color: 'red',
  },
};

export function buildTimeline(order: Order): TrackingEvent[] {
  const flow: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

  if (order.status === 'cancelled') {
    return [
      {
        status: 'pending',
        label: 'Commande reçue',
        description: 'Commande enregistrée',
        date: order.createdAt ? new Date(order.createdAt) : null,
        completed: true,
        icon: '●',
      },
      {
        status: 'cancelled',
        label: 'Annulée',
        description: 'Cette commande a été annulée',
        date: order.updatedAt ? new Date(order.updatedAt) : null,
        completed: true,
        icon: '✕',
      },
    ];
  }

  const currentIndex = flow.indexOf(order.status);

  return flow.map((status, index) => {
    const config = ORDER_STATUS_CONFIG[status];
    return {
      status,
      label: config.label,
      description: config.description,
      date: index === 0 && order.createdAt
        ? new Date(order.createdAt)
        : index < currentIndex && order.updatedAt
        ? new Date(order.updatedAt)
        : status === 'delivered' && order.deliveredAt
        ? new Date(order.deliveredAt)
        : null,
      completed: index <= currentIndex,
      icon: config.icon,
    };
  });
}
