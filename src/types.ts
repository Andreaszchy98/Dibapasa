export interface Category {
  id: string;
  name: string;
  subcategories: string[];
  imageUrl?: string;
  isHidden?: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  price: number;
  description?: string;
  imageUrl?: string;
  stock: number;
  reserved: number;
  unit?: 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja';
  approxWeight?: number;
  isDeleted?: boolean;
  isHidden?: boolean;
  piecesPerJaba?: number;
}

export interface InventoryRequest {
  id: string;
  productId: string;
  productName: string;
  type: 'update' | 'waste';
  oldValue: number;
  newValue: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByName: string;
  createdAt: any;
}

export interface AppNotification {
  id: string;
  userId: string; // Target user
  title: string;
  message: string;
  type: 'order' | 'inventory' | 'system';
  read: boolean;
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'client' | 'company' | 'admin' | 'dispatcher' | 'preparer' | 'driver' | 'loader' | 'store_sales' | 'inventory';
  viewAs?: 'client' | 'company' | 'admin' | 'dispatcher' | 'preparer' | 'driver' | 'loader' | 'store_sales' | 'inventory';
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  unit?: 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja';
  approxWeight?: number;
  preparerWeight?: number;
  loaderWeight?: number;
}

export interface Order {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'accepted' | 'processing' | 'ready' | 'shipped' | 'delivered' | 'cancelled' | 'completed';
  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
  address: string;
  location?: {
    lat: number;
    lng: number;
  };
  paymentStatus: 'pending' | 'paid' | 'failed';
  paymentMethod: 'cash' | 'card' | 'online' | 'card_on_delivery';
  deliverySlot?: string; // e.g., "2026-04-03 08:00-10:00"
  deliveryWindowStart?: string; // HH:mm format
  deliveryWindowEnd?: string; // HH:mm format
  deliveryWindowNote?: string;
  type: 'delivery' | 'pickup';
  pickupCode: string;
  driverId?: string;
  routeId?: string;
  placedBy?: string;
  eta?: string;
  driverLocation?: {
    lat: number;
    lng: number;
  };
  onboarded?: boolean;
  deliveryFee?: number;
  deliveryDistance?: number;
  adjustedTotal?: number;
  hasReturns?: boolean;
  returnedItems?: OrderItem[];
  isExchange?: boolean;
  arrivedAt?: any;
  reviewedAt?: any;
  dispatchedAt?: any;
  preparedAt?: any;
  deliveredAt?: any;
  paidAt?: any;
  weightValidated?: boolean;
}

export interface DeliveryRoute {
  id: string;
  name: string;
  unitNumber: string;
  driverId: string;
  status: 'active' | 'in_progress' | 'completed' | 'cancelled';
  orderIds: string[];
  releasedToPrep?: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface AppSettings {
  logoUrl?: string;
  appName?: string;
  shopAddress?: string;
  shopLat?: number;
  shopLng?: number;
}

export interface Return {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    price: number;
    reason: string;
    photoUrl: string;
  }>;
  totalReduction: number;
  status: 'pending' | 'approved' | 'rejected';
  resolution: 'none' | 'waste' | 'stock';
  createdAt: any;
  processedAt?: any;
}

export type Page = 'home' | 'cart' | 'current-order' | 'history' | 'profile' | 'checkout' | 'admin-dashboard' | 'admin-users' | 'admin-orders' | 'dispatcher-view' | 'dispatcher-history' | 'preparer-view' | 'preparer-history' | 'driver-view' | 'driver-history' | 'inventory-view' | 'admin-notifications' | 'admin-inventory-tracking' | 'admin-returns' | 'loader-view' | 'loader-history' | 'admin-settings' | 'product-detail' | 'admin-categories' | 'store-sales-view' | 'store-ticket';
