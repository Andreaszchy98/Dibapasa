import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, onSnapshot, query, where, orderBy, addDoc, updateDoc, serverTimestamp, getDocFromServer, deleteDoc, deleteField, limit, startAfter, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { auth, db, storage, sRef, uploadBytes, getDownloadURL, deleteObject, uploadImage, signInWithGoogle, logout, handleFirestoreError, OperationType, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile } from './firebase';
import { Product, UserProfile, Order, Page, OrderItem, InventoryRequest, AppNotification, AppSettings, Category, Return, DeliveryRoute } from './types';
import { CATEGORIES, INITIAL_PRODUCTS, COLORS, JABA_CONFIG } from './constants';
import { Search, ShoppingCart, Home as HomeIcon, ClipboardList, History, User as UserIcon, Plus, Minus, ChevronRight, MapPin, CreditCard, CheckCircle2, Loader2, LogOut, Package, Users, ArrowLeft, X, Settings, ShieldCheck, Edit, Check, Bell, AlertTriangle, Trash2, CheckCircle, Truck, Phone, FileText, Image, Tags, Printer, ChevronDown, ChevronUp, Banknote, Mail, Locate, Navigation, Camera, RotateCcw, Calendar, Info, PackageCheck, PackageOpen, Clock, Download, ExternalLink, Store, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { OSMMap } from './components/OSMMap';
import { searchOSMPlaces, reverseOSMGeocode, reverseOSMDetails, getOSRMRoute, OSMPlace, RouteResult, calculateStraightDistance } from './lib/osm';

import { generateInvoicePDF } from './lib/invoice';
import { fileToBase64, compressImage, compressImageToBlob, transformImageUrl, sortOrdersByWindowAndDistance } from './lib/utils';

const SHOP_LOCATION = {
  address: "Calle Torreón 2220, Francisco Villa, 82127 Mazatlán, Sin.",
  lat: 23.2422,
  lng: -106.4024
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  return calculateStraightDistance(lat1, lon1, lat2, lon2);
}

function getDeliveryFee(roadDistance: number) {
  // Ahora usamos la distancia real por carretera (kilómetros de conducción)
  if (roadDistance <= 3) return 30; // Mínimo para distancias muy cortas
  if (roadDistance <= 5) return 45;
  if (roadDistance <= 7) return 60;
  if (roadDistance <= 9) return 75;
  if (roadDistance <= 11) return 95;
  if (roadDistance <= 13) return 115;
  if (roadDistance <= 15) return 140;
  return 180;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const KLogo = ({ size = 'w-10 h-10', className, logoUrl }: { size?: string, className?: string, logoUrl?: string }) => (
  <div className={cn(size, "rounded-xl flex items-center justify-center text-white font-black shadow-sm shrink-0 overflow-hidden", (!logoUrl || !logoUrl.trim()) && "bg-blue-900", className)}>
    {logoUrl && logoUrl.trim() ? (
      <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
    ) : (
      "D"
    )}
  </div>
);

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Algo salió mal.";
      let isQuotaError = false;
      try {
        const errInfo = JSON.parse(this.state.error.message);
        if (errInfo.error) {
          message = errInfo.error;
          if (message.includes('Quota limit exceeded')) {
            isQuotaError = true;
            message = "Se ha alcanzado el límite de uso diario gratuito de la base de datos. Este límite se reinicia automáticamente cada 24 horas.";
          }
        }
      } catch (e) {
        message = this.state.error.message || message;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100 text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{isQuotaError ? "Límite de Cuota Alcanzado" : "¡Ups!"}</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            {isQuotaError ? (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">Puedes seguir usando la aplicación con los datos guardados localmente en algunos casos, o esperar al reinicio de la cuota.</p>
                <Button onClick={() => window.location.reload()} className="w-full">Reintentar</Button>
              </div>
            ) : (
              <Button onClick={() => window.location.reload()} className="w-full">Reintentar</Button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Button = ({ className, variant = 'primary', size = 'md', ...props }: any) => {
  const variants: any = {
    primary: 'bg-blue-900 text-white hover:bg-blue-950',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    outline: 'border-2 border-blue-900 text-blue-900 hover:bg-blue-900 hover:text-white',
    ghost: 'text-gray-600 hover:bg-gray-100'
  };
  const sizes: any = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  return (
    <button 
      className={cn('rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none', variants[variant], sizes[size], className)} 
      {...props} 
    />
  );
};

const Input = ({ className, ...props }: any) => (
  <input 
    className={cn('w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all', className)} 
    {...props} 
  />
);

// --- Main App ---

export default function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOnlineStatus, setShowOnlineStatus] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOnlineStatus(true);
      setTimeout(() => setShowOnlineStatus(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Estás sin conexión. Los datos podrían estar desactualizados.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial server check
    const checkActualConnection = async () => {
      try {
        await getDocFromServer(doc(db, '_health', 'check'));
      } catch (error: any) {
        if (error.message?.includes('offline')) {
          setIsOnline(false);
        }
      }
    };
    checkActualConnection();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const saved = localStorage.getItem('currentPage');
    return (saved as Page) || 'home';
  });
  const [adminOrderFilter, setAdminOrderFilter] = useState<Order['status'] | 'all'>('all');
  const [adminSelectedDate, setAdminSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [adminPeriod, setAdminPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [cart, setCart] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : {};
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [sortBy, setSortBy] = useState<'name' | 'sales'>('name');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]); // For admin
  const [lastOrderDoc, setLastOrderDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const [isFetchingOrders, setIsFetchingOrders] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]); // For admin
  const [allRoutes, setAllRoutes] = useState<DeliveryRoute[]>([]); // For dispatcher/loader
  const [allReturns, setAllReturns] = useState<Return[]>([]); // For admin
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cached = localStorage.getItem('dibapasa_cached_products');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_PRODUCTS;
  });
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);
  const [hasLoadedAllProducts, setHasLoadedAllProducts] = useState(false);
  const [inventoryRequests, setInventoryRequests] = useState<InventoryRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const cached = localStorage.getItem('dibapasa_cached_categories');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return CATEGORIES.filter(c => c !== 'Todos').map(name => ({ id: name, name, subcategories: [] }));
  });
  const [settings, setSettings] = useState<AppSettings | null>(() => {
    try {
      const cached = localStorage.getItem('dibapasa_cached_settings');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const effectiveShopLocation = useMemo(() => ({
    address: settings?.shopAddress || SHOP_LOCATION.address,
    lat: settings?.shopLat || SHOP_LOCATION.lat,
    lng: settings?.shopLng || SHOP_LOCATION.lng
  }), [settings]);

  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [authMode, setAuthMode] = useState<'options' | 'email'>('options');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);

  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [inventorySelectedCategory, setInventorySelectedCategory] = useState('Todos');
  const [inventorySelectedSubcategory, setInventorySelectedSubcategory] = useState('Todas');
  const [inventoryStockFilter, setInventoryStockFilter] = useState('all');

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.warn("SignOut error:", e);
    } finally {
      setUser(null);
      setProfile(null);
      setGuestMode(false);
      setAuthMode('options');
      setEmail('');
      setPassword('');
      setRegName('');
      setCurrentPage('home');
      localStorage.removeItem('currentPage');
      showToast('Sesión cerrada correctamente', 'info');
    }
  };

  const handleGoogleSignIn = async () => {
    if (isAuthLoading) return;
    setIsAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        // User voluntarily closed popup
      } else if (error?.code === 'auth/missing-or-invalid-nonce' || error?.message?.includes('nonce') || error?.message?.includes('Duplicate credential')) {
        showToast('Para iniciar con Google, usa el botón de correo o abre la app en pestaña nueva.', 'info');
      } else {
        console.error("SignInWithGoogle error:", error);
        showToast('Error al iniciar sesión con Google. Intenta con correo y contraseña.', 'error');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      showToast('No puedes iniciar sesión sin conexión a internet', 'error');
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      showToast('Por favor completa el correo y la contraseña', 'error');
      return;
    }
    setIsAuthLoading(true);
    try {
      if (emailMode === 'register') {
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (regName.trim()) {
          await updateProfile(result.user, { displayName: regName.trim() }).catch(() => {});
        }
        await sendEmailVerification(result.user).catch(() => {});
        showToast('Cuenta creada exitosamente. ¡Bienvenido!', 'success');
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        showToast('Bienvenido a Dibapasa', 'success');
      }
    } catch (error: any) {
      console.error("Auth Error:", error);
      let msg = "Error al autenticar";
      if (error.code === 'auth/email-already-in-use') msg = "El correo ya está registrado. Selecciona 'Iniciar sesión'.";
      else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') msg = "Correo o contraseña incorrectos";
      else if (error.code === 'auth/invalid-email') msg = "El formato de correo no es válido";
      else if (error.code === 'auth/weak-password') msg = "La contraseña debe tener al menos 6 caracteres";
      else if (error.code === 'auth/too-many-requests') msg = "Demasiados intentos fallidos. Intenta más tarde o recupera tu contraseña";
      else if (error.code === 'auth/network-request-failed') msg = "Error de conexión. Verifica tu internet";
      else if (error.message) msg = error.message;
      showToast(msg, 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      showToast('Ingresa tu correo primero en el campo de texto', 'info');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      showToast('Enlace de recuperación enviado a tu correo', 'success');
    } catch (error: any) {
      showToast('Error al enviar recuperación: verifica tu correo', 'error');
    }
  };
  const [isDriverOrdering, setIsDriverOrdering] = useState(false);
  const [isStoreOrdering, setIsStoreOrdering] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const hasSeeded = useRef(false);

  // Persist Cart
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  // Persist Current Page
  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Auth & Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            const savedViewAs = localStorage.getItem('viewAs') as any;
            setProfile({ ...data, viewAs: savedViewAs || data.viewAs || 'admin' });
            if (data.role === 'admin') setCurrentPage('admin-dashboard');
            else if (data.role === 'dispatcher') setCurrentPage('dispatcher-view');
            else if (data.role === 'preparer') setCurrentPage('preparer-view');
            else if (data.role === 'driver') setCurrentPage('driver-view');
            else if (data.role === 'loader') setCurrentPage('loader-view');
            else if (data.role === 'store_sales') setCurrentPage('store-sales-view');
            else if (data.role === 'inventory') setCurrentPage('admin-inventory-tracking');
            else setCurrentPage('home');
          } else {
            // New user without profile document
            setShowRoleSelection(true);
          }
        } catch (err) {
          console.error("Error retrieving user profile:", err);
          const fallbackProfile: UserProfile = {
            uid: u.uid,
            name: u.displayName || u.email?.split('@')[0] || 'Usuario',
            email: u.email || '',
            role: 'client'
          };
          setProfile(fallbackProfile);
          setCurrentPage('home');
        }
      } else {
        setProfile(null);
        setShowRoleSelection(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);  // Public Data Fetches (Real-time)
  // On-demand & Cached Data Sync (0 database reads on tab clicks, filters, searching, and navigation)
  const refreshCatalogData = async (showNotification = false) => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const [productsSnap, categoriesSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'categories')),
        getDoc(doc(db, 'settings', 'app'))
      ]);

      if (!productsSnap.empty) {
        const prods = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        setProducts(prods);
        try { localStorage.setItem('dibapasa_cached_products', JSON.stringify(prods)); } catch (e) {}
        setHasLoadedAllProducts(true);
      }

      if (!categoriesSnap.empty) {
        const cats = categoriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
        setCategories(cats);
        try { localStorage.setItem('dibapasa_cached_categories', JSON.stringify(cats)); } catch (e) {}
      }

      if (settingsSnap.exists()) {
        const sett = settingsSnap.data() as AppSettings;
        setSettings(sett);
        try { localStorage.setItem('dibapasa_cached_settings', JSON.stringify(sett)); } catch (e) {}
      }

      try { localStorage.setItem('dibapasa_cache_timestamp', Date.now().toString()); } catch (e) {}
      if (showNotification) {
        showToast('Catálogo e inventario sincronizados', 'success');
      }
    } catch (error) {
      console.error("Error syncing catalog:", error);
      if (showNotification) {
        showToast('Error al sincronizar datos', 'error');
      }
    } finally {
      setIsSyncing(false);
      setIsFetchingProducts(false);
    }
  };

  useEffect(() => {
    // Initial silent sync on mount
    refreshCatalogData(false);
  }, []);

  const loadAllProducts = async () => {
    await refreshCatalogData(false);
  };


  const loadOrders = async (isInitial = false) => {
    if (isFetchingOrders || (!isInitial && !hasMoreOrders)) return;
    setIsFetchingOrders(true);

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', thirtyDaysAgo),
        orderBy('createdAt', 'desc'),
        limit(200)
      );

      if (!isInitial && lastOrderDoc) {
        q = query(q, startAfter(lastOrderDoc));
      }

      const snapshot = await getDocs(q);
      const newOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      
      if (isInitial) {
        setAllOrders(newOrders);
      } else {
        setAllOrders(prev => [...prev, ...newOrders]);
      }

      setLastOrderDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMoreOrders(snapshot.docs.length === 50);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setIsFetchingOrders(false);
    }
  };

  const loadAuthenticatedData = async () => {
    if (!user || !profile) return;
    
    // Refined queries with limits
    const requestsQuery = query(collection(db, 'inventoryRequests'), orderBy('createdAt', 'desc'), limit(100));
    const returnsQuery = query(collection(db, 'returns'), orderBy('createdAt', 'desc'), limit(50));
    const usersQuery = query(collection(db, 'users'), limit(100));

    if (profile.role === 'admin' || profile.role === 'dispatcher' || profile.role === 'loader' || profile.role === 'preparer' || profile.role === 'driver' || profile.role === 'store_sales' || profile.role === 'inventory') {
      try {
        const [requestsSnap, returnsSnap] = await Promise.all([
          getDocs(requestsQuery),
          getDocs(returnsQuery)
        ]);
        setInventoryRequests(requestsSnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryRequest)));
        setAllReturns(returnsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Return)));
      } catch (error) {
        console.error("Error loading authenticated data:", error);
      }
    }

    if (profile.role === 'admin' || profile.role === 'loader') {
      try {
        const usersSnap = await getDocs(usersQuery);
        setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      } catch (error) {
        console.error("Error loading users:", error);
      }
    }
  };

  const seedAppData = async () => {
    if (!profile || profile.role !== 'admin') return;
    try {
      showToast('Sembrando datos...', 'info');
      // Categories
      const categoriesSnap = await getDocs(collection(db, 'categories'));
      if (categoriesSnap.empty) {
        const defaultCats = CATEGORIES.filter(c => c !== 'Todos').map(name => ({
          name,
          subcategories: []
        }));
        for (const cat of defaultCats) {
          await addDoc(collection(db, 'categories'), cat);
        }
      }
      
      // Products
      const snapshot = await getDocs(collection(db, 'products'));
      const existingIds = snapshot.docs.map(d => d.id);
      const missingProducts = INITIAL_PRODUCTS.filter(p => !existingIds.includes(p.id));
      for (const p of missingProducts) {
        const { id, ...data } = p;
        await setDoc(doc(db, 'products', id), data);
      }
      
      showToast('Datos sembrados correctamente', 'success');
      // Refresh
      const catsSnap = await getDocs(collection(db, 'categories'));
      setCategories(catsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
      setHasLoadedAllProducts(false);
      await loadAllProducts();
    } catch (error) {
      showToast('Error al sembrar datos', 'error');
    }
  };

  // Authenticated Data Listeners & One-time loads
  useEffect(() => {
    if (!user || !profile) return;

    // Load initial orders
    if (profile.role === 'admin' || profile.role === 'dispatcher' || profile.role === 'loader' || profile.role === 'preparer' || profile.role === 'driver' || profile.role === 'store_sales' || profile.role === 'inventory') {
      loadOrders(true);
    }

    // Load static-ish data once
    loadAuthenticatedData();

    // Notifications - Real-time
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'notifications'));

    // Critical Real-time listeners
    let adminOrdersUnsubscribe: any = null;
    let routesUnsubscribe: any = null;

    if (profile.role === 'admin' || profile.role === 'dispatcher' || profile.role === 'driver' || profile.role === 'loader' || profile.role === 'preparer' || profile.role === 'store_sales') {
      const activeOrdersQuery = query(
        collection(db, 'orders'), 
        where('status', 'in', ['pending', 'accepted', 'processing', 'ready', 'shipped']), 
        orderBy('createdAt', 'desc'), 
        limit(100)
      );
      adminOrdersUnsubscribe = onSnapshot(activeOrdersQuery, (snapshot) => {
        setAllOrders(prev => {
          const updated = [...prev];
          snapshot.docChanges().forEach(change => {
            const data = { id: change.doc.id, ...change.doc.data() } as Order;
            const idx = updated.findIndex(o => o.id === data.id);
            if (change.type === 'added' && idx === -1) {
              updated.unshift(data);
            } else if (change.type === 'modified' && idx !== -1) {
              updated[idx] = data;
            } else if (change.type === 'removed' && idx !== -1) {
              updated.splice(idx, 1);
            }
          });
          return updated.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        });
      }, (error) => handleFirestoreError(error, OperationType.GET, 'orders'));
    }

    if (profile.role === 'driver' || profile.role === 'admin' || profile.role === 'dispatcher') {
      const routesQuery = query(collection(db, 'routes'), orderBy('createdAt', 'desc'), limit(50));
      routesUnsubscribe = onSnapshot(routesQuery, (snapshot) => {
        setAllRoutes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryRoute)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'routes'));
    }

    return () => {
      notificationsUnsubscribe();
      if (adminOrdersUnsubscribe) adminOrdersUnsubscribe();
      if (routesUnsubscribe) routesUnsubscribe();
    };
  }, [user, profile]);

  const handleRoleSelection = async (role: 'client' | 'company') => {
    if (!user) return;
    const newProfile: UserProfile = {
      uid: user.uid,
      name: user.displayName || '',
      email: user.email || '',
      role: role
    };
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setProfile(newProfile);
    setShowRoleSelection(false);
  };

  // Orders Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(fetchedOrders);
      const active = fetchedOrders.find(o => ['pending', 'processing', 'ready', 'shipped'].includes(o.status));
      setCurrentOrder(active || null);
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    return unsubscribe;
  }, [user]);

  const effectiveRole = profile?.role === 'admin' ? (profile.viewAs || 'admin') : profile?.role;

  useEffect(() => {
    if (profile?.role === 'admin') {
      const view = profile.viewAs || 'admin';
      if (view === 'admin') setCurrentPage('admin-dashboard');
      else if (view === 'client' || view === 'company') setCurrentPage('home');
      else if (view === 'dispatcher') setCurrentPage('dispatcher-view');
      else if (view === 'preparer') setCurrentPage('preparer-view');
      else if (view === 'driver') setCurrentPage('driver-view');
      else if (view === 'loader') setCurrentPage('loader-view');
      else if (view === 'inventory') setCurrentPage('admin-inventory-tracking');
      else if (view === 'store_sales') setCurrentPage('store-sales-view');
    } else if (profile?.role) {
      if (profile.role === 'dispatcher') setCurrentPage('dispatcher-view');
      else if (profile.role === 'preparer') setCurrentPage('preparer-view');
      else if (profile.role === 'driver') setCurrentPage('driver-view');
      else if (profile.role === 'loader') setCurrentPage('loader-view');
      else if (profile.role === 'inventory') setCurrentPage('admin-inventory-tracking');
      else if (profile.role === 'store_sales') setCurrentPage('store-sales-view');
    }
  }, [profile?.viewAs, profile?.role]);

  const cartTotal = useMemo(() => {
    return Object.entries(cart).reduce((sum, [id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return sum;
      const multiplier = product.unit === 'Kg' ? (product.approxWeight || 1) : 1;
      return sum + (product.price * multiplier) * qty;
    }, 0);
  }, [cart, products]);

  const cartItemsCount = useMemo(() => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const productSales: Record<string, number> = {};
    allOrders.forEach(order => {
      if (order.status !== 'cancelled') {
        order.items.forEach(item => {
          productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
        });
      }
    });

    const hiddenCategoryNames = new Set(
      categories.filter(c => c.isHidden).map(c => c.name)
    );

    const filtered = products.filter(p => {
      if (!p) return false;
      const name = p.name || '';
      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
      const matchesSubcategory = selectedSubcategory === 'Todas' || p.subcategory === selectedSubcategory;
      const isVisible = !p.isHidden || effectiveRole === 'admin';
      const isCategoryVisible = effectiveRole === 'admin' || !hiddenCategoryNames.has(p.category);
      
      return matchesSearch && matchesCategory && matchesSubcategory && !p.isDeleted && isVisible && isCategoryVisible;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'sales') {
        const salesA = productSales[a.id] || 0;
        const salesB = productSales[b.id] || 0;
        return salesB - salesA;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [searchQuery, selectedCategory, selectedSubcategory, products, categories, allOrders, sortBy, effectiveRole]);

  const updateCart = (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const availableStock = (product.stock || 0) - (product.reserved || 0);
    
    setCart(prev => {
      const currentQty = prev[productId] || 0;
      let newQty = currentQty + delta;
      
      if (delta > 0 && newQty > availableStock) {
        showToast(`Solo hay ${availableStock} piezas disponibles de ${product.name}`, 'info');
        newQty = availableStock;
      }

      if (newQty <= 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: newQty };
    });
  };

  const setCartQuantity = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const availableStock = (product.stock || 0) - (product.reserved || 0);
    let finalQty = quantity;
    
    if (finalQty > availableStock) {
      showToast(`Solo hay ${availableStock} piezas disponibles de ${product.name}`, 'info');
      finalQty = availableStock;
    }

    setCart(prev => {
      if (finalQty <= 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: finalQty };
    });
  };

  const handleCheckout = async (
    address: string, 
    deliverySlot: string, 
    paymentMethod: 'cash' | 'card', 
    recipientName?: string, 
    type: 'delivery' | 'pickup' = 'delivery', 
    notes: string = '', 
    location?: { lat: number, lng: number }, 
    preCalculatedFee?: number, 
    preCalculatedDistance?: number,
    deliveryWindowStart?: string,
    deliveryWindowEnd?: string
  ) => {
    if (!user || !profile) return;
    
    // Use pre-calculated values if provided, otherwise fallback to simple calculation (though pre-calculated is preferred)
    let deliveryFee = preCalculatedFee !== undefined ? preCalculatedFee : 0;
    let deliveryDistance = preCalculatedDistance !== undefined ? preCalculatedDistance : 0;

    if (type === 'delivery' && location && preCalculatedFee === undefined) {
      const distance = calculateDistance(effectiveShopLocation.lat, effectiveShopLocation.lng, location.lat, location.lng);
      deliveryDistance = distance * 1.3; // fallback estimate
      deliveryFee = getDeliveryFee(deliveryDistance);
    }

    const orderItems: OrderItem[] = Object.entries(cart).map(([id, qty]) => {
      const p = products.find(prod => prod.id === id) || INITIAL_PRODUCTS.find(prod => prod.id === id);
      return {
        productId: id,
        name: p?.name || 'Producto Desconocido',
        quantity: qty,
        price: p?.price || 0,
        unit: p?.unit || 'Paq',
        approxWeight: p?.approxWeight || 0
      };
    });

    const pickupCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const isStoreSale = isStoreOrdering || profile.role === 'store_sales';

    const newOrder: any = {
      userId: (isDriverOrdering || isStoreSale) ? `${isDriverOrdering ? 'driver' : 'store'}-placed` : (user?.uid || 'unknown'),
      userName: (isDriverOrdering || isStoreSale) ? (recipientName || 'Cliente') : (profile.name || 'Usuario'),
      userEmail: (isDriverOrdering || isStoreSale) ? `${isDriverOrdering ? 'driver' : 'store'}@dibapasa.com` : (profile.email || ''),
      userPhone: (isDriverOrdering || isStoreSale) ? '' : (profile.phone || ''),
      items: orderItems || [],
      total: Number((cartTotal || 0) + (deliveryFee || 0)) || 0,
      status: isStoreSale ? 'processing' : 'pending',
      type: isStoreSale ? 'pickup' : (type || 'delivery'),
      pickupCode: pickupCode || 'ERROR', 
      createdAt: serverTimestamp(),
      address: (isStoreSale || type === 'pickup') ? (effectiveShopLocation.address || 'Tienda') : (address || ''),
      location: type === 'delivery' && location && typeof location.lat === 'number' && typeof location.lng === 'number' 
        ? { lat: location.lat, lng: location.lng } 
        : null,
      notes: notes || '',
      paymentStatus: (isStoreSale && paymentMethod === 'card') ? 'paid' : (isStoreSale ? 'pending' : (paymentMethod === 'card' ? 'paid' : 'pending')),
      paymentMethod: paymentMethod || 'cash',
      deliverySlot: (isStoreSale || type === 'pickup') ? 'Inmediato' : (deliverySlot || 'Próximo Reparto'),
      deliveryWindowStart: deliveryWindowStart || null,
      deliveryWindowEnd: deliveryWindowEnd || null,
      deliveryFee: Number(deliveryFee) || 0,
      deliveryDistance: Number(deliveryDistance) || 0,
      ...((isDriverOrdering || isStoreSale) && profile?.uid ? { placedBy: profile.uid } : {})
    };

    try {
      // For store sales, we use a custom ID prefix for easy identification in history
      const orderRef = isStoreSale ? doc(collection(db, 'orders')) : null;
      const orderId = orderRef ? `STORE-${orderRef.id.slice(0, 8)}` : null;
      
      const docRef = orderId 
        ? (await setDoc(doc(db, 'orders', orderId), newOrder), { id: orderId })
        : await addDoc(collection(db, 'orders'), newOrder);
        
      const finalOrder = { id: docRef.id, ...newOrder };
      setCart({});
      if (isDriverOrdering) {
        setIsDriverOrdering(false);
        setCurrentPage('driver-view');
      } else if (isStoreOrdering) {
        setLastOrder(finalOrder);
        setIsStoreOrdering(false);
        setCurrentPage('store-ticket');
      } else {
        setCurrentPage('current-order');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-900" />
      </div>
    );
  }

  if (showRoleSelection) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <div className="mb-6">
          <KLogo size="w-24 h-24 text-4xl" logoUrl={settings?.logoUrl} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Selecciona tu tipo de perfil</h1>
        <p className="text-gray-500 mb-8 max-w-xs">Elige cómo usarás la aplicación para darte la mejor experiencia.</p>
        <div className="w-full max-w-xs space-y-4">
          <button 
            onClick={() => handleRoleSelection('client')}
            className="w-full p-6 bg-white border-2 border-gray-100 rounded-2xl text-left hover:border-emerald-600 hover:bg-emerald-50 transition-all group"
          >
            <h3 className="font-bold text-gray-900 group-hover:text-emerald-600">Cliente Individual</h3>
            <p className="text-xs text-gray-500">Para compras personales y familiares.</p>
          </button>
          <button 
            onClick={() => handleRoleSelection('company')}
            className="w-full p-6 bg-white border-2 border-gray-100 rounded-2xl text-left hover:border-emerald-600 hover:bg-emerald-50 transition-all group"
          >
            <h3 className="font-bold text-gray-900 group-hover:text-emerald-600">Empresa / Negocio</h3>
            <p className="text-xs text-gray-500">Para compras al por mayor con incrementos de 10 o 100.</p>
          </button>
        </div>
      </div>
    );
  }

  if (!user && !guestMode) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <div className="mb-8">
          <KLogo size="w-32 h-32 text-5xl" logoUrl={settings?.logoUrl} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2 font-sans tracking-tight">Bienvenido a Dibapasa</h1>
        <p className="text-gray-500 mb-8 max-w-xs">Tus carnes frías y embutidos favoritos, con la calidad y frescura de siempre.</p>
        
        <div className="w-full max-w-xs space-y-4">
          <div id="recaptcha-container"></div>
          {authMode === 'options' ? (
            <div className="space-y-3">
              <Button 
                onClick={handleGoogleSignIn} 
                disabled={isAuthLoading}
                className="w-full flex items-center justify-center gap-3 py-4 shadow-lg shadow-blue-100 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-70"
              >
                {isAuthLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" className="w-5 h-5 flex-shrink-0" alt="Google Logo" referrerPolicy="no-referrer" />
                )}
                <span className="font-semibold text-[#1f1f1f]">
                  {isAuthLoading ? 'Iniciando sesión...' : 'Continuar con Google'}
                </span>
              </Button>
              <Button onClick={() => setAuthMode('email')} variant="secondary" className="w-full py-4 flex items-center justify-center gap-3 border border-gray-100 bg-white shadow-sm">
                <Mail className="w-5 h-5 text-blue-900" />
                <span className="font-semibold text-gray-700">Continuar con Correo</span>
              </Button>
              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400 font-bold">O</span></div>
              </div>
              <Button variant="outline" onClick={() => setGuestMode(true)} className="w-full py-4 border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-600">
                Ver catálogo como invitado
              </Button>
              
              {window.self !== window.top && (
                <div className="pt-2 text-center">
                  <a 
                    href={window.location.href} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[11px] text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    <span>Abrir en pestaña nueva para acceso completo</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 text-left">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setAuthMode('options')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
                <h2 className="text-lg font-bold text-gray-900">
                  {emailMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </h2>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                {emailMode === 'register' && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nombre Completo</label>
                    <Input 
                      placeholder="Ej. Juan Pérez" 
                      value={regName} 
                      onChange={(e: any) => setRegName(e.target.value)} 
                      required 
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Correo Electrónico</label>
                  <Input 
                    type="email" 
                    placeholder="correo@ejemplo.com" 
                    value={email} 
                    onChange={(e: any) => setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Contraseña</label>
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password} 
                    onChange={(e: any) => setPassword(e.target.value)} 
                    required 
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" disabled={isAuthLoading} className="w-full py-3">
                    {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (emailMode === 'login' ? 'Entrar' : 'Registrarme')}
                  </Button>
                </div>
              </form>

              <div className="text-center space-y-2 pt-2">
                <button 
                  onClick={() => setEmailMode(emailMode === 'login' ? 'register' : 'login')}
                  className="text-xs text-blue-900 font-bold hover:underline"
                >
                  {emailMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
                {emailMode === 'login' && (
                  <div>
                    <button onClick={handleResetPassword} className="text-xs text-gray-400 hover:text-gray-600">
                      Olvidé mi contraseña
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center justify-between max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <KLogo size="w-10 h-10 text-xl" logoUrl={settings?.logoUrl} />
            <div>
              <h1 className="text-lg font-bold text-blue-900 leading-tight">Dibapasa</h1>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                {effectiveRole === 'admin' ? 'Panel Admin' : effectiveRole === 'company' ? 'Empresa' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {profile?.role === 'admin' && (
              <select 
                className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-gray-50 font-bold text-gray-600"
                value={profile.viewAs || 'admin'}
                onChange={(e) => {
                  const newView = e.target.value as any;
                  const updated = { ...profile, viewAs: newView };
                  localStorage.setItem('viewAs', newView);
                  setProfile(updated);
                }}
              >
                <option value="admin">Ver como Admin</option>
                <option value="client">Ver como Cliente</option>
                <option value="company">Ver como Empresa</option>
                <option value="dispatcher">Ver como Despacho</option>
                <option value="preparer">Ver como Preparación</option>
                <option value="loader">Ver como Cargador</option>
                <option value="store_sales">Ver como Ventas Tienda</option>
                <option value="driver">Ver como Repartidor</option>
                <option value="inventory">Ver como Inventarios</option>
              </select>
            )}
            {user ? (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{profile?.name}</p>
                  <p className="text-xs text-gray-400">{profile?.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-gray-100 shadow-sm" alt="Profile" />
                ) : (
                  <div className="w-10 h-10 rounded-full border-2 border-gray-100 shadow-sm bg-gray-100 flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-gray-400" />
                  </div>
                )}
              </>
            ) : (
              <Button variant="outline" onClick={() => setGuestMode(false)} className="text-xs py-1.5 px-3">
                Iniciar Sesión
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto p-4 pb-24">
        {/* Connectivity Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-[60] sticky top-0"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Sin conexión a internet. Cambios guardados localmente serán sincronizados al volver.</span>
          </motion.div>
        )}
        {showOnlineStatus && isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-green-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 z-[60] sticky top-0"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Conexión restablecida</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
          {currentPage === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {isDriverOrdering && (
                <div className="bg-blue-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold opacity-80 uppercase tracking-wider">Modo Repartidor</p>
                      <p className="font-bold">Realizando pedido para cliente</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setIsDriverOrdering(false);
                      setCurrentPage('driver-view');
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white border-none text-[10px] font-bold"
                  >
                    Volver a Ruta
                  </Button>
                </div>
              )}
              {effectiveRole === 'admin' && (
                <div className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Modo Administrador</h3>
                    <p className="text-xs opacity-80">Gestiona pedidos y usuarios</p>
                  </div>
                  <Button 
                    onClick={() => setCurrentPage('admin-dashboard')}
                    className="bg-white text-blue-600 hover:bg-blue-50 text-xs py-1.5"
                  >
                    Ir al Dashboard
                  </Button>
                </div>
              )}
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input 
                    placeholder="Buscar productos..." 
                    className="pl-10 h-12"
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="px-3 h-12 bg-white border border-gray-100 rounded-xl text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-600/20"
                >
                  <option value="name">A-Z</option>
                  <option value="sales">Más Vendidos</option>
                </select>
              </div>

              {/* Categories */}
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  <button
                    onClick={() => {
                      setSelectedCategory('Todos');
                      setSelectedSubcategory('Todas');
                    }}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                      selectedCategory === 'Todos' 
                        ? "bg-blue-900 text-white shadow-md shadow-blue-200" 
                        : "bg-white text-gray-600 border border-gray-100"
                    )}
                  >
                    Todos
                  </button>
                  {categories.filter(cat => !cat.isHidden || effectiveRole === 'admin').map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.name);
                        setSelectedSubcategory('Todas');
                      }}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5",
                        selectedCategory === cat.name 
                          ? "bg-blue-900 text-white shadow-md shadow-blue-200" 
                          : "bg-white text-gray-600 border border-gray-100",
                        cat.isHidden && effectiveRole === 'admin' ? "opacity-60 border-dashed border-amber-400" : ""
                      )}
                    >
                      <span>{cat.name}</span>
                      {cat.isHidden && effectiveRole === 'admin' && (
                        <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                      )}
                    </button>
                  ))}
                </div>

                {selectedCategory !== 'Todos' && categories.find(c => c.name === selectedCategory)?.subcategories.length! > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <button
                      onClick={() => setSelectedSubcategory('Todas')}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                        selectedSubcategory === 'Todas' 
                          ? "bg-gray-800 text-white" 
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      Todas
                    </button>
                    {categories.find(c => c.name === selectedCategory)?.subcategories.map(sub => (
                      <button
                        key={sub}
                        onClick={() => setSelectedSubcategory(sub)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                          selectedSubcategory === sub 
                            ? "bg-gray-800 text-white" 
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Products */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredProducts.map(product => {
                  const isSoldOut = (product.stock || 0) <= (product.reserved || 0);

                  return (
                    <div key={product.id} className={cn(
                      "bg-white rounded-2xl p-3 border border-gray-100 shadow-sm hover:shadow-md transition-all relative",
                      isSoldOut && "opacity-75"
                    )}>
                      {isSoldOut && (
                        <div className="absolute top-2 right-2 z-10">
                          <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Agotado
                          </span>
                        </div>
                      )}
                      {product.isHidden && effectiveRole === 'admin' && (
                        <div className="absolute top-2 left-2 z-10">
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                            <EyeOff className="w-2.5 h-2.5" />
                            Oculto
                          </span>
                        </div>
                      )}
                      <div 
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedProductForDetail(product);
                          setCurrentPage('product-detail');
                        }}
                      >
                      {product.imageUrl ? (
                        <img src={product.imageUrl} className="w-full aspect-square object-cover rounded-xl mb-3" alt={product.name} referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full aspect-square bg-gray-100 rounded-xl mb-3 flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-300" />
                        </div>
                      )}
                      <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 min-h-[40px]">
                        {product.name}
                        {product.unit === 'Kg' && product.approxWeight && (
                          <span className="text-gray-400 font-normal"> ({product.approxWeight} Kg aprox.)</span>
                        )}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      {product.category}
                      {product.subcategory && ` • ${product.subcategory}`}
                    </p>
                    <div className="mt-auto pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-bold text-blue-900">
                            ${(product.unit === 'Kg' ? product.price * (product.approxWeight || 1) : product.price).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400 font-normal">
                             ${product.price.toFixed(2)} / {product.unit || 'Paq'}
                          </span>
                        </div>
                        {product.unit === 'Kg' && (
                          <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded leading-tight">PRECIO ESTIMADO</span>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div className={cn(
                          "flex items-center justify-between rounded-xl p-1 transition-colors",
                          isSoldOut ? "bg-gray-100 opacity-50" : "bg-gray-50"
                        )}>
                          <button 
                            onClick={() => !isSoldOut && updateCart(product.id, -1)}
                            className={cn("p-1.5 rounded-lg transition-colors", !isSoldOut && "hover:bg-white")}
                            disabled={isSoldOut}
                          >
                            <Minus className="w-4 h-4 text-gray-600" />
                          </button>
                          <input 
                            type="number"
                            value={cart[product.id] || 0}
                            onChange={(e) => !isSoldOut && setCartQuantity(product.id, parseInt(e.target.value) || 0)}
                            className="text-sm font-bold w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                            min="0"
                            disabled={isSoldOut}
                          />
                          <button 
                            onClick={() => !isSoldOut && updateCart(product.id, 1)}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors", 
                              !isSoldOut && (cart[product.id] || 0) < (product.stock || 0) - (product.reserved || 0) ? "hover:bg-white" : "opacity-30 cursor-not-allowed"
                            )}
                            disabled={isSoldOut || (cart[product.id] || 0) >= (product.stock || 0) - (product.reserved || 0)}
                          >
                            <Plus className="w-4 h-4 text-emerald-600" />
                          </button>
                        </div>

                        {effectiveRole === 'company' && (
                          <div className="flex gap-1">
                            <button 
                              onClick={() => !isSoldOut && updateCart(product.id, 10)}
                              className={cn(
                                "flex-1 text-[10px] font-bold py-1 rounded-lg transition-colors",
                                isSoldOut ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200"
                              )}
                              disabled={isSoldOut}
                            >
                              +10
                            </button>
                            <button 
                              onClick={() => !isSoldOut && updateCart(product.id, 100)}
                              className={cn(
                                "flex-1 text-[10px] font-bold py-1 rounded-lg transition-colors",
                                isSoldOut ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200"
                              )}
                              disabled={isSoldOut}
                            >
                              +100
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>

              {cartItemsCount > 0 && (
                <motion.div 
                  initial={{ y: 100 }}
                  animate={{ y: 0 }}
                  className="fixed bottom-24 left-4 right-4 max-w-md mx-auto z-40"
                >
                  <Button 
                    onClick={() => setCurrentPage('checkout')}
                    className="w-full h-14 flex items-center justify-between px-6 shadow-xl shadow-blue-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 px-2 py-1 rounded text-xs font-bold">{cartItemsCount} artículos</div>
                      <span className="font-bold">Ver Carrito</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">${cartTotal.toFixed(2)}</span>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}

          {currentPage === 'product-detail' && selectedProductForDetail && (
            <ProductDetailPage 
              product={selectedProductForDetail}
              onBack={() => {
                setSelectedProductForDetail(null);
                setCurrentPage('home');
              }}
              cartQuantity={cart[selectedProductForDetail.id] || 0}
              onUpdateCart={updateCart}
              onSetCartQuantity={setCartQuantity}
              effectiveRole={effectiveRole}
            />
          )}

          {currentPage === 'checkout' && (
            user ? (
              profile ? (
                  <CheckoutPage 
                    cart={cart} 
                    total={cartTotal} 
                    products={products}
                    onBack={() => {
                      if (isStoreOrdering) {
                        setIsStoreOrdering(false);
                        setCurrentPage('store-sales-view');
                      } else {
                        setCurrentPage('home');
                      }
                    }}
                    onConfirm={handleCheckout}
                    profile={profile}
                    isDriverOrdering={isDriverOrdering || isStoreOrdering}
                    shopLocation={effectiveShopLocation}
                    isOnline={isOnline}
                  />
              ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                  <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
                </div>
              )
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <ShoppingCart className="w-16 h-16 text-red-600 mb-4 opacity-20" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Inicia Sesión para Comprar</h2>
                <p className="text-gray-500 mb-6">Necesitamos identificarte para procesar tu pedido de forma segura.</p>
                <Button onClick={() => setGuestMode(false)} className="w-full max-w-xs">Ir a Iniciar Sesión</Button>
                <Button variant="ghost" onClick={() => setCurrentPage('home')} className="mt-2">Seguir Navegando</Button>
              </div>
            )
          )}

          {currentPage === 'current-order' && (
            user ? (
              <CurrentOrderPage 
                orders={orders} 
                onGoHome={() => setCurrentPage('home')} 
                onCancelOrder={async (id) => {
                  try {
                    await updateDoc(doc(db, 'orders', id), { status: 'cancelled' });
                    showToast('Pedido cancelado correctamente', 'success');
                  } catch (error) {
                    handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
                  }
                }}
                onModifyOrder={async (order) => {
                  try {
                    // Restore cart
                    const newCart: any = {};
                    order.items.forEach(item => {
                      newCart[item.productId] = item.quantity;
                    });
                    setCart(newCart);
                    // Cancel old order
                    await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
                    setCurrentPage('home');
                    showToast('Pedido cargado en el carrito para modificar', 'info');
                  } catch (error) {
                    handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
                  }
                }}
                showToast={showToast}
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Rastrea tu Pedido</h2>
                <p className="text-gray-500 mb-6">Inicia sesión para ver el estado de tus pedidos en tiempo real.</p>
                <Button onClick={() => setGuestMode(false)}>Iniciar Sesión</Button>
              </div>
            )
          )}

          {currentPage === 'history' && (
            user ? (
              <HistoryPage orders={orders} />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <History className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Historial de Pedidos</h2>
                <p className="text-gray-500 mb-6">Inicia sesión para ver tus compras anteriores.</p>
                <Button onClick={() => setGuestMode(false)}>Iniciar Sesión</Button>
              </div>
            )
          )}

          {currentPage === 'profile' && (
            user ? (
              profile ? (
                <ProfilePage 
                  profile={profile} 
                  onUpdate={setProfile} 
                  isAdmin={profile.role === 'admin'} 
                  effectiveRole={effectiveRole}
                  setCurrentPage={setCurrentPage}
                  onLogout={handleLogout}
                />
              ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                  <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
                </div>
              )
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <UserIcon className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Tu Perfil</h2>
                <p className="text-gray-500 mb-6">Inicia sesión para guardar tus datos de entrega y celular.</p>
                <Button onClick={() => setGuestMode(false)}>Iniciar Sesión</Button>
              </div>
            )
          )}

          {currentPage === 'store-ticket' && lastOrder && (
            <StoreTicketView order={lastOrder} onDone={() => setCurrentPage('store-sales-view')} />
          )}

          {currentPage === 'admin-dashboard' && (
            <AdminDashboard 
              orders={allOrders} 
              users={allUsers}
              currentUserId={profile?.uid || ''}
              selectedDate={adminSelectedDate}
              onDateChange={setAdminSelectedDate}
              onStatClick={(status) => {
                setAdminOrderFilter(status);
                setCurrentPage('admin-orders');
              }}
              onUsersClick={() => setCurrentPage('admin-users')}
              onInventoryTrackingClick={(p) => {
                setAdminPeriod(p);
                setCurrentPage('admin-inventory-tracking');
              }}
              onReturnsClick={() => setCurrentPage('admin-returns')}
              onDriverRouteClick={() => setCurrentPage('driver-view')}
              onSettingsClick={() => setCurrentPage('admin-settings')}
              onProductsClick={() => setCurrentPage('inventory-view')}
              onCategoriesClick={() => setCurrentPage('admin-categories')}
              onRefresh={async () => {
                await loadOrders(true);
                await loadAuthenticatedData();
                showToast('Datos actualizados', 'success');
              }}
              onSeedData={seedAppData}
            />
          )}

          {currentPage === 'admin-categories' && (
            <AdminCategoriesView 
              categories={categories}
              onBack={() => setCurrentPage('admin-dashboard')}
              showToast={showToast}
              onCategorySaved={(savedCat: Category) => {
                setCategories(prev => {
                  const idx = prev.findIndex(c => c.id === savedCat.id);
                  let next;
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = savedCat;
                  } else {
                    next = [...prev, savedCat];
                  }
                  try { localStorage.setItem('dibapasa_cached_categories', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onCategoryDeleted={(deletedId: string) => {
                setCategories(prev => {
                  const next = prev.filter(c => c.id !== deletedId);
                  try { localStorage.setItem('dibapasa_cached_categories', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
            />
          )}

          {currentPage === 'admin-settings' && (
            <AdminSettingsView 
              settings={settings} 
              onBack={() => setCurrentPage('admin-dashboard')} 
              canEditLocation={true}
              showToast={showToast}
            />
          )}

          {currentPage === 'admin-inventory-tracking' && profile && (
            <AdminInventoryTrackingView 
              orders={allOrders}
              requests={inventoryRequests}
              products={products}
              profile={profile}
              selectedDate={adminSelectedDate}
              onDateChange={setAdminSelectedDate}
              period={adminPeriod}
              onPeriodChange={setAdminPeriod}
              onBack={() => setCurrentPage(effectiveRole === 'admin' ? 'admin-dashboard' : 'inventory-view')}
              onDeleteRequest={async (id) => {
                try {
                  await deleteDoc(doc(db, 'inventoryRequests', id));
                } catch (error) {
                  handleFirestoreError(error, OperationType.DELETE, `inventoryRequests/${id}`);
                }
              }}
              onEditProduct={effectiveRole === 'admin' ? (p) => {
                setSelectedProductForEdit(p);
                setCurrentPage('admin-product-edit' as any);
              } : undefined}
              onAddProduct={effectiveRole === 'admin' ? () => {
                setSelectedProductForEdit(null);
                setCurrentPage('admin-product-edit' as any);
              } : undefined}
              onRefresh={async () => {
                await loadAuthenticatedData();
                showToast('Inventario actualizado', 'success');
              }}
              inventorySearchQuery={inventorySearchQuery}
              setInventorySearchQuery={setInventorySearchQuery}
              inventorySelectedCategory={inventorySelectedCategory}
              setInventorySelectedCategory={setInventorySelectedCategory}
              inventorySelectedSubcategory={inventorySelectedSubcategory}
              setInventorySelectedSubcategory={setInventorySelectedSubcategory}
              inventoryStockFilter={inventoryStockFilter}
              setInventoryStockFilter={setInventoryStockFilter}
              showToast={showToast}
            />
          )}

          {currentPage === 'admin-users' && (
            <AdminUsersView 
              users={allUsers} 
              onBack={() => setCurrentPage('admin-dashboard')}
              onRefresh={async () => {
                await loadAuthenticatedData();
                showToast('Usuarios actualizados', 'success');
              }}
            />
          )}

          {currentPage === 'admin-returns' && (
            <AdminReturnsView 
              returns={allReturns} 
              products={products}
              onBack={() => setCurrentPage('admin-dashboard')}
              showToast={showToast}
              onRefresh={async () => {
                await loadAuthenticatedData();
                showToast('Devoluciones actualizadas', 'success');
              }}
            />
          )}

          {currentPage === 'admin-orders' && (
            <AdminOrdersView 
              orders={allOrders} 
              users={allUsers}
              products={products}
              filter={adminOrderFilter}
              selectedDate={adminSelectedDate}
              onBack={() => {
                setAdminOrderFilter('all');
                setCurrentPage('admin-dashboard');
              }}
              showToast={showToast}
              onLoadMore={() => loadOrders()}
              hasMore={hasMoreOrders}
              isLoading={isFetchingOrders}
              onRefresh={async () => {
                await loadOrders(true);
                showToast('Pedidos actualizados', 'success');
              }}
            />
          )}

          {currentPage === 'dispatcher-view' && (
            <DispatcherView orders={allOrders} routes={allRoutes} users={allUsers} products={products} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="pending" />
          )}

          {currentPage === 'dispatcher-history' && (
            <DispatcherView orders={allOrders} routes={allRoutes} users={allUsers} products={products} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="history" />
          )}

          {currentPage === 'preparer-view' && (
            <PreparerView orders={allOrders} routes={allRoutes} products={products} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="pending" />
          )}

          {currentPage === 'preparer-history' && (
            <PreparerView orders={allOrders} routes={allRoutes} products={products} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="history" />
          )}

          {currentPage === 'driver-view' && (
            profile ? (
              <DriverView 
                orders={allOrders} 
                routes={allRoutes}
                profile={profile} 
                products={products} 
                onBack={() => setCurrentPage('home')} 
                onNewOrderClick={() => {
                  setIsDriverOrdering(true);
                  setCurrentPage('home');
                }}
                showToast={showToast}
                initialTab="pending"
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'driver-history' && (
            profile ? (
              <DriverView 
                orders={allOrders} 
                routes={allRoutes}
                profile={profile} 
                products={products} 
                onBack={() => setCurrentPage('home')} 
                onNewOrderClick={() => {
                  setIsDriverOrdering(true);
                  setCurrentPage('home');
                }}
                showToast={showToast}
                initialTab="history"
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === 'loader-view' && (
            <LoaderView orders={allOrders} routes={allRoutes} users={allUsers} products={products} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="pending" />
          )}

          {currentPage === 'loader-history' && (
            <LoaderView orders={allOrders} routes={allRoutes} users={allUsers} products={products} onBack={() => setCurrentPage('home')} showToast={showToast} initialTab="history" />
          )}

          {currentPage === 'store-sales-view' && (
            <StoreSalesView 
              orders={allOrders} 
              onBack={() => setCurrentPage('home')} 
              onNewOrderClick={() => {
                setIsStoreOrdering(true);
                setCurrentPage('home');
              }}
              showToast={showToast}
            />
          )}

          {currentPage === 'inventory-view' && (
            profile ? (
              <InventoryView 
                products={products} 
                profile={profile} 
                onBack={() => setCurrentPage('home')} 
                onEditProduct={effectiveRole === 'admin' ? (p) => {
                  setSelectedProductForEdit(p);
                  setCurrentPage('admin-product-edit' as any);
                } : undefined}
                onAddProduct={effectiveRole === 'admin' ? () => {
                  setSelectedProductForEdit(null);
                  setCurrentPage('admin-product-edit' as any);
                } : undefined}
                onHistoryClick={() => setCurrentPage('admin-inventory-tracking')}
                searchQuery={inventorySearchQuery}
                setSearchQuery={setInventorySearchQuery}
                selectedCategory={inventorySelectedCategory}
                setSelectedCategory={setInventorySelectedCategory}
                selectedSubcategory={inventorySelectedSubcategory}
                setSelectedSubcategory={setInventorySelectedSubcategory}
                stockFilter={inventoryStockFilter}
                setStockFilter={setInventoryStockFilter}
                showToast={showToast}
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
                <Loader2 className="w-16 h-16 text-red-600 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
              </div>
            )
          )}

          {currentPage === ('admin-product-edit' as any) && (
            <AdminProductFormView 
              product={selectedProductForEdit} 
              categories={categories}
              effectiveRole={effectiveRole}
              showToast={showToast}
              onProductSaved={(savedProduct: Product) => {
                setProducts(prev => {
                  const idx = prev.findIndex(p => p.id === savedProduct.id);
                  let next;
                  if (idx >= 0) {
                    next = [...prev];
                    next[idx] = savedProduct;
                  } else {
                    next = [savedProduct, ...prev];
                  }
                  try { localStorage.setItem('dibapasa_cached_products', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onProductDeleted={(deletedId: string) => {
                setProducts(prev => {
                  const next = prev.filter(p => p.id !== deletedId);
                  try { localStorage.setItem('dibapasa_cached_products', JSON.stringify(next)); } catch (e) {}
                  return next;
                });
              }}
              onBack={() => {
                setSelectedProductForEdit(null);
                setCurrentPage(effectiveRole === 'admin' ? 'admin-inventory-tracking' : 'inventory-view');
              }} 
            />
          )}

          {currentPage === 'admin-notifications' && (
            <AdminNotificationsView 
              requests={inventoryRequests} 
              notifications={notifications} 
              onBack={() => setCurrentPage(effectiveRole === 'admin' ? 'admin-dashboard' : 'home')}
              isAdmin={effectiveRole === 'admin'}
              onApprove={async (req) => {
                try {
                  const product = products.find(p => p.id === req.productId);
                  if (product) {
                    await updateDoc(doc(db, 'products', product.id), {
                      stock: req.newValue
                    });
                    await updateDoc(doc(db, 'inventoryRequests', req.id), { status: 'approved' });
                    
                    // Notify dispatcher
                    await addDoc(collection(db, 'notifications'), {
                      userId: req.requestedBy || 'unknown',
                      title: 'Solicitud Aprobada',
                      message: `Tu solicitud para ${req.productName || 'el producto'} ha sido aprobada.`,
                      type: 'inventory',
                      read: false,
                      createdAt: serverTimestamp()
                    });
                  }
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, `products/${req.productId}`);
                }
              }}
              onReject={async (req) => {
                try {
                  await updateDoc(doc(db, 'inventoryRequests', req.id), { status: 'rejected' });
                  // Notify dispatcher
                  await addDoc(collection(db, 'notifications'), {
                    userId: req.requestedBy || 'unknown',
                    title: 'Solicitud Rechazada',
                    message: `Tu solicitud para ${req.productName || 'el producto'} ha sido rechazada.`,
                    type: 'inventory',
                    read: false,
                    createdAt: serverTimestamp()
                  });
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, `inventoryRequests/${req.id}`);
                }
              }}
              onMarkAsRead={async (id) => {
                try {
                  await updateDoc(doc(db, 'notifications', id), { read: true });
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
                }
              }}
              onDeleteNotification={async (id) => {
                try {
                  await deleteDoc(doc(db, 'notifications', id));
                } catch (error) {
                  handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
                }
              }}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 z-50">
        <div className="max-w-md md:max-w-2xl lg:max-w-3xl mx-auto flex items-center justify-between">
          {effectiveRole === 'admin' ? (
            <>
              <NavButton active={currentPage === 'admin-dashboard'} icon={ShieldCheck} label="Admin" onClick={() => setCurrentPage('admin-dashboard')} />
              <NavButton active={currentPage === 'admin-users'} icon={Users} label="Roles" onClick={() => setCurrentPage('admin-users')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'dispatcher' ? (
            <>
              <NavButton active={currentPage === 'dispatcher-view'} icon={Package} label="Despacho" onClick={() => setCurrentPage('dispatcher-view')} />
              <NavButton active={currentPage === 'dispatcher-history'} icon={History} label="Historial" onClick={() => setCurrentPage('dispatcher-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'inventory' ? (
            <>
              <NavButton active={currentPage === 'admin-inventory-tracking'} icon={History} label="Seguimiento" onClick={() => setCurrentPage('admin-inventory-tracking')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'preparer' ? (
            <>
              <NavButton active={currentPage === 'preparer-view'} icon={ClipboardList} label="Preparación" onClick={() => setCurrentPage('preparer-view')} />
              <NavButton active={currentPage === 'preparer-history'} icon={History} label="Historial" onClick={() => setCurrentPage('preparer-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'loader' ? (
            <>
              <NavButton active={currentPage === 'loader-view'} icon={Package} label="Carga" onClick={() => setCurrentPage('loader-view')} />
              <NavButton active={currentPage === 'loader-history'} icon={History} label="Historial" onClick={() => setCurrentPage('loader-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'driver' ? (
            <>
              <NavButton active={currentPage === 'driver-view'} icon={MapPin} label="Ruta" onClick={() => setCurrentPage('driver-view')} />
              <NavButton active={currentPage === 'driver-history'} icon={History} label="Historial" onClick={() => setCurrentPage('driver-history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : effectiveRole === 'store_sales' ? (
            <>
              <NavButton active={currentPage === 'home'} icon={HomeIcon} label="Inicio" onClick={() => setCurrentPage('home')} />
              <NavButton active={currentPage === 'store-sales-view'} icon={CreditCard} label="Ventas" onClick={() => setCurrentPage('store-sales-view')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          ) : (
            <>
              <NavButton active={currentPage === 'home'} icon={HomeIcon} label="Inicio" onClick={() => setCurrentPage('home')} />
              <NavButton 
                active={currentPage === 'current-order'} 
                icon={ClipboardList} 
                label="Pedido" 
                onClick={() => setCurrentPage('current-order')} 
                badge={orders.filter(o => ['pending', 'processing', 'ready', 'shipped'].includes(o.status)).length}
              />
              <NavButton active={currentPage === 'history'} icon={History} label="Historial" onClick={() => setCurrentPage('history')} />
              <NavButton active={currentPage === 'profile'} icon={UserIcon} label="Perfil" onClick={() => setCurrentPage('profile')} />
            </>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-lg z-[200] flex items-center gap-3 min-w-[300px]",
              toast.type === 'success' ? "bg-green-600 text-white" : 
              toast.type === 'error' ? "bg-red-600 text-white" : "bg-gray-800 text-white"
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {toast.type === 'error' && <AlertTriangle className="w-5 h-5" />}
            {toast.type === 'info' && <Bell className="w-5 h-5" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}

function NavButton({ active, icon: Icon, label, onClick, badge }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all relative",
                      active ? "text-blue-900" : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                        {badge}
                      </span>
                    )}
                    <Icon className={cn("w-6 h-6", active && "animate-bounce")} />
                    <span className="text-[10px] font-medium">{label}</span>
                  </button>
  );
}

// --- Sub-Pages ---

function AddressPicker({ onSelect, currentAddress, currentCoords, shopLocation }: { 
  onSelect: (addr: string, coords?: { lat: number, lng: number }) => void, 
  currentAddress: string,
  currentCoords?: { lat: number, lng: number },
  shopLocation: { lat: number, lng: number, address: string }
}) {
  const [inputValue, setInputValue] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [colonia, setColonia] = useState('');
  const [interiorOrRef, setInteriorOrRef] = useState('');
  const [suggestions, setSuggestions] = useState<OSMPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [markerPosition, setMarkerPosition] = useState<{ lat: number, lng: number } | undefined>(currentCoords);
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse initial address if exists
  useEffect(() => {
    if (currentAddress && !inputValue) {
      let remaining = currentAddress;
      let refPart = '';
      let colPart = '';
      let numPart = '';
      let streetPart = '';

      // Match (Int/Ref: ...)
      const refMatch = remaining.match(/\(Int\/Ref:\s*([^)]+)\)/i);
      if (refMatch) {
        refPart = refMatch[1].trim();
        remaining = remaining.replace(/\(Int\/Ref:\s*[^)]+\)/i, '').trim();
      }

      // Match Col. ...
      const colMatch = remaining.match(/,?\s*Col\.\s*([^,]+)/i);
      if (colMatch) {
        colPart = colMatch[1].trim();
        remaining = remaining.replace(/,?\s*Col\.\s*[^,]+/i, '').trim();
      }

      // Match #number
      const numMatch = remaining.match(/#([0-9a-zA-Z\s-]+)/);
      if (numMatch) {
        numPart = numMatch[1].trim();
        remaining = remaining.replace(/#[0-9a-zA-Z\s-]+/, '').trim();
      }

      streetPart = remaining.replace(/^[,\s]+|[,\s]+$/g, '').trim();

      if (streetPart) setInputValue(streetPart);
      if (numPart) setHouseNumber(numPart);
      if (colPart) setColonia(colPart);
      if (refPart) setInteriorOrRef(refPart);
    }
  }, [currentAddress]);

  const updateRoute = async (dest: { lat: number, lng: number }) => {
    try {
      const res = await getOSRMRoute({ lat: shopLocation.lat, lng: shopLocation.lng }, dest);
      setRouteInfo(res);
    } catch (err) {
      console.warn('Error fetching OSRM route:', err);
    }
  };

  useEffect(() => {
    if (currentCoords) {
      updateRoute(currentCoords);
    }
  }, []);

  const buildFullAddress = (street: string, num: string, col: string, ref: string) => {
    let result = street.trim();
    if (num.trim()) {
      result += ` #${num.trim()}`;
    }
    if (col.trim()) {
      result += `, Col. ${col.trim()}`;
    }
    if (ref.trim()) {
      result += ` (Int/Ref: ${ref.trim()})`;
    }
    return result;
  };

  const handleInputChange = (text: string) => {
    setInputValue(text);
    const full = buildFullAddress(text, houseNumber, colonia, interiorOrRef);
    onSelect(full, markerPosition);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchOSMPlaces(text);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setIsSearching(false);
    }, 350);
  };

  const handleHouseNumberChange = (num: string) => {
    setHouseNumber(num);
    const full = buildFullAddress(inputValue, num, colonia, interiorOrRef);
    onSelect(full, markerPosition);
  };

  const handleColoniaChange = (col: string) => {
    setColonia(col);
    const full = buildFullAddress(inputValue, houseNumber, col, interiorOrRef);
    onSelect(full, markerPosition);
  };

  const handleInteriorOrRefChange = (ref: string) => {
    setInteriorOrRef(ref);
    const full = buildFullAddress(inputValue, houseNumber, colonia, ref);
    onSelect(full, markerPosition);
  };

  const handleSelectPlace = (place: OSMPlace) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const pos = { lat, lng };

    // Extract pure street name without attached colony/town
    const streetName = place.address?.road || place.display_name.split(',')[0].trim();
    const detectedNumber = place.address?.house_number || '';
    const detectedColonia = place.address?.neighbourhood || place.address?.suburb || place.address?.quarter || place.address?.residential || '';

    setInputValue(streetName);
    if (detectedNumber && !houseNumber) {
      setHouseNumber(detectedNumber);
    }
    // Only pre-fill colonia if user has not typed their own
    let activeColonia = colonia;
    if (!colonia && detectedColonia) {
      setColonia(detectedColonia);
      activeColonia = detectedColonia;
    }

    setSuggestions([]);
    setShowSuggestions(false);
    setMarkerPosition(pos);
    updateRoute(pos);

    const full = buildFullAddress(streetName, detectedNumber || houseNumber, activeColonia, interiorOrRef);
    onSelect(full, pos);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("La geolocalización no es compatible con este dispositivo.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        const pos = { lat, lng };
        setMarkerPosition(pos);
        updateRoute(pos);

        const details = await reverseOSMDetails(lat, lng);
        if (details.street) {
          setInputValue(details.street);
        }
        if (details.houseNumber && !houseNumber) {
          setHouseNumber(details.houseNumber);
        }
        let activeColonia = colonia;
        if (!colonia && details.colonia) {
          setColonia(details.colonia);
          activeColonia = details.colonia;
        }

        const full = buildFullAddress(details.street || inputValue, houseNumber || details.houseNumber, activeColonia, interiorOrRef);
        onSelect(full, pos);
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        console.warn("Could not get current position:", error?.message || error);
        alert("No se pudo obtener tu ubicación actual.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapLocationChange = async (pos: { lat: number, lng: number }) => {
    setMarkerPosition(pos);
    updateRoute(pos);
    const details = await reverseOSMDetails(pos.lat, pos.lng);
    if (details.street) {
      setInputValue(details.street);
    }
    if (details.houseNumber && !houseNumber) {
      setHouseNumber(details.houseNumber);
    }
    let activeColonia = colonia;
    // Don't overwrite if user has already customized their colonia
    if (!colonia && details.colonia) {
      setColonia(details.colonia);
      activeColonia = details.colonia;
    }
    const full = buildFullAddress(details.street || inputValue, houseNumber || details.houseNumber, activeColonia, interiorOrRef);
    onSelect(full, pos);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Calle o Avenida</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input 
              disabled={isLocating}
              placeholder="Ej: Av. del Mar, Calle Melchor Ocampo..." 
              className="pl-9 pr-10 text-sm h-11 bg-white border-gray-200 shadow-sm rounded-xl"
              value={inputValue}
              onChange={(e: any) => handleInputChange(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
            />
            {(isSearching || isLocating) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-900 opacity-50" />
              </div>
            )}
          </div>

          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -5 }}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xl absolute z-[100] left-0 right-0 mt-1 max-h-60 overflow-y-auto divide-y divide-gray-100"
              >
                {suggestions.map((place) => {
                  const streetDisplay = place.address?.road || place.display_name.split(',')[0].trim();
                  const hintColonia = place.address?.neighbourhood || place.address?.suburb || place.address?.quarter || '';
                  return (
                    <button
                      key={place.place_id}
                      type="button"
                      onClick={() => handleSelectPlace(place)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 transition-colors flex items-start gap-3"
                    >
                      <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-blue-600">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1 py-0.5">
                        <p className="font-bold text-gray-900 text-xs line-clamp-1">
                          {streetDisplay}
                          {place.address?.house_number ? ` #${place.address.house_number}` : ''}
                        </p>
                        <p className="text-[10px] text-gray-500 line-clamp-1">
                          {hintColonia ? `Col. ${hintColonia} • ` : ''}{place.display_name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Number & Neighborhood Fields for exact location */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">
              No. Exterior <span className="text-blue-600 font-bold">*</span>
            </label>
            <Input 
              placeholder="Ej: 1234, 45-B" 
              className="text-sm h-11 bg-white border-gray-200 shadow-sm rounded-xl font-medium"
              value={houseNumber}
              onChange={(e: any) => handleHouseNumberChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Colonia / Fracc. <span className="text-blue-600 font-bold">*</span></label>
            <Input 
              placeholder="Ej: Juárez, Centro, Marina..." 
              className="text-sm h-11 bg-white border-gray-200 shadow-sm rounded-xl font-medium"
              value={colonia}
              onChange={(e: any) => handleColoniaChange(e.target.value)}
            />
          </div>
        </div>

        <p className="text-[10px] text-gray-500 italic bg-gray-50 p-2 rounded-lg border border-gray-100">
          Tip: Si el mapa sugiere una colonia cercana diferente, puedes escribir o corregir el nombre de tu colonia directamente en el campo de arriba.
        </p>

        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">No. Interior / Depto / Piso / Referencia (Opcional)</label>
          <Input 
            placeholder="Ej: Depto 3B, Portón blanco, Frente al parque" 
            className="text-sm h-11 bg-white border-gray-200 shadow-sm rounded-xl font-medium"
            value={interiorOrRef}
            onChange={(e: any) => handleInteriorOrRefChange(e.target.value)}
          />
        </div>
        
        <button 
          type="button"
          onClick={handleCurrentLocation}
          disabled={isLocating}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-blue-900 text-xs font-bold rounded-xl transition-all border border-gray-200 disabled:opacity-50 shadow-sm active:scale-[0.99]"
        >
          {isLocating ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-900" />
          ) : (
            <Locate className="w-4 h-4 text-blue-600" />
          )}
          Autocompletar con mi ubicación GPS actual
        </button>
      </div>

      <div className="w-full rounded-2xl overflow-hidden border border-gray-200 relative shadow-inner bg-gray-100 h-52">
        <OSMMap
          center={markerPosition || { lat: shopLocation.lat, lng: shopLocation.lng }}
          zoom={markerPosition ? 15 : 13}
          shopLocation={shopLocation}
          customerLocation={markerPosition}
          routeCoordinates={routeInfo?.coordinates}
          onMapClick={handleMapLocationChange}
          onMarkerDragEnd={handleMapLocationChange}
          className="w-full h-full"
        />

        {/* Distance & ETA Badge */}
        {routeInfo && markerPosition && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-600/95 backdrop-blur-sm text-white px-3 py-1.5 rounded-full shadow-lg text-[11px] font-bold border border-white/30 flex items-center gap-1.5 z-10 whitespace-nowrap">
            <Navigation className="w-3.5 h-3.5 text-blue-200 animate-pulse" />
            <span>Ruta: {routeInfo.distanceKm} km (~{routeInfo.durationMin} min)</span>
          </div>
        )}

        <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-bold text-gray-700 shadow-md border border-gray-100 pointer-events-none z-10 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-blue-600" />
          <span>Toca o arrastra el pin para ajustar</span>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-[10px] text-gray-400 font-medium">
        <span>© OpenStreetMap & OSRM</span>
        <span className="text-emerald-600 font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
          Sin límites de facturación
        </span>
      </div>
    </div>
  );
}

const calculateRoadDistance = async (origin: { lat: number, lng: number }, destination: { lat: number, lng: number }): Promise<{ distance: number, fee: number }> => {
  try {
    const route = await getOSRMRoute(origin, destination);
    return {
      distance: route.distanceKm,
      fee: getDeliveryFee(route.distanceKm)
    };
  } catch {
    const d = calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
    const estDistance = Math.max(0.5, Number((d * 1.35).toFixed(1)));
    return { distance: estDistance, fee: getDeliveryFee(estDistance) };
  }
};

function CheckoutPage({ cart, total, products, onBack, onConfirm, profile, isDriverOrdering, shopLocation, isOnline }: any) {
  const isStoreOrdering = profile?.role === 'store_sales';
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>(isStoreOrdering ? 'pickup' : 'delivery');
  const [recipientName, setRecipientName] = useState(isDriverOrdering || isStoreOrdering ? '' : (profile?.name || ''));
  const [address, setAddress] = useState('');
  const [addressLocation, setAddressLocation] = useState<{ lat: number, lng: number } | undefined>(undefined);
  const [phone, setPhone] = useState(profile?.phone || '');
  const [deliverySlot, setDeliverySlot] = useState(isStoreOrdering ? 'Inmediato' : '');
  const [deliveryDate, setDeliveryDate] = useState<string>(() => {
    const now = new Date();
    const day = now.getDay();
    // If Sat (6) or Sun (0), default to next Monday
    if (day === 0) {
      const mon = new Date(now);
      mon.setDate(now.getDate() + 1);
      return mon.toISOString().split('T')[0];
    }
    if (day === 6) {
      const mon = new Date(now);
      mon.setDate(now.getDate() + 2);
      return mon.toISOString().split('T')[0];
    }
    return now.toISOString().split('T')[0];
  });
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notes, setNotes] = useState('');
  const [deliveryWindowStart, setDeliveryWindowStart] = useState('08:00');
  const [deliveryWindowEnd, setDeliveryWindowEnd] = useState('17:30');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryDistance, setDeliveryDistance] = useState(0);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [step, setStep] = useState<'type' | 'address' | 'review' | 'delivery' | 'payment' | 'card-details'>(isStoreOrdering ? 'review' : 'type');

  const [cardInfo, setCardInfo] = useState({
    number: '',
    expiry: '',
    cvv: '',
    name: ''
  });

  const items = Object.entries(cart).map(([id, qty]) => {
    const p = products.find((prod: any) => prod.id === id) || INITIAL_PRODUCTS.find(prod => prod.id === id);
    return { ...p, qty };
  });

  useEffect(() => {
    async function updateDistance() {
      if (orderType === 'delivery' && addressLocation) {
        setIsCalculatingDistance(true);
        const result = await calculateRoadDistance(shopLocation, addressLocation);
        setDeliveryFee(result.fee);
        setDeliveryDistance(result.distance);
        setIsCalculatingDistance(false);
      } else {
        setDeliveryFee(0);
        setDeliveryDistance(0);
      }
    }
    updateDistance();
  }, [orderType, addressLocation]);

  const handleConfirm = async () => {
    if (!isOnline) {
      alert("Debes estar conectado a internet para finalizar este pedido. Por favor, revisa tu conexión.");
      return;
    }
    setIsProcessing(true);
    await onConfirm(address, deliverySlot, paymentMethod, recipientName, orderType, notes, addressLocation, deliveryFee, deliveryDistance, deliveryWindowStart, deliveryWindowEnd);
    setIsProcessing(false);
  };

  const getWindowDuration = () => {
    const [startH, startM] = deliveryWindowStart.split(':').map(Number);
    const [endH, endM] = deliveryWindowEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    // Si el fin es menor al inicio, asumimos que es el día siguiente (pero aquí probablemente sea un error del usuario)
    const diff = endMinutes - startMinutes;
    return diff / 60;
  };

  const windowDuration = getWindowDuration();
  const isWindowTooShort = windowDuration > 0 && windowDuration < 4;
  
  const isOutsideAllowedWindow = (() => {
    const [startH, startM] = deliveryWindowStart.split(':').map(Number);
    const [endH, endM] = deliveryWindowEnd.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    const minLimit = 8 * 60; // 08:00
    const maxLimit = 17 * 60 + 30; // 17:30
    
    if (orderType === 'pickup') {
      return startTotal < minLimit || startTotal > maxLimit;
    }
    return startTotal < minLimit || endTotal > maxLimit;
  })();

  const isLeadTimeInvalid = (() => {
    const now = new Date();
    const isToday = deliveryDate === now.toISOString().split('T')[0];
    if (!isToday) return false;

    const [startH, startM] = deliveryWindowStart.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const currentTotal = now.getHours() * 60 + now.getMinutes();
    const leadTimeNeeded = orderType === 'pickup' ? 60 : 120; // 1 hora pickup, 2 horas delivery
    
    return startTotal < (currentTotal + leadTimeNeeded);
  })();

  const isWindowInvalid = orderType === 'pickup' 
    ? (isOutsideAllowedWindow || isLeadTimeInvalid)
    : (windowDuration <= 0 || isOutsideAllowedWindow);

  const generateSlots = () => {
    const slots = [];
    const now = new Date();
    const isToday = deliveryDate === now.toISOString().split('T')[0];
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    // Time ranges based on order type
    // Pickup: 08:00 to 17:30
    // Delivery: 08:00 to 16:00
    const times = orderType === 'pickup' 
      ? [
          { start: '08:00', end: '09:00' },
          { start: '09:00', end: '10:00' },
          { start: '10:00', end: '11:00' },
          { start: '11:00', end: '12:00' },
          { start: '12:00', end: '13:00' },
          { start: '13:00', end: '14:00' },
          { start: '14:00', end: '15:00' },
          { start: '15:00', end: '16:00' },
          { start: '16:00', end: '17:00' },
          { start: '17:00', end: '17:30' }
        ]
      : [
          { start: '08:00', end: '10:00' },
          { start: '10:00', end: '12:00' },
          { start: '12:00', end: '14:00' },
          { start: '14:00', end: '16:00' }
        ];

    // Rules:
    // 1. If today is Sat/Sun, no delivery slots today (Sat/Sun orders are for Monday+)
    // 2. If it's today, only slots starting at least 1 hour (pickup) or 2 hours (delivery) from now
    // 3. No Sundays (handled by availableDates)

    times.forEach(t => {
      const slotStartTime = new Date(deliveryDate + 'T' + t.start + ':00');
      const leadTimeMinutes = orderType === 'pickup' ? 60 : 120;
      const leadTimeLimit = new Date(now.getTime() + (leadTimeMinutes * 60 * 1000));
      
      let isAvailable = true;
      if (isToday) {
        if (isWeekend && orderType === 'delivery') isAvailable = false; 
        if (slotStartTime < leadTimeLimit) isAvailable = false; 
      }

      if (isAvailable) {
        slots.push({
          label: `${t.start} - ${t.end}`,
          value: `${orderType === 'pickup' ? 'Recogida' : 'Entrega'}: ${deliveryDate} ${t.start}-${t.end}`
        });
      }
    });

    return slots;
  };

  const availableDates = useMemo(() => {
    const dates = [];
    const now = new Date();
    // Show next 8 days
    // If orderType is delivery, start from tomorrow (index 1)
    // If orderType is pickup, start from today (index 0)
    const startIndex = orderType === 'delivery' ? 1 : 0;
    const endIndex = orderType === 'delivery' ? 9 : 8;

    for (let i = startIndex; i < endIndex; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      // Skip Sundays
      if (d.getDay() !== 0) {
        dates.push({
          id: d.toISOString().split('T')[0],
          label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
          date: d
        });
      }
    }
    return dates;
  }, [orderType]);

  const slots = generateSlots();

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6 pb-12"
    >
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Finalizar Pedido</h2>
      </div>

      <div className="flex gap-2 mb-6">
        {['type', 'address', 'review', 'delivery', 'payment', ...(paymentMethod === 'card' ? ['card-details'] : [])].filter(s => {
          if (orderType === 'pickup' && (s === 'address' || s === 'delivery')) return false;
          return true;
        }).map((s: any) => (
          <div key={s} className={cn("h-1 flex-1 rounded-full transition-all duration-500", step === s ? "bg-blue-900" : "bg-gray-200")} />
        ))}
      </div>

      {step === 'type' && (
        <div className="space-y-6">
          <h3 className="font-bold text-gray-900">¿Cómo quieres recibir tu pedido?</h3>
          <div className="grid grid-cols-1 gap-4">
            <button 
              onClick={() => setOrderType('delivery')}
              className={cn(
                "p-6 rounded-3xl border-2 text-left transition-all flex items-center gap-4",
                orderType === 'delivery' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className={cn("p-3 rounded-2xl", orderType === 'delivery' ? "bg-blue-900 text-white" : "bg-gray-100 text-gray-400")}>
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Entrega a Domicilio</p>
                <p className="text-xs text-gray-500">Recibe tus productos en casa</p>
              </div>
            </button>

            <button 
              onClick={() => setOrderType('pickup')}
              className={cn(
                "p-6 rounded-3xl border-2 text-left transition-all flex items-center gap-4",
                orderType === 'pickup' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className={cn("p-3 rounded-2xl", orderType === 'pickup' ? "bg-blue-900 text-white" : "bg-gray-100 text-gray-400")}>
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900">Recoger en Tienda</p>
                <p className="text-xs text-gray-500">Ven por tu pedido cuando esté listo</p>
              </div>
            </button>
          </div>
          <Button onClick={() => orderType === 'delivery' ? setStep('address') : setStep('review')} className="w-full h-12">Continuar</Button>
        </div>
      )}

      {step === 'address' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Datos de Entrega</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre de quien recibe</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input 
                  placeholder="Ej. Juan Pérez" 
                  className="pl-10" 
                  value={recipientName}
                  onChange={(e: any) => setRecipientName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Dirección exacta</label>
              <AddressPicker 
                onSelect={(addr, coords) => {
                  setAddress(addr);
                  setAddressLocation(coords);
                }} 
                currentAddress={address}
                currentCoords={addressLocation}
                shopLocation={shopLocation}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Notas (opcional)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                <textarea 
                  placeholder="Ej. Tocar el timbre fuerte, casa de portón negro..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 min-h-[80px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1">Teléfono de contacto</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input 
                  placeholder="Ej. 6691234567" 
                  className="pl-10" 
                  value={phone}
                  onChange={(e: any) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {address && addressLocation && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3"
            >
              <div className="p-2 bg-blue-100 rounded-lg text-blue-900">
                <Truck className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-900 uppercase">Costo de envío calculado</p>
                {isCalculatingDistance ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                    <span className="text-xs text-blue-600 italic">Calculando ruta real...</span>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-gray-900">${deliveryFee.toFixed(2)}</p>
                    <p className="text-[10px] text-blue-500 font-medium">Distancia por carretera: {deliveryDistance.toFixed(1)} km</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('type')} className="flex-1">Atrás</Button>
            <Button 
              onClick={() => {
                if (!addressLocation) {
                  setAddressLocation({ lat: shopLocation.lat, lng: shopLocation.lng });
                }
                setStep('review');
              }} 
              disabled={!address || isCalculatingDistance} 
              className="flex-[2]"
            >
              Ver Resumen
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          {isStoreOrdering && (
            <div className="bg-amber-50 p-4 rounded-3xl border border-amber-100 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <UserIcon className="w-4 h-4" />
                <h3 className="font-bold text-sm">Datos del Cliente (Mostrador)</h3>
              </div>
              <Input 
                placeholder="Nombre del Cliente (Ej. Cliente Mostrador, Jorge Beltrán...)"
                value={recipientName}
                onChange={(e: any) => setRecipientName(e.target.value)}
                className="bg-white border-amber-200 focus:ring-amber-500"
              />
            </div>
          )}
          <h3 className="font-bold text-gray-900">Revisar Artículos</h3>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} className="w-12 h-12 rounded-lg object-cover" alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Package className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {item.name || 'Producto Desconocido'}
                      {item.unit === 'Kg' && item.approxWeight && (
                        <span className="text-gray-400 font-normal"> ({item.approxWeight} Kg aprox.)</span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {(item as any).qty} {item.unit || 'Paq'} x 
                      ${(item.unit === 'Kg' ? (item.price * (item.approxWeight || 1)) : item.price).toFixed(2)}
                      {item.unit === 'Kg' && <span className="ml-1 italic">(Ref: ${item.price.toFixed(2)}/Kg)</span>}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-gray-900">
                  ${(((item as any).qty || 0) * (item.price || 0) * (item.unit === 'Kg' ? (item.approxWeight || 1) : 1)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="bg-[#0056b3]/5 p-4 rounded-xl space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal Productos</span>
              <span>${(total || 0).toFixed(2)}</span>
            </div>
            {items.some(i => i.unit === 'Kg') && (
              <div className="p-2 bg-orange-50 border border-orange-100 rounded-lg">
                <p className="text-[10px] text-orange-700 font-bold leading-tight">
                  EL TOTAL SE AJUSTARÁ SEGÚN EL PESO REAL
                </p>
                <p className="text-[9px] text-orange-600 mt-0.5">
                  Artículos por kilo serán pesados durante la preparación. El monto final puede variar ligeramente.
                </p>
              </div>
            )}
            {orderType === 'delivery' && (
              <div className="flex justify-between text-sm text-gray-600">
                <div className="flex flex-col">
                  <span>Costo de Envío</span>
                  {isCalculatingDistance ? (
                    <span className="text-[10px] text-blue-600 animate-pulse font-medium">Calculando ruta...</span>
                  ) : (
                    deliveryDistance > 0 && (
                      <span className="text-[10px] text-gray-400 font-medium">Distancia real: {deliveryDistance.toFixed(1)} km</span>
                    )
                  )}
                </div>
                <span>{isCalculatingDistance ? "..." : `$${deliveryFee.toFixed(2)}`}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-600">
              <span>IVA Incluido (16%)</span>
              <span>${(((total || 0) + deliveryFee) - (((total || 0) + deliveryFee) / 1.16)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-blue-900 pt-2 border-t border-blue-900/10">
              <span>Total</span>
              <span>${((total || 0) + deliveryFee).toFixed(2)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => orderType === 'delivery' ? setStep('address') : setStep('type')} className="flex-1">Atrás</Button>
            <Button onClick={() => setStep('delivery')} className="flex-[2]">Continuar</Button>
          </div>
        </div>
      )}
      {step === 'delivery' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-gray-900 mb-4">¿Cuándo quieres recibir tu pedido?</h3>
            {orderType === 'delivery' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-900 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-800 leading-tight">
                  <span className="font-bold">Nota:</span> Los pedidos a domicilio deben programarse con al menos <span className="font-bold">24 horas de antelación</span>.
                </p>
              </div>
            )}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {availableDates.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDeliveryDate(d.id)}
                  className={cn(
                    "flex-shrink-0 p-3 rounded-2xl border-2 text-center transition-all min-w-[100px]",
                    deliveryDate === d.id ? "border-blue-900 bg-blue-50" : "border-gray-100 bg-white"
                  )}
                >
                  <p className={cn("text-[10px] font-bold uppercase", deliveryDate === d.id ? "text-blue-900" : "text-gray-400")}>
                    {d.label.split(' ')[0]}
                  </p>
                  <p className="text-lg font-black text-gray-900 leading-none">
                    {d.date.getDate()}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    {d.date.toLocaleDateString('es-ES', { month: 'short' })}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-gray-900">
              {orderType === 'pickup' ? 'Define tu Hora de Recogida' : 'Define tu Ventana de Recepción'}
            </h3>
            <p className="text-xs text-gray-500">
              {orderType === 'pickup' 
                ? 'Dinos a qué hora pasarás por tu pedido.' 
                : 'Dinos en qué horario estarás disponible para recibir los productos.'}
            </p>
            
            <div className={cn("grid gap-4", orderType === 'pickup' ? "grid-cols-1" : "grid-cols-2")}>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">
                  {orderType === 'pickup' ? 'Hora de Recogida' : 'Desde las'}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input 
                    type="time" 
                    value={deliveryWindowStart}
                    onChange={(e) => {
                      setDeliveryWindowStart(e.target.value);
                      if (orderType === 'pickup') {
                        setDeliveryWindowEnd(e.target.value);
                        setDeliverySlot(`Recogida: ${deliveryDate} ${e.target.value}`);
                      } else {
                        setDeliverySlot(`${deliveryDate} ${e.target.value}-${deliveryWindowEnd}`);
                      }
                    }}
                    className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                  />
                </div>
              </div>
              {orderType === 'delivery' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Hasta las</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                      type="time" 
                      value={deliveryWindowEnd}
                      onChange={(e) => {
                        setDeliveryWindowEnd(e.target.value);
                        setDeliverySlot(`${deliveryDate} ${deliveryWindowStart}-${e.target.value}`);
                      }}
                      className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                    />
                  </div>
                </div>
              )}
            </div>

            {isOutsideAllowedWindow && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-700 leading-tight">
                  {orderType === 'pickup' 
                    ? 'Nuestro horario de atención es de 8:00 AM a 5:30 PM.' 
                    : 'Las entregas solo se realizan entre las 8:00 AM y las 5:30 PM.'}
                </p>
              </div>
            )}

            {isLeadTimeInvalid && !isOutsideAllowedWindow && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-700 leading-tight">
                  {orderType === 'pickup'
                    ? 'Necesitamos al menos 1 hora de anticipación para tener tu pedido listo.'
                    : 'Los pedidos del mismo día requieren al menos 2 horas de anticipación.'}
                </p>
              </div>
            )}

            {orderType === 'delivery' && isWindowInvalid && !isOutsideAllowedWindow && !isLeadTimeInvalid && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-rose-700 leading-tight">La hora de fin debe ser posterior a la hora de inicio.</p>
              </div>
            )}

            {orderType === 'delivery' && isWindowTooShort && !isWindowInvalid && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 shadow-sm">
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-tight">
                  <span className="font-bold">Aviso:</span> Tu ventana es de {windowDuration % 1 === 0 ? windowDuration : windowDuration.toFixed(1)} horas. 
                  Recomendamos una ventana de <span className="font-bold">al menos 4 horas</span> para que el repartidor pueda planificar mejor su ruta.
                </p>
              </div>
            )}

            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
              <div className="flex gap-3">
                {orderType === 'pickup' ? <Package className="w-5 h-5 text-blue-900 shrink-0" /> : <Truck className="w-5 h-5 text-blue-900 shrink-0" />}
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  {orderType === 'pickup' 
                    ? 'Tendremos tus productos listos y pesados a la hora que indiques. ¡Te esperamos!' 
                    : 'El despachador organizará la ruta considerando tu preferencia. Si hay saturación o retrasos fuera de tu ventana, te avisaremos de inmediato.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('review')} className="flex-1">Atrás</Button>
            <Button 
              onClick={() => {
                if (orderType === 'pickup') {
                  setDeliverySlot(`Recogida: ${deliveryDate} a las ${deliveryWindowStart}`);
                } else {
                  setDeliverySlot(`${deliveryDate} ${deliveryWindowStart}-${deliveryWindowEnd}`);
                }
                setStep('payment');
              }} 
              className="flex-[2] h-12"
              disabled={isWindowInvalid}
            >
              Continuar al Pago
            </Button>
          </div>
        </div>
      )}

      {step === 'payment' && (
        <div className="space-y-4">
          <h3 className="font-bold text-gray-900">Método de Pago</h3>
          <div className="space-y-3">
            <button 
              onClick={() => setPaymentMethod('cash')}
              className={cn(
                "w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all",
                paymentMethod === 'cash' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-900 text-sm">Efectivo</p>
                  <p className="text-[10px] text-gray-500">Paga al repartidor al momento de la entrega</p>
                </div>
              </div>
              {paymentMethod === 'cash' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            </button>

            <button 
              onClick={() => setPaymentMethod('card')}
              className={cn(
                "w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all",
                paymentMethod === 'card' ? "border-blue-900 bg-emerald-50" : "border-gray-100 bg-white"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-900 text-sm">Tarjeta de Débito o Crédito</p>
                  <p className="text-[10px] text-gray-500">Pago en línea al realizar el pedido</p>
                </div>
              </div>
              {paymentMethod === 'card' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            </button>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => orderType === 'pickup' ? setStep('review') : setStep('delivery')} className="flex-1">Atrás</Button>
            {paymentMethod === 'card' ? (
              <Button onClick={() => setStep('card-details')} className="flex-[2]">Datos de Tarjeta</Button>
            ) : (
              <Button onClick={handleConfirm} className="flex-[2]" disabled={isProcessing}>
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Confirmar Pedido $${((total || 0) + deliveryFee).toFixed(2)}`}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'card-details' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-gray-900">Información de Tarjeta</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Nombre en la Tarjeta</label>
              <Input 
                placeholder="Como aparece en la tarjeta"
                value={cardInfo.name}
                onChange={(e: any) => setCardInfo(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Número de Tarjeta</label>
              <Input 
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                value={cardInfo.number}
                onChange={(e: any) => {
                  const val = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
                  setCardInfo(prev => ({ ...prev, number: val }));
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Vencimiento</label>
                <Input 
                  placeholder="MM/AA"
                  maxLength={5}
                  value={cardInfo.expiry}
                  onChange={(e: any) => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                    setCardInfo(prev => ({ ...prev, expiry: val }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">CVV</label>
                <Input 
                  placeholder="123"
                  type="password"
                  maxLength={3}
                  value={cardInfo.cvv}
                  onChange={(e: any) => setCardInfo(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '') }))}
                />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Tus datos están protegidos. Esta es una transacción segura encriptada de extremo a extremo.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('payment')} className="flex-1">Atrás</Button>
            <Button 
              onClick={handleConfirm} 
              className="flex-[2]" 
              disabled={isProcessing || !cardInfo.name || cardInfo.number.length < 16 || cardInfo.expiry.length < 5 || cardInfo.cvv.length < 3}
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Pagar $${((total || 0) + deliveryFee).toFixed(2)}`}
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function AdminReturnsView({ 
  returns, 
  products,
  onBack,
  showToast,
  onRefresh
}: { 
  returns: Return[], 
  products: Product[],
  onBack: () => void,
  showToast: any,
  onRefresh?: () => void
}) {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const handleProcessReturn = async (ret: Return, resolution: 'waste' | 'stock') => {
    setIsProcessing(ret.id);
    try {
      const updateData: any = {
        resolution,
        status: 'approved',
        processedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'returns', ret.id), updateData);

      if (resolution === 'stock') {
        // Add items back to stock
        for (const item of ret.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            await updateDoc(doc(db, 'products', product.id), {
              stock: product.stock + item.quantity
            });
          }
        }
      } else if (resolution === 'waste') {
        // Create waste records (InventoryRequests)
        for (const item of ret.items) {
          const currentProduct = products.find(p => p.id === item.productId);
          await addDoc(collection(db, 'inventoryRequests'), {
            productId: item.productId,
            productName: item.name,
            type: 'waste',
            oldValue: currentProduct?.stock || 0,
            // We set newValue to oldValue - quantity so it shows up in "Mermas" tab as a loss
            newValue: (currentProduct?.stock || 0) - item.quantity,
            reason: `Devolución - Merma: ${item.reason}`,
            status: 'approved',
            requestedBy: 'system',
            requestedByName: 'Gestión Devoluciones',
            createdAt: serverTimestamp()
          });
        }
      }

      // Notify user
      await addDoc(collection(db, 'notifications'), {
        userId: ret.userId || 'unknown',
        title: 'Devolución Procesada',
        message: `Tu devolución para el pedido #${(ret.orderId || '').slice(-6).toUpperCase()} ha sido procesada (${resolution === 'stock' ? 'Devuelta a stock' : 'Enviada a merma'}).`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      showToast("Devolución procesada con éxito", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `returns/${ret.id}`);
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">Gestión de Devoluciones</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} className="p-2 h-10 w-10 flex items-center justify-center">
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-4">
        {returns.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay devoluciones pendientes</p>
          </div>
        ) : (
          returns.map(ret => (
            <div key={ret.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Solicitado por {ret.userName}</p>
                  <h4 className="font-bold text-gray-900">Pedido #{ret.orderId.slice(-6).toUpperCase()}</h4>
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-1 rounded font-bold uppercase",
                  ret.status === 'approved' && ret.resolution === 'none' ? "bg-blue-100 text-blue-600" :
                  ret.status === 'approved' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                )}>
                  {ret.status === 'approved' && ret.resolution === 'none' ? 'Pendiente Procesar' : ret.status}
                </span>
              </div>

              <div className="space-y-3">
                {ret.items.map((item, i) => (
                  <div key={i} className="flex gap-4 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} className="w-16 h-16 rounded-xl object-cover" alt="" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gray-200 flex items-center justify-center">
                        <Package className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-bold text-gray-900">{item.quantity}x {item.name}</p>
                      <p className="text-[10px] text-gray-500 italic">"{item.reason}"</p>
                      <p className="text-xs font-bold text-blue-900">-${(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {ret.status === 'approved' && ret.resolution === 'none' && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="col-span-2 grid grid-cols-2 gap-2">
                    <Button 
                      className="bg-green-600 hover:bg-green-700 text-white text-xs py-3 rounded-xl"
                      onClick={() => handleProcessReturn(ret, 'stock')}
                      disabled={isProcessing === ret.id}
                    >
                      Aprobar (Al Stock)
                    </Button>
                    <Button 
                      className="bg-orange-600 hover:bg-orange-700 text-white text-xs py-3 rounded-xl"
                      onClick={() => handleProcessReturn(ret, 'waste')}
                      disabled={isProcessing === ret.id}
                    >
                      Aprobar (A Mermas)
                    </Button>
                  </div>
                </div>
              )}

              {ret.resolution !== 'none' && (
                <div className="pt-2 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-400">
                  <span>Procesado el {ret.processedAt?.toDate().toLocaleString()}</span>
                  <span className="font-bold uppercase">Resolución: {ret.resolution}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function ReturnModal({ 
  order, 
  onClose, 
  onSubmit,
  showToast
}: { 
  order: Order, 
  onClose: () => void, 
  onSubmit: (returnData: any) => Promise<void>,
  showToast: any
}) {
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [itemPhotos, setItemPhotos] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});

  const toggleItem = (productId: string, maxQty: number) => {
    setSelectedItems(prev => {
      if (prev[productId]) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: 1 };
    });
  };

  const handleQtyChange = (productId: string, val: number, max: number) => {
    const qty = Math.max(1, Math.min(max, val));
    setSelectedItems(prev => ({ ...prev, [productId]: qty }));
  };

  const handleReasonChange = (productId: string, reason: string) => {
    setReasons(prev => ({ ...prev, [productId]: reason }));
  };

  const handleSubmit = async () => {
    if (Object.keys(selectedItems).length === 0) {
      showToast("Selecciona al menos un producto", 'error');
      return;
    }

    const missingReason = Object.keys(selectedItems).find(id => !reasons[id]?.trim());
    if (missingReason) {
      showToast("Por favor describe el motivo de la devolución", 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsToReturn = order.items
        .filter(item => selectedItems[item.productId])
        .map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: selectedItems[item.productId!],
          price: item.price,
          unit: item.unit || 'Paq',
          approxWeight: item.approxWeight || 0,
          reason: reasons[item.productId!],
          photoUrl: itemPhotos[item.productId!] || ""
        }));

      const totalReduction = itemsToReturn.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      await onSubmit({
        orderId: order.id || '',
        userId: order.userId || 'unknown',
        userName: order.userName || 'Usuario',
        items: itemsToReturn || [],
        totalReduction: totalReduction || 0,
        status: 'approved',
        resolution: 'none',
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-xl">Solicitar Devolución</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <p className="text-sm text-gray-500">Selecciona los productos que deseas devolver y explica el motivo.</p>

        <div className="space-y-4">
          {order.items.map((item, i) => (
            <div key={i} className={cn(
              "p-4 rounded-2xl border transition-all space-y-3",
              selectedItems[item.productId!] ? "border-red-200 bg-red-50/30" : "border-gray-100"
            )}>
              <div className="flex items-center gap-3">
                <div 
                  onClick={() => toggleItem(item.productId!, item.quantity)}
                  className={cn(
                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer",
                    selectedItems[item.productId!] ? "bg-red-500 border-red-500" : "border-gray-200"
                  )}
                >
                  {selectedItems[item.productId!] && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="flex-1">
                  <label htmlFor={`item-${i}`} className="text-sm font-bold text-gray-900 block cursor-pointer">
                    {item.name}
                  </label>
                  <p className="text-xs text-gray-500">${item.price.toFixed(2)} / {item.unit || 'Paq'}</p>
                </div>
              </div>

              {selectedItems[item.productId!] && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase">Cantidad</span>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleQtyChange(item.productId!, selectedItems[item.productId!] - 1, item.quantity)}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-bold">{selectedItems[item.productId!]}</span>
                      <button 
                        onClick={() => handleQtyChange(item.productId!, selectedItems[item.productId!] + 1, item.quantity)}
                        className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Motivo del descontento</label>
                    <textarea 
                      placeholder="Describe por qué devuelves este producto..."
                      className="w-full p-3 rounded-xl border border-gray-100 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none min-h-[80px]"
                      value={reasons[item.productId!] || ''}
                      onChange={(e) => handleReasonChange(item.productId!, e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block mb-1">Evidencia (Foto)</label>
                    {itemPhotos[item.productId!] ? (
                      <div className="relative w-24 h-24 group">
                        <img 
                          src={itemPhotos[item.productId!]} 
                          className="w-full h-full object-cover rounded-xl border border-gray-200"
                          alt="Evidencia"
                        />
                        <button 
                          onClick={() => setItemPhotos(prev => {
                            const next = { ...prev };
                            delete next[item.productId!];
                            return next;
                          })}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                        {isUploading[item.productId!] ? (
                          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                        ) : (
                          <>
                            <Camera className="w-5 h-5 text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Subir Foto</span>
                          </>
                        )}
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsUploading(prev => ({ ...prev, [item.productId!]: true }));
                            try {
                              const blob = await compressImageToBlob(file, 800, 800, 0.7);
                              const filename = `returns/return_${order.id}_${item.productId}_${Date.now()}.jpg`;
                              const url = await uploadImage(blob, filename);
                              setItemPhotos(prev => ({ ...prev, [item.productId!]: url }));
                            } catch (err) {
                              showToast("Error al subir foto", 'error');
                            } finally {
                              setIsUploading(prev => ({ ...prev, [item.productId!]: false }));
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Button 
            className="w-full h-12 bg-red-600 hover:bg-red-700 font-bold"
            onClick={handleSubmit}
            disabled={isSubmitting || Object.keys(selectedItems).length === 0}
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Enviar Solicitud de Devolución"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function CurrentOrderPage({ 
  orders, 
  onGoHome,
  onCancelOrder,
  onModifyOrder,
  showToast
}: { 
  orders: Order[], 
  onGoHome: () => void,
  onCancelOrder: (orderId: string) => Promise<void>,
  onModifyOrder: (order: Order) => void,
  showToast: any
}) {
  const activeOrders = orders.filter(o => ['pending', 'processing', 'ready', 'shipped'].includes(o.status));
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showConfirmModify, setShowConfirmModify] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const handleSubmitReturn = async (returnData: any) => {
    try {
      await addDoc(collection(db, 'returns'), returnData);
      
      const orderToUpdate = activeOrders.find(o => o.id === returnData.orderId);
      if (orderToUpdate) {
        const isCardPayment = orderToUpdate.paymentMethod === 'card' || orderToUpdate.paymentMethod === 'online' || orderToUpdate.paymentStatus === 'paid';
        
        const currentTotal = orderToUpdate?.adjustedTotal ?? orderToUpdate?.total ?? 0;
        // Only reduce total if it's cash payment. If card, total stays same because we do physical exchange.
        const newAdjustedTotal = isCardPayment ? currentTotal : Math.max(0, currentTotal - returnData.totalReduction);

        // Update items list (items still "bought" if it's card payment replacement?
        // Actually, if it's a return, we remove them from the original order items list to reflect current status,
        // but for card payments, we create a NEW order with these items at $0.
        const updatedItems = orderToUpdate.items.map(item => {
          const returnedItem = returnData.items.find(ri => ri.productId === item.productId);
          if (returnedItem) {
            return { ...item, quantity: item.quantity - returnedItem.quantity };
          }
          return item;
        }).filter(item => item.quantity > 0);

        // Track returned items separately
        const currentReturnedItems = [...(orderToUpdate.returnedItems || [])];
        returnData.items.forEach(ri => {
          const existing = currentReturnedItems.find(e => e.productId === ri.productId);
          if (existing) {
            existing.quantity += ri.quantity;
          } else {
            currentReturnedItems.push({ ...ri });
          }
        });

        await updateDoc(doc(db, 'orders', returnData.orderId), {
          items: updatedItems,
          returnedItems: currentReturnedItems,
          hasReturns: true,
          adjustedTotal: newAdjustedTotal
        });

        // 1. If it's a card/online payment, create a NEW order for physical exchange at $0
        if (isCardPayment) {
          const exchangePickupCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          const exchangeOrderData = {
            userId: orderToUpdate.userId || 'unknown',
            userName: orderToUpdate.userName || 'Usuario',
            userEmail: orderToUpdate.userEmail || '',
            userPhone: orderToUpdate.userPhone || '',
            items: (returnData.items || []).map((item: any) => ({ 
              productId: item.productId || '',
              name: item.name || 'Producto',
              quantity: item.quantity || 0,
              price: 0,
              unit: item.unit || 'Paq',
              approxWeight: item.approxWeight || 0
            })),
            total: 0,
            adjustedTotal: 0,
            status: 'pending',
            paymentStatus: 'paid',
            paymentMethod: orderToUpdate.paymentMethod || 'card',
            type: orderToUpdate.type || 'delivery',
            address: orderToUpdate.address || '',
            location: orderToUpdate.location && typeof orderToUpdate.location.lat === 'number' && typeof orderToUpdate.location.lng === 'number'
              ? { lat: orderToUpdate.location.lat, lng: orderToUpdate.location.lng }
              : null,
            createdAt: serverTimestamp(),
            pickupCode: exchangePickupCode,
            notes: `Cambio Físico por devolución del pedido #${(orderToUpdate.id || '').slice(-6).toUpperCase()}`,
            isExchange: true
          };

          await addDoc(collection(db, 'orders'), exchangeOrderData);

          await addDoc(collection(db, 'notifications'), {
            userId: orderToUpdate.userId || 'unknown',
            title: 'Cambio Físico Programado',
            message: `Se ha generado una nueva orden #${exchangePickupCode} sin costo por tu cambio físico. Podrás verla en tu historial.`,
            type: 'order',
            read: false,
            createdAt: serverTimestamp()
          });

          showToast("Pago con tarjeta detectado. Se ha generado una orden de cambio físico sin costo.", 'info');
        } else {
          // Update driver via notifications if order is shipped (only for cash where total actually changes)
          if (orderToUpdate.driverId) {
            await addDoc(collection(db, 'notifications'), {
              userId: orderToUpdate.driverId,
              title: 'Devolución Realizada',
              message: `El cliente ha realizado una devolución para el pedido #${orderToUpdate.id.slice(-6).toUpperCase()}. El nuevo total a cobrar es $${newAdjustedTotal.toFixed(2)}.`,
              type: 'order',
              read: false,
              createdAt: serverTimestamp()
            });
          }
          showToast("Devolución realizada con éxito. Tu total ha sido actualizado.", 'success');
        }
      }

      setShowReturnModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'returns');
    }
  };

  useEffect(() => {
    if (activeOrders.length > 0) {
      const exists = activeOrders.some(o => o.id === selectedOrderId);
      if (!exists) {
        setSelectedOrderId(activeOrders[0].id);
      }
    } else {
      setSelectedOrderId(null);
    }
  }, [activeOrders, selectedOrderId]);

  const order = activeOrders.find(o => o.id === selectedOrderId) || (activeOrders.length > 0 ? activeOrders[0] : null);

  if (activeOrders.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <ClipboardList className="w-10 h-10 text-gray-300" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sin Pedidos Activos</h2>
        <p className="text-gray-500 mb-6">No tienes ningún pedido en curso en este momento.</p>
        <Button onClick={onGoHome}>Empezar a Comprar</Button>
      </div>
    );
  }

  const allStatuses = ['pending', 'processing', 'ready', 'shipped', 'delivered'];
  const statusLabels: Record<string, string> = {
    pending: 'pendiente',
    processing: 'procesando',
    ready: 'listo',
    shipped: 'enviado',
    delivered: 'entregado',
    cancelled: 'cancelado'
  };

  const displayStatuses = order?.type === 'pickup' 
    ? allStatuses.filter(s => s !== 'shipped')
    : allStatuses;

  const currentIdx = order ? displayStatuses.indexOf(order.status) : -1;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {activeOrders.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {activeOrders.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedOrderId(o.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
                selectedOrderId === o.id 
                  ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100" 
                  : "bg-white text-gray-500 border-gray-100 hover:border-red-200"
              )}
            >
              Pedido #{o.id.slice(-6).toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {order && (
        <>
          <div className="bg-[#0056b3] text-white p-6 rounded-3xl shadow-xl shadow-blue-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-blue-100 text-sm">
                  {order.isExchange ? "Cambio Físico de Pedido" : `Estado del Pedido #${order.id.slice(-6).toUpperCase()}`}
                </p>
                <h2 className="text-2xl font-bold capitalize">{statusLabels[order.status] || order.status}</h2>
              </div>
              <div className="bg-white/20 p-2 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            </div>

            <div className="bg-white/10 p-4 rounded-2xl mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold opacity-70">
                  {order.type === 'pickup' ? 'Código de Recogida' : 'Código de Entrega'}
                </p>
                {order.type === 'pickup' && order.paymentStatus === 'pending' ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-blue-200">Pendiente de Pago en Tienda</p>
                    <p className="text-[10px] text-blue-100 opacity-60">Realiza tu pago en caja para recibir tu código de entrega.</p>
                  </div>
                ) : order.paymentMethod === 'cash' && order.paymentStatus === 'pending' ? (
                  <p className="text-sm font-bold text-blue-200">Pendiente de Cobro por Repartidor</p>
                ) : (
                  <p className="text-xl font-black tracking-widest">{order.pickupCode}</p>
                )}
              </div>
              <div className="p-2 bg-white rounded-xl">
                <Package className="w-6 h-6 text-[#0056b3]" />
              </div>
            </div>
            
            <div className="relative flex justify-between">
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-white/20" />
              <div 
                className="absolute top-4 left-0 h-0.5 bg-white transition-all duration-1000" 
                style={{ width: `${(currentIdx / (displayStatuses.length - 1)) * 100}%` }}
              />
              {displayStatuses.map((s, i) => (
                <div key={s} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                    i <= currentIdx ? "bg-white text-[#0056b3]" : "bg-blue-400 text-white"
                  )}>
                    {i < currentIdx ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                  </div>
                  <span className="text-[10px] font-medium capitalize opacity-80">{statusLabels[s]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-4">
            <h3 className="font-bold text-gray-900">Detalles del Pedido</h3>
            <div className="space-y-3">
              {order.items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.quantity}x {item.name}
                    {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight || item.approxWeight) && (
                      <span className="text-[10px] text-gray-400 block -mt-1 ml-4 italic">
                        ({item.loaderWeight || item.preparerWeight || (item.approxWeight ? (item.approxWeight * item.quantity) : 0)} Kg)
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-gray-900">
                    ${(item.unit === 'Kg' 
                      ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                      : (item.price * item.quantity)).toFixed(2)}
                  </span>
                </div>
              ))}
              {(order.returnedItems || []).map((item: any, i: number) => (
                <div key={`ret-${i}`} className="flex justify-between text-sm text-orange-600 italic">
                  <span className="flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    {item.quantity}x {item.name} (Devuelto)
                  </span>
                  <span className="font-medium">-${(item.quantity * item.price).toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-gray-100 space-y-1">
                {(order.deliveryFee || 0) > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Costo de Envío</span>
                    <span>${(order.deliveryFee || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-600">
                  <span>IVA Incluido (16%)</span>
                  <span>${((order.adjustedTotal ?? order.total) - ((order.adjustedTotal ?? order.total) / 1.16)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-100">
                  <span>Subtotal con IVA</span>
                  <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
                </div>
                {order.hasReturns && (
                  <div className="flex justify-between text-orange-600 font-medium">
                    <span>Descuento Devolución</span>
                    <span>-${(order.total - (order.adjustedTotal ?? order.total)).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-lg pt-1 text-[#0056b3]">
                  <span className="flex items-center gap-1">
                    Total Final
                    {order.weightValidated && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded">PESO VALIDADO</span>}
                  </span>
                  <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
                </div>

              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-start gap-3">
            <MapPin className="w-5 h-5 text-[#d9534f] shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{order.type === 'pickup' ? 'Lugar de Recogida' : 'Dirección de Entrega'}</p>
              <p className="text-sm font-medium text-gray-900">{order.address}</p>
            </div>
          </div>

          {order.status !== 'cancelled' && (
            <Button 
              variant="outline" 
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
              onClick={() => generateInvoicePDF(order)}
            >
              <FileText className="w-5 h-5" />
              Descargar Factura PDF
            </Button>
          )}

          {['pending', 'processing', 'shipped'].includes(order.status) && (
            <div className="space-y-3 pt-4 border-t border-gray-100">
              {['pending', 'processing'].includes(order.status) ? (
                <>
                  <p className="text-xs text-center text-gray-400">¿Necesitas hacer cambios? Puedes modificar o cancelar tu pedido antes de que sea despachado.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="secondary" 
                      className="rounded-2xl py-4 flex items-center justify-center gap-2 text-red-600 bg-red-50 hover:bg-red-100 border-none"
                      onClick={() => setShowConfirmCancel(true)}
                    >
                      <Trash2 className="w-5 h-5" />
                      Cancelar
                    </Button>
                    <Button 
                      variant="outline" 
                      className="rounded-2xl py-4 flex items-center justify-center gap-2 border-gray-200 text-gray-700 hover:bg-gray-50"
                      onClick={() => setShowConfirmModify(true)}
                    >
                      <Edit className="w-5 h-5" />
                      Modificar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="bg-red-50 p-4 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-900">¿Problemas con los productos?</p>
                      <p className="text-[10px] text-red-700">Si algún producto no está en buen estado, puedes solicitar una devolución parcial ahora.</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full py-3 rounded-xl border-red-200 text-red-600 hover:bg-red-100 bg-white"
                    onClick={() => setShowReturnModal(true)}
                    disabled={!order.arrivedAt || !!order.reviewedAt}
                  >
                    Solicitar Devolución
                  </Button>
                  {!order.arrivedAt ? (
                    <p className="text-[10px] text-center text-red-400 font-medium">
                      Estará disponible cuando el repartidor confirme su llegada
                    </p>
                  ) : !order.reviewedAt ? (
                    <p className="text-[10px] text-center text-orange-500 font-medium bg-orange-50 p-2 rounded-lg">
                      El repartidor ha llegado. Por favor revisa tu pedido. Si todo está bien, infórmale al repartidor.
                    </p>
                  ) : (
                    <p className="text-[10px] text-center text-green-600 font-medium bg-green-50 p-2 rounded-lg">
                      Mercancía revisada con éxito. Procede con el pago si es necesario.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <AnimatePresence>
            {showReturnModal && (
              <ReturnModal 
                order={order}
                onClose={() => setShowReturnModal(false)}
                onSubmit={handleSubmitReturn}
                showToast={showToast}
              />
            )}
            {showConfirmCancel && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-6"
                >
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">¿Cancelar Pedido?</h3>
                    <p className="text-gray-500 mt-2">Esta acción no se puede deshacer. El pedido será cancelado permanentemente.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button 
                      className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold"
                      onClick={async () => {
                        setIsCancelling(true);
                        await onCancelOrder(order.id);
                        setIsCancelling(false);
                        setShowConfirmCancel(false);
                      }}
                      disabled={isCancelling}
                    >
                      {isCancelling ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Sí, Cancelar Pedido"}
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full py-4 text-gray-500 font-bold"
                      onClick={() => setShowConfirmCancel(false)}
                      disabled={isCancelling}
                    >
                      No, Mantener Pedido
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}

            {showConfirmModify && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-6"
                >
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                    <Edit className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">¿Modificar Pedido?</h3>
                    <p className="text-gray-500 mt-2">Esto cancelará el pedido actual y devolverá los productos a tu carrito para que puedas editarlos.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button 
                      className="w-full py-4 bg-[#0056b3] hover:bg-blue-700 text-white rounded-2xl font-bold"
                      onClick={() => {
                        onModifyOrder(order);
                        setShowConfirmModify(false);
                      }}
                    >
                      Sí, Modificar
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full py-4 text-gray-500 font-bold"
                      onClick={() => setShowConfirmModify(false)}
                    >
                      No, Regresar
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

function HistoryPage({ orders }: any) {
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const completedOrders = orders.filter((o: any) => ['delivered', 'cancelled'].includes(o.status));

  if (completedOrders.length === 0) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <History className="w-10 h-10 text-gray-300" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sin Historial de Pedidos</h2>
        <p className="text-gray-500">Tus pedidos anteriores aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      <h2 className="text-xl font-bold text-gray-900 mb-4">Historial de Pedidos</h2>
      {completedOrders.map((order: any) => (
        <button 
          key={order.id} 
          onClick={() => setSelectedOrder(order)}
          className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-red-600 transition-colors"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-gray-900">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                {order.isExchange && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase">Cambio</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : 'Recién'}</p>
            </div>
            <span className={cn(
              "px-2 py-1 rounded text-[10px] font-bold uppercase",
              order.status === 'delivered' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
            )}>
              {order.status === 'delivered' ? 'entregado' : 'cancelado'}
            </span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-gray-50">
            <div className="flex flex-col">
              <p className="text-sm text-gray-500">{order.items.length} artículos</p>
              {order.hasReturns && (
                <span className="flex items-center gap-1 text-[10px] text-orange-600 font-bold uppercase mt-1">
                  <RotateCcw className="w-3 h-3" />
                  Con Devoluciones
                </span>
              )}
            </div>
            <div className="text-right">
              {order.hasReturns && order.adjustedTotal !== undefined && (
                <p className="text-[10px] text-gray-400 line-through">${Number(order.total).toFixed(2)}</p>
              )}
              <p className="font-bold text-blue-900">${(order.adjustedTotal ?? order.total).toFixed(2)}</p>
            </div>
          </div>
        </button>
      ))}

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Detalles del Pedido</h3>
                <Button variant="ghost" onClick={() => setSelectedOrder(null)} className="p-1">
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">ID del Pedido</p>
                      <p className="font-bold text-gray-900 leading-none">#{selectedOrder.id.toUpperCase()}</p>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2 py-1 rounded font-bold uppercase",
                      selectedOrder.status === 'delivered' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    )}>
                      {selectedOrder.status === 'delivered' ? 'entregado' : 'cancelado'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-50 rounded-lg">
                        {selectedOrder.type === 'delivery' ? <Truck className="w-3.5 h-3.5 text-blue-600" /> : <Package className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Tipo</p>
                        <p className="text-xs font-bold text-gray-700 capitalize">{selectedOrder.type === 'delivery' ? 'A Domicilio' : 'Recoger'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-green-50 rounded-lg">
                        <CreditCard className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Pago</p>
                        <p className="text-xs font-bold text-gray-700 capitalize">{selectedOrder.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'}</p>
                      </div>
                    </div>
                  </div>

                  {selectedOrder.type === 'delivery' && selectedOrder.address && (
                    <div className="flex items-start gap-2 pt-3 border-t border-gray-100">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Dirección</p>
                        <p className="text-xs text-gray-600 line-clamp-2 leading-tight">{selectedOrder.address}</p>
                      </div>
                    </div>
                  )}

                  {selectedOrder.notes && (
                    <div className="flex items-start gap-2 pt-3 border-t border-gray-100">
                      <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">Notas</p>
                        <p className="text-xs text-gray-600 italic">"{selectedOrder.notes}"</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item: any, i: number) => (
                      <div key={`item-${i}`} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 border border-gray-100">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-medium text-gray-900">
                            {item.name}
                            <span className="text-[10px] text-blue-600 font-bold ml-2">
                              ${Number(item.price).toFixed(2)} / {item.unit || 'Paq'}
                            </span>
                            {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight || item.approxWeight) && (
                              <span className="text-[10px] text-gray-400 block -mt-1 italic">
                                Total: {item.loaderWeight || item.preparerWeight || (item.approxWeight ? (item.approxWeight * item.quantity).toFixed(2) : '0')} Kg
                              </span>
                            )}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-gray-900">
                          ${(item.unit === 'Kg' 
                            ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                            : (item.price * item.quantity)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {(selectedOrder.returnedItems || []).map((item: any, i: number) => (
                      <div key={`ret-${i}`} className="flex justify-between items-center p-3 bg-orange-50/50 border border-dashed border-orange-100 rounded-xl">
                        <div className="flex items-center gap-3">
                          <RotateCcw className="w-4 h-4 text-orange-400" />
                          <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-orange-500 border border-orange-100">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-medium text-orange-900 line-through">{item.name} (Devuelto)</span>
                        </div>
                        <span className="text-xs font-bold text-orange-900">-${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span>
                      <span>${((selectedOrder.adjustedTotal ?? selectedOrder.total) - (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                    </div>
                    {selectedOrder.type === 'delivery' && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Envío</span>
                        <span>${(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {selectedOrder.hasReturns && (
                      <div className="flex justify-between text-xs text-orange-600 font-medium">
                        <span>Ajuste por Devolución</span>
                        <span>- ${(selectedOrder.total - selectedOrder.adjustedTotal!).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                      Total
                      {selectedOrder.weightValidated && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded ml-1">VIRTUAL</span>}
                    </span>
                    <span className="text-xl font-black text-blue-900">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</span>
                  </div>
                </div>

                {selectedOrder.status !== 'cancelled' && (
                  <Button 
                    variant="outline" 
                    className="w-full py-3 rounded-2xl flex items-center justify-center gap-2"
                    onClick={() => generateInvoicePDF(selectedOrder)}
                  >
                    <FileText className="w-5 h-5" />
                    Descargar Factura PDF
                  </Button>
                )}

                <div className="text-[10px] text-gray-400 text-center">
                  Fecha: {selectedOrder.createdAt?.seconds ? new Date(selectedOrder.createdAt.seconds * 1000).toLocaleString() : 'Recién'}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProfilePage({ profile, onUpdate, isAdmin, effectiveRole, setCurrentPage, onLogout }: any) {
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [role, setRole] = useState(profile?.role || 'client');
  const [isSaving, setIsSaving] = useState(false);

  if (!profile) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-gray-100">
        <Loader2 className="w-16 h-16 text-blue-900 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Cargando Perfil...</h2>
      </div>
    );
  }

  const isWorker = ['dispatcher', 'preparer', 'driver', 'loader', 'store_sales'].includes(effectiveRole);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = { ...profile, name, phone, role };
      await setDoc(doc(db, 'users', profile.uid), updated);
      onUpdate(updated);
    } catch (error) {
      console.error("Error updating profile:", error);
    }
    setIsSaving(false);
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    client: 'Cliente',
    company: 'Empresa',
    dispatcher: 'Despachador',
    preparer: 'Preparador',
    driver: 'Conductor',
    loader: 'Cargador',
    inventory: 'Inventarios',
    store_sales: 'Ventas Tienda'
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <h2 className="text-xl font-bold text-gray-900">Mi Perfil</h2>
      
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre Completo</label>
          <Input value={name} onChange={(e: any) => setName(e.target.value)} />
        </div>

        {isWorker && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Rol</label>
            <Input value={roleLabels[profile.role] || profile.role} disabled className="bg-gray-50" />
          </div>
        )}

        {(profile.role === 'admin' || profile.role === 'client' || profile.role === 'company') && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">
              {profile.role === 'admin' ? 'Modo de Vista' : 'Tipo de Perfil'}
            </label>
            {profile.role === 'admin' ? (
              <div className="flex flex-wrap gap-2">
                {(['admin', 'client', 'company', 'dispatcher', 'preparer', 'loader', 'store_sales', 'driver'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      const updated = { ...profile, viewAs: v };
                      localStorage.setItem('viewAs', v);
                      onUpdate(updated);
                    }}
                    className={cn(
                      "flex-1 min-w-[80px] py-2 px-3 rounded-lg border text-[10px] font-bold transition-all",
                      (profile.viewAs || 'admin') === v ? "bg-[#0056b3] text-white border-[#0056b3]" : "bg-white text-gray-500 border-gray-200"
                    )}
                  >
                    {roleLabels[v] || v}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <button 
                  onClick={() => setRole('client')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-all",
                    role === 'client' ? "bg-[#0056b3] text-white border-[#0056b3]" : "bg-white text-gray-500 border-gray-200"
                  )}
                >
                  Cliente
                </button>
                <button 
                  onClick={() => setRole('company')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-all",
                    role === 'company' ? "bg-[#0056b3] text-white border-[#0056b3]" : "bg-white text-gray-500 border-gray-200"
                  )}
                >
                  Empresa
                </button>
              </div>
            )}
          </div>
        )}
        
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Número de Celular</label>
          <Input value={phone} onChange={(e: any) => setPhone(e.target.value)} />
        </div>

        {isWorker && (
          <div className="pt-2">
            <Button 
              variant="outline" 
              className="w-full flex items-center justify-center gap-2 border-[#0056b3] text-[#0056b3] hover:bg-blue-50"
              onClick={() => {
                if (effectiveRole === 'dispatcher') setCurrentPage('dispatcher-view');
                else if (effectiveRole === 'preparer') setCurrentPage('preparer-view');
                else if (effectiveRole === 'loader') setCurrentPage('loader-view');
                else if (effectiveRole === 'driver') setCurrentPage('driver-view');
                else if (effectiveRole === 'store_sales') setCurrentPage('store-sales-view');
                else if (effectiveRole === 'admin') setCurrentPage('admin-dashboard');
              }}
            >
              <ChevronRight className="w-5 h-5" />
              Ir a Panel de {roleLabels[effectiveRole] || 'Trabajo'}
            </Button>
          </div>
        )}

        {!isWorker && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Correo Electrónico</label>
            <Input value={profile.email} disabled className="bg-gray-50" />
          </div>
        )}
      </div>

      <div className="pt-4 space-y-3">
        <Button onClick={handleSave} className="w-full h-12" disabled={isSaving}>
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Guardar Cambios'}
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => {
            if (onLogout) onLogout();
            else logout();
          }} 
          className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="w-5 h-5" />
          Cerrar Sesión
        </Button>
      </div>
    </motion.div>
  );
}

function AdminDashboard({ 
  orders, 
  users, 
  currentUserId,
  selectedDate,
  onDateChange,
  onStatClick, 
  onUsersClick,
  onInventoryTrackingClick,
  onReturnsClick,
  onDriverRouteClick,
  onSettingsClick,
  onProductsClick,
  onCategoriesClick,
  onRefresh,
  onSeedData
}: { 
  orders: Order[], 
  users: UserProfile[], 
  currentUserId: string,
  selectedDate: string,
  onDateChange: (date: string) => void,
  onStatClick: (status: Order['status'] | 'all') => void,
  onUsersClick: () => void,
  onInventoryTrackingClick: (p: 'day' | 'week' | 'month' | 'year') => void,
  onReturnsClick: () => void,
  onDriverRouteClick: () => void,
  onSettingsClick: () => void,
  onProductsClick: () => void,
  onCategoriesClick: () => void,
  onRefresh?: () => void,
  onSeedData?: () => void
}) {
  const [showStatuses, setShowStatuses] = useState(false);
  const [showSalesInfo, setShowSalesInfo] = useState(false);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');

  const { startOfPeriod, endOfPeriod } = useMemo(() => {
    const anchorDate = new Date(selectedDate + 'T00:00:00');
    const start = new Date(anchorDate);
    const end = new Date(anchorDate);

    if (period === 'week') {
      start.setDate(anchorDate.getDate() - anchorDate.getDay());
      start.setHours(0,0,0,0);
      end.setDate(start.getDate() + 6);
      end.setHours(23,59,59,999);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0,0,0,0);
      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23,59,59,999);
    } else if (period === 'year') {
      start.setMonth(0, 1);
      start.setHours(0,0,0,0);
      end.setFullYear(start.getFullYear(), 11, 31);
      end.setHours(23,59,59,999);
    }
    return { startOfPeriod: start, endOfPeriod: end };
  }, [selectedDate, period]);

  const stats = useMemo(() => {
    const s = {
      pending: 0,
      processing: 0,
      ready: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      totalRevenue: 0
    };

    const filteredOrders = orders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = new Date(o.createdAt.seconds * 1000);
      
      if (period === 'day') {
        return orderDate.toISOString().split('T')[0] === selectedDate;
      } else {
        return orderDate >= startOfPeriod && orderDate <= endOfPeriod;
      }
    });

    filteredOrders.forEach(o => {
      if (o.status === 'pending') s.pending++;
      else if (o.status === 'processing') s.processing++;
      else if (o.status === 'ready') s.ready++;
      else if (o.status === 'shipped') s.shipped++;
      else if (o.status === 'delivered') {
        s.delivered++;
        s.totalRevenue += (o.adjustedTotal ?? o.total);
      }
      else if (o.status === 'cancelled') s.cancelled++;
    });
    return s;
  }, [orders, selectedDate, period]);

  const assignedOrdersCount = useMemo(() => {
    return orders.filter(o => o.driverId === currentUserId && o.status === 'shipped').length;
  }, [orders, currentUserId]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-gray-900">Panel de Administración</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh} className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onSeedData} className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Sembrar Datos</span>
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Toggle Button for Sensitive Info */}
        <Button 
          variant="outline"
          onClick={() => setShowSalesInfo(!showSalesInfo)}
          className={cn(
            "w-full py-6 rounded-3xl border-dashed flex justify-between items-center px-6",
            showSalesInfo ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-500"
          )}
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className={cn("w-5 h-5", showSalesInfo ? "text-blue-600" : "text-gray-400")} />
            <div className="text-left">
              <p className="text-sm font-bold">Información de Ventas</p>
              <p className="text-[10px] opacity-70">Haz clic para {showSalesInfo ? 'ocultar' : 'ver'} ingresos y filtros</p>
            </div>
          </div>
          <ChevronRight className={cn("w-5 h-5 transition-transform", showSalesInfo ? "rotate-90" : "")} />
        </Button>

        <AnimatePresence>
          {showSalesInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-4"
            >
              <div className="p-4 bg-gray-50 rounded-3xl border border-gray-100 space-y-4">
                {/* Period Selector */}
                <div className="bg-gray-200/50 p-1 rounded-2xl flex">
                  {[
                    { id: 'day', label: 'Día' },
                    { id: 'week', label: 'Semana' },
                    { id: 'month', label: 'Mes' },
                    { id: 'year', label: 'Año' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPeriod(p.id as any)}
                      className={cn(
                        "flex-1 py-1.5 text-[9px] font-bold rounded-xl transition-all",
                        period === p.id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">
                      {period === 'day' ? 'Fecha Seleccionada' : 'Seleccionar Referencia'}
                    </p>
                    <Calendar className="w-3 h-3 text-gray-400" />
                  </div>
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => onDateChange && (onDateChange as any)(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] text-xs font-medium text-gray-900"
                  />
                  {period !== 'day' && (
                    <div className="pt-2 border-t border-gray-50 text-center">
                      <p className="text-[10px] font-bold text-blue-600 uppercase">
                        {period === 'week' ? 'Semana selecionada' : period === 'month' ? 'Mes selecionado' : 'Año selecionado'}
                      </p>
                      <p className="text-[9px] text-blue-400 italic">
                        {startOfPeriod.toLocaleDateString()} - {endOfPeriod.toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Ingresos</p>
                    <p className="text-xl font-black text-green-600">${stats.totalRevenue.toFixed(2)}</p>
                  </div>
                  <button 
                    onClick={onUsersClick}
                    className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-left"
                  >
                    <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Usuarios</p>
                    <p className="text-xl font-black text-blue-600">{users.length}</p>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={() => onInventoryTrackingClick(period)}
          className="col-span-2 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-blue-200 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <Package className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">Gestión e Inventario</p>
              <p className="text-[10px] text-gray-400">Ver catálogo, editar stock y añadir nuevos productos</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>

        <button 
          onClick={onReturnsClick}
          className="col-span-2 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-red-200 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">Gestión de Devoluciones</p>
              <p className="text-[10px] text-gray-400">Revisa y procesa las devoluciones de clientes</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>

        <button 
          onClick={onCategoriesClick}
          className="col-span-2 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-blue-200 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
              <Tags className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">Gestión de Categorías</p>
              <p className="text-[10px] text-gray-400">Agrega, edita y elimina categorías y subcategorías</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>

        <button 
          onClick={onSettingsClick}
          className="col-span-2 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-red-200 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
              <Settings className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">Configuración de la App</p>
              <p className="text-[10px] text-gray-400">Cambia el logo y nombre de la app</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>

        <button 
          onClick={() => setShowStatuses(!showStatuses)}
          className="col-span-2 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-indigo-200 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">Estados de Pedidos</p>
              <p className="text-[10px] text-gray-400">Ver pendientes, listos, en ruta...</p>
            </div>
          </div>
          <motion.div animate={{ rotate: showStatuses ? 90 : 0 }}>
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </motion.div>
        </button>

        <AnimatePresence>
          {showStatuses && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="col-span-2 grid grid-cols-2 gap-3 overflow-hidden"
            >
              {[
                { label: 'Pendientes', value: stats.pending, color: 'bg-orange-100 text-orange-600', status: 'pending' },
                { label: 'Preparación', value: stats.processing, color: 'bg-blue-100 text-blue-600', status: 'processing' },
                { label: 'Listos', value: stats.ready, color: 'bg-purple-100 text-purple-600', status: 'ready' },
                { label: 'En Ruta', value: stats.shipped, color: 'bg-indigo-100 text-indigo-600', status: 'shipped' },
                { label: 'Entregados', value: stats.delivered, color: 'bg-green-100 text-green-600', status: 'delivered' },
                { label: 'Cancelados', value: stats.cancelled, color: 'bg-red-100 text-red-600', status: 'cancelled' },
              ].map((stat, i) => (
                <button 
                  key={i} 
                  onClick={() => onStatClick(stat.status as Order['status'])}
                  className="bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex justify-between items-center hover:border-gray-200 transition-colors"
                >
                  <span className="text-xs font-bold text-gray-500">{stat.label}</span>
                  <span className={cn("text-sm font-black px-2 py-0.5 rounded-lg", stat.color)}>{stat.value}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {assignedOrdersCount > 0 && (
          <button 
            onClick={onDriverRouteClick}
            className="col-span-2 bg-blue-600 p-5 rounded-3xl shadow-lg shadow-blue-200 flex items-center justify-between hover:bg-blue-700 transition-colors text-white"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                <Truck className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold">Mi Ruta de Entrega</p>
                <p className="text-[10px] opacity-80">{assignedOrdersCount} pedidos asignados</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 opacity-50" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function AdminUsersView({ users, onBack, onRefresh }: { users: UserProfile[], onBack: () => void, onRefresh?: () => void }) {
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  const updateUserRole = async (uid: string, role: UserProfile['role']) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role });
      setSelectedUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">Gestión de Roles</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} className="p-2 h-10 w-10 flex items-center justify-center">
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-4">
        {users.map(u => (
          <div key={u.uid} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-[#0056b3] font-bold">
                {(u.name || 'U').charAt(0)}
              </div>
              <div>
                <h4 className="font-bold text-gray-900 leading-tight">{u.name || 'Usuario'}</h4>
                <p className="text-[10px] text-gray-500">{u.email}</p>
                <div className="flex gap-1 mt-1">
                  <span className={cn(
                    "text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                    u.role === 'admin' ? "bg-purple-100 text-purple-700" :
                    u.role === 'dispatcher' ? "bg-orange-100 text-orange-700" :
                    u.role === 'preparer' ? "bg-blue-100 text-blue-700" :
                    u.role === 'driver' ? "bg-green-100 text-green-700" :
                    u.role === 'company' ? "bg-blue-50 text-blue-600" :
                    "bg-gray-100 text-gray-600"
                  )}>
                    {u.role}
                  </span>
                </div>
              </div>
            </div>
            
            <Button 
              variant="ghost" 
              onClick={() => setSelectedUser(u)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Settings className="w-4 h-4 text-gray-400" />
            </Button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Gestionar Usuario</h3>
                <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <p className="text-xs text-gray-400 font-bold uppercase mb-1">Información</p>
                  <p className="font-bold text-gray-900">{selectedUser.name || 'Sin nombre'}</p>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase ml-1">Asignar Rol</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['client', 'company', 'dispatcher', 'preparer', 'driver', 'loader', 'admin', 'store_sales'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => updateUserRole(selectedUser.uid, r)}
                        className={cn(
                          "py-3 px-4 rounded-xl border-2 text-xs font-bold transition-all",
                          selectedUser.role === r ? "border-[#0056b3] bg-blue-50 text-[#0056b3]" : "border-gray-100 text-gray-500 hover:border-gray-200"
                        )}
                      >
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AdminSettingsView({ settings, onBack, canEditLocation, showToast }: { settings: AppSettings | null, onBack: () => void, canEditLocation: boolean, showToast: (msg: string, type: any) => void }) {
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl || '');
  const [appName, setAppName] = useState(settings?.appName || 'Dibapasa');
  const [shopAddress, setShopAddress] = useState(settings?.shopAddress || SHOP_LOCATION.address);
  const [shopLat, setShopLat] = useState(settings?.shopLat || SHOP_LOCATION.lat);
  const [shopLng, setShopLng] = useState(settings?.shopLng || SHOP_LOCATION.lng);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);

  const detectShopLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setShopLat(lat);
        setShopLng(lng);
        const addr = await reverseOSMGeocode(lat, lng);
        setShopAddress(addr);
      },
      () => {}
    );
  };

  const handleManualMapClick = async (pos: { lat: number, lng: number }) => {
    if (!isEditingLocation) return;
    setShopLat(pos.lat);
    setShopLng(pos.lng);
    const addr = await reverseOSMGeocode(pos.lat, pos.lng);
    setShopAddress(addr);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const blob = await compressImageToBlob(file, 400, 400, 0.8);
      const filename = `app/logo_${Date.now()}.jpg`;
      
      // Optional: Delete old logo if it was a storage URL
      if (logoUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const oldRef = sRef(storage, logoUrl);
          await deleteObject(oldRef);
        } catch (e) {
          console.warn('Could not delete old logo:', e);
        }
      }

      const url = await uploadImage(blob, filename);
      setLogoUrl(url);
    } catch (error) {
      console.error('Error uploading logo:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'app'), {
        logoUrl,
        appName,
        shopAddress,
        shopLat: Number(shopLat),
        shopLng: Number(shopLng)
      });
      showToast('Configuración guardada correctamente', 'success');
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/app');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Configuración de la App</h2>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="space-y-4">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Logo de la App</label>
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-[10px] font-bold text-gray-400">SUBIENDO...</span>
                </div>
              ) : logoUrl.trim() ? (
                <img src={logoUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Image className="w-10 h-10 text-gray-300" />
              )}
              {!isUploading && (
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Plus className="w-8 h-8 text-white" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              )}
            </div>
            <p className="text-[10px] text-gray-400 text-center">Haz clic para subir un nuevo logo (PNG, JPG)</p>
          </div>

          <div className="space-y-2 mt-4">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1 block">URL Directa del Logo</label>
            <div className="relative">
              <input 
                type="text" 
                value={logoUrl} 
                onChange={(e) => setLogoUrl(transformImageUrl(e.target.value))}
                placeholder="https://ejemplo.com/logo.png"
                className={`w-full bg-gray-50 border ${logoUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(logoUrl) || logoUrl.includes('drive.google.com')) ? 'border-amber-500' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-10`}
              />
              <Image className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
            </div>
            {logoUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(logoUrl) || logoUrl.includes('drive.google.com')) && (
              <p className="text-[10px] text-amber-600 font-medium px-1">
                ⚠️ Este link no parece ser una imagen directa. Asegúrate de que sea un link directo.
              </p>
            )}
            <p className="text-[10px] text-gray-400">Puedes pegar links de Google Drive (compartidos), Dropbox o links directos (.jpg, .png).</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre de la App</label>
          <Input 
            value={appName} 
            onChange={(e: any) => setAppName(e.target.value)} 
            placeholder="Ej: Dibapasa"
          />
        </div>

        <div className="pt-4 border-t border-gray-50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" />
              Ubicación del Establecimiento
            </h3>
            {canEditLocation && (
              <Button 
                variant="outline" 
                className={cn("text-xs h-8 px-3 py-0 flex items-center justify-center", isEditingLocation && "bg-blue-50 border-blue-200 text-blue-600")}
                onClick={() => setIsEditingLocation(!isEditingLocation)}
              >
                <Edit className="w-3 h-3 mr-1.5" />
                {isEditingLocation ? 'Fijar Ubicación' : 'Editar Ubicación'}
              </Button>
            )}
          </div>
          
          {isEditingLocation && (
            <div className="space-y-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
              <p className="text-[10px] text-blue-600 font-bold uppercase">Modo Edición Activado</p>
              <p className="text-xs text-gray-600">Haz clic en el mapa para ubicar tu establecimiento o usa el botón de detección automática.</p>
              
              <Button 
                variant="outline" 
                className="w-full bg-white border-blue-100 text-blue-600 text-xs py-2"
                onClick={detectShopLocation}
              >
                <Locate className="w-3 h-3 mr-2" />
                Detectar mi ubicación actual
              </Button>

              <div className="h-48 w-full rounded-xl overflow-hidden border border-blue-200 shadow-inner relative bg-gray-100">
                <OSMMap
                  center={{ lat: Number(shopLat), lng: Number(shopLng) }}
                  zoom={15}
                  shopLocation={{ lat: Number(shopLat), lng: Number(shopLng), address: shopAddress }}
                  customerLocation={{ lat: Number(shopLat), lng: Number(shopLng) }}
                  onMapClick={handleManualMapClick}
                  onMarkerDragEnd={handleManualMapClick}
                  className="w-full h-full"
                />
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Dirección Completa</label>
            <Input 
              value={shopAddress} 
              onChange={(e: any) => isEditingLocation && setShopAddress(e.target.value)}
              readOnly={!isEditingLocation}
              className={cn(
                "font-medium text-xs h-10",
                !isEditingLocation ? "bg-gray-50/50 border-gray-100 cursor-not-allowed" : "bg-white border-blue-200 ring-2 ring-blue-50"
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Latitud</label>
              <Input 
                value={shopLat} 
                onChange={(e: any) => isEditingLocation && setShopLat(Number(e.target.value))}
                readOnly={!isEditingLocation}
                className={cn(
                  "font-mono text-xs h-10",
                  !isEditingLocation ? "bg-gray-50/50 border-gray-100 cursor-not-allowed" : "bg-white border-blue-200 ring-2 ring-blue-50"
                )}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Longitud</label>
              <Input 
                value={shopLng} 
                onChange={(e: any) => isEditingLocation && setShopLng(Number(e.target.value))}
                readOnly={!isEditingLocation}
                className={cn(
                  "font-mono text-xs h-10",
                  !isEditingLocation ? "bg-gray-50/50 border-gray-100 cursor-not-allowed" : "bg-white border-blue-200 ring-2 ring-blue-50"
                )}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 italic">
            * Estos datos se usan para calcular las distancias de envío y el punto de partida en el mapa.
          </p>
        </div>

        <Button onClick={handleSave} className="w-full py-4" disabled={isSaving || isUploading}>
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Guardar Configuración'}
        </Button>
      </div>
    </motion.div>
  );
}

function AdminProductFormView({ product, categories, onBack, effectiveRole, showToast, onProductSaved, onProductDeleted }: { product: Product | null, categories: Category[], onBack: () => void, effectiveRole: string, showToast: (msg: string, type: any) => void, onProductSaved?: (prod: Product) => void, onProductDeleted?: (id: string) => void }) {
  const isAdmin = effectiveRole === 'admin';
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || categories[0]?.name || '');
  const [subcategory, setSubcategory] = useState(product?.subcategory || '');
  const [unit, setUnit] = useState<'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja'>(product?.unit || 'Paq');
  const [price, setPrice] = useState(product?.price.toString() || '0');
  const [description, setDescription] = useState(product?.description || '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || '');
  const [approxWeight, setApproxWeight] = useState(product?.approxWeight?.toString() || '');
  const [piecesPerJaba, setPiecesPerJaba] = useState(product?.piecesPerJaba?.toString() || '');
  const [isHidden, setIsHidden] = useState(product?.isHidden || false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const selectedCategoryData = categories.find(c => c.name === category);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const blob = await compressImageToBlob(file);
      const filename = `products/${name.replace(/\s+/g, '_').toLowerCase() || 'product'}_${Date.now()}.jpg`;

      // Optional: Delete old image if it was a storage URL
      if (imageUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const oldRef = sRef(storage, imageUrl);
          await deleteObject(oldRef);
        } catch (e) {
          console.warn('Could not delete old product image:', e);
        }
      }

      const url = await uploadImage(blob, filename);
      setImageUrl(url);
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name || !price) return;
    setIsSaving(true);
    try {
      const productData: any = {
        name: name || 'S/N',
        category: category || 'Sin Categoría',
        subcategory: subcategory || '',
        unit: unit || 'Paq',
        price: Number(price) || 0,
        description: description || '',
        imageUrl: imageUrl || '',
        stock: product?.stock || 0,
        reserved: product?.reserved || 0,
        piecesPerJaba: Number(piecesPerJaba) || 0,
        isHidden: !!isHidden
      };

      if (unit === 'Kg') {
        productData.approxWeight = parseFloat(approxWeight) || 0;
      }

      if (product) {
        await updateDoc(doc(db, 'products', product.id), productData);
        if (onProductSaved) {
          onProductSaved({ id: product.id, ...productData } as Product);
        }
        showToast('Producto actualizado correctamente', 'success');
      } else {
        const newDoc = await addDoc(collection(db, 'products'), productData);
        if (onProductSaved) {
          onProductSaved({ id: newDoc.id, ...productData } as Product);
        }
        showToast('Producto creado correctamente', 'success');
      }
      onBack();
    } catch (error) {
      const op = product ? OperationType.UPDATE : OperationType.CREATE;
      const path = product ? `products/${product.id}` : 'products';
      handleFirestoreError(error, op, path);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    setIsDeleting(true);
    try {
      await updateDoc(doc(db, 'products', product.id), { isDeleted: true });
      if (onProductDeleted) {
        onProductDeleted(product.id);
      }
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${product.id}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">{product ? 'Editar Producto' : 'Nuevo Producto'}</h2>
        </div>
        {product && isAdmin && (
          <Button 
            variant="ghost" 
            onClick={() => setShowDeleteConfirm(true)} 
            className="text-red-600 hover:bg-red-50 p-2 rounded-xl"
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          </Button>
        )}
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="space-y-4">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Imagen del Producto</label>
          <div className="flex flex-col items-center gap-4">
            <div className="w-48 h-48 rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-10 h-10 animate-spin text-red-500" />
                  <span className="text-[10px] font-bold text-gray-400">SUBIENDO...</span>
                </div>
              ) : (imageUrl && imageUrl.trim()) ? (
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Image className="w-12 h-12 text-gray-300" />
              )}
              {isAdmin && !isUploading && (
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Plus className="w-10 h-10 text-white" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-2 mt-4">
              <label className="text-xs font-bold text-gray-400 uppercase ml-1 block">URL Directa de la Imagen</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={imageUrl} 
                  onChange={(e) => setImageUrl(transformImageUrl(e.target.value))}
                  placeholder="https://ejemplo.com/producto.jpg"
                  className={`w-full bg-gray-50 border ${imageUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(imageUrl) || imageUrl.includes('drive.google.com')) ? 'border-amber-500' : 'border-gray-200'} rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 pr-10`}
                />
                <Image className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
              </div>
              {imageUrl && !(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(imageUrl) || imageUrl.includes('drive.google.com')) && (
                <p className="text-[10px] text-amber-600 font-medium px-1">
                  ⚠️ El link debe ser directo (ej: termina en .jpg o es de Google Drive).
                </p>
              )}
              <p className="text-[10px] text-gray-400">Puedes usar una URL de internet o un link compartido de Google Drive.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Nombre</label>
          <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Nombre del producto" disabled={!isAdmin} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Categoría</label>
            <select 
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all disabled:bg-gray-50"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSubcategory('');
              }}
              disabled={!isAdmin}
            >
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Subcategoría</label>
            <select 
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all disabled:bg-gray-50"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={!isAdmin || !selectedCategoryData || selectedCategoryData.subcategories.length === 0}
            >
              <option value="">Ninguna</option>
              {selectedCategoryData?.subcategories.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Precio</label>
            <Input type="number" value={price} onChange={(e: any) => setPrice(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Unidad de Venta</label>
            <select 
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all disabled:bg-gray-50"
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'Kg' | 'Paq' | 'Pza' | 'Fco' | 'Bolsa' | 'Caja')}
              disabled={!isAdmin}
            >
              <option value="Paq">Paquete (Paq)</option>
              <option value="Kg">Kilogramo (Kg)</option>
              <option value="Pza">Pieza (Pza)</option>
              <option value="Fco">Frasco (Fco)</option>
              <option value="Bolsa">Bolsa</option>
              <option value="Caja">Caja</option>
            </select>
          </div>
        </div>

        {unit === 'Kg' && (
          <div className="space-y-2 bg-orange-50/50 p-4 rounded-2xl border border-orange-100/50">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Peso en Kg aproximado</label>
            <Input 
              type="number" 
              step="0.01" 
              value={approxWeight} 
              onChange={(e: any) => setApproxWeight(e.target.value)} 
              placeholder="Ej: 1.5"
              className="bg-white"
              disabled={!isAdmin} 
            />
            <p className="text-[10px] text-gray-500 italic ml-1">
              Este valor se multiplicará por el precio/Kg para dar un total de referencia al cliente.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="space-y-2 bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Piezas por Jaba (Inventario)</label>
            <Input 
              type="number" 
              value={piecesPerJaba} 
              onChange={(e: any) => setPiecesPerJaba(e.target.value)} 
              placeholder="Ej: 20"
              className="bg-white"
              disabled={!isAdmin} 
            />
            <p className="text-[10px] text-gray-500 italic ml-1">
              Configura cuántas piezas o kilos contiene una jaba para este producto.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                {isHidden ? <EyeOff className="w-4 h-4 text-amber-600" /> : <Eye className="w-4 h-4 text-gray-500" />}
                <label className="text-sm font-bold text-gray-900">Ocultar producto a clientes y staff</label>
              </div>
              <p className="text-xs text-gray-500">
                Al activar esto, el producto no aparecerá en el catálogo de los clientes ni en la lista de los trabajadores.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsHidden(!isHidden)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                isHidden ? "bg-amber-500" : "bg-gray-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
                  isHidden ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase ml-1">Descripción</label>
          <textarea 
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all resize-none h-32 disabled:bg-gray-50"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción del producto..."
            disabled={!isAdmin}
          />
        </div>

        {isAdmin && (
          <Button onClick={handleSave} className="w-full py-4" disabled={isSaving || isUploading}>
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (product ? 'Guardar Cambios' : 'Crear Producto')}
          </Button>
        )}
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[110]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">¿Eliminar producto?</h3>
                <p className="text-gray-500 text-sm">
                  Esta acción eliminará el producto <strong>{product?.name}</strong> y no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>
                  Cancelar
                </Button>
                <Button variant="destructive" className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Eliminar'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProductDetailPage({ 
  product, 
  onBack, 
  cartQuantity, 
  onUpdateCart, 
  onSetCartQuantity,
  effectiveRole
}: { 
  product: Product, 
  onBack: () => void,
  cartQuantity: number,
  onUpdateCart: (id: string, delta: number) => void,
  onSetCartQuantity: (id: string, qty: number) => void,
  effectiveRole: string
}) {
  const isSoldOut = (product.stock || 0) <= (product.reserved || 0);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Detalle del Producto</h2>
      </div>

      <div className={cn(
        "bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm relative",
        isSoldOut && "opacity-75"
      )}>
        {isSoldOut && (
          <div className="absolute top-4 right-4 z-10">
            <span className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Agotado
            </span>
          </div>
        )}
        {product.imageUrl ? (
          <img src={product.imageUrl} className="w-full aspect-square object-cover" alt={product.name} referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
            <Package className="w-20 h-20 text-gray-200" />
          </div>
        )}
        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm font-bold text-red-600 uppercase tracking-wider mb-1">
              {product.category}
              {product.subcategory && ` • ${product.subcategory}`}
            </p>
            <h1 className="text-2xl font-bold text-gray-900">
              {product.name}
              {product.unit === 'Kg' && product.approxWeight && (
                <span className="text-gray-400 font-normal block text-lg mt-1">({product.approxWeight} Kg aprox.)</span>
              )}
            </h1>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-3xl font-black text-gray-900">
                ${(product.unit === 'Kg' ? product.price * (product.approxWeight || 1) : product.price).toFixed(2)}
              </span>
              <p className="text-[10px] text-gray-400">
                Precio ref. para {product.unit === 'Kg' ? `${product.approxWeight || 1} Kg` : '1 Paq'} (${product.price.toFixed(2)}/{product.unit || 'Paq'})
              </p>
              {product.unit === 'Kg' && (
                <p className="text-[11px] font-bold text-orange-600 bg-orange-50 p-2 rounded-xl border border-orange-100 mt-2">
                  Nota: El total final se calculará cuando el preparador y el cargador confirmen el peso real del producto durante el despacho.
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={cn(
                "flex items-center gap-4 rounded-2xl p-2 border border-gray-100",
                isSoldOut ? "bg-gray-100 opacity-50" : "bg-gray-50"
              )}>
                <button 
                  onClick={() => !isSoldOut && onUpdateCart(product.id, -1)}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-xl shadow-sm transition-colors",
                    isSoldOut ? "bg-gray-200" : "bg-white hover:bg-gray-50"
                  )}
                  disabled={isSoldOut}
                >
                  <Minus className="w-5 h-5 text-gray-600" />
                </button>
                <input 
                  type="number"
                  value={cartQuantity}
                  onChange={(e) => !isSoldOut && onSetCartQuantity(product.id, parseInt(e.target.value) || 0)}
                  className="text-lg font-bold w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                  min="0"
                  disabled={isSoldOut}
                />
                <button 
                  onClick={() => !isSoldOut && onUpdateCart(product.id, 1)}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-xl shadow-md transition-colors",
                    isSoldOut || cartQuantity >= (product.stock || 0) - (product.reserved || 0) 
                      ? "bg-gray-300 text-gray-500 shadow-none cursor-not-allowed" 
                      : "bg-red-600 shadow-red-200 hover:bg-red-700 text-white"
                  )}
                  disabled={isSoldOut || cartQuantity >= (product.stock || 0) - (product.reserved || 0)}
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {effectiveRole === 'company' && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => !isSoldOut && onUpdateCart(product.id, 10)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 rounded-lg transition-colors",
                      isSoldOut ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200"
                    )}
                    disabled={isSoldOut}
                  >
                    +10
                  </button>
                  <button 
                    onClick={() => !isSoldOut && onUpdateCart(product.id, 100)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 rounded-lg transition-colors",
                      isSoldOut ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200"
                    )}
                    disabled={isSoldOut}
                  >
                    +100
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 pt-4 border-t border-gray-50 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Descripción</h3>
            <p className="text-gray-600 leading-relaxed italic">
              {product.description || 'No hay descripción disponible para este producto.'}
            </p>
          </div>

          <div className="pt-2 flex items-center gap-2 text-sm text-gray-400">
            <Package className="w-4 h-4" />
            <span>Stock disponible: {product.stock} piezas</span>
          </div>
        </div>
      </div>

      <Button 
        onClick={onBack}
        className="w-full py-4 rounded-2xl shadow-lg shadow-red-200"
      >
        Continuar Comprando
      </Button>
    </motion.div>
  );
}

function AdminCategoriesView({ categories, onBack, showToast, onCategorySaved, onCategoryDeleted }: { categories: Category[], onBack: () => void, showToast: (msg: string, type?: 'success' | 'error' | 'info') => void, onCategorySaved?: (cat: Category) => void, onCategoryDeleted?: (id: string) => void }) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setIsSaving(true);
    try {
      const newCatData = {
        name: newCategoryName.trim(),
        subcategories: [],
        isHidden: false
      };
      const docRef = await addDoc(collection(db, 'categories'), newCatData);
      if (onCategorySaved) {
        onCategorySaved({ id: docRef.id, ...newCatData } as Category);
      }
      setNewCategoryName('');
      showToast('Categoría creada con éxito', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCategory = async (id: string, name: string) => {
    try {
      await updateDoc(doc(db, 'categories', id), { name });
      const current = categories.find(c => c.id === id);
      if (current && onCategorySaved) {
        onCategorySaved({ ...current, name });
      }
      setEditingCategory(null);
      showToast('Categoría actualizada', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
    }
  };

  const handleToggleHideCategory = async (cat: Category) => {
    const isHidden = !cat.isHidden;
    try {
      await updateDoc(doc(db, 'categories', cat.id), { isHidden });
      if (onCategorySaved) {
        onCategorySaved({ ...cat, isHidden });
      }
      showToast(isHidden ? `Categoría "${cat.name}" ocultada` : `Categoría "${cat.name}" visible`, 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${cat.id}`);
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteDoc(doc(db, 'categories', categoryToDelete.id));
      if (onCategoryDeleted) {
        onCategoryDeleted(categoryToDelete.id);
      }
      setCategoryToDelete(null);
      showToast('Categoría eliminada', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${categoryToDelete.id}`);
    }
  };

  const handleAddSubcategory = async (category: Category) => {
    if (!newSubcategoryName.trim()) return;
    try {
      const updatedSubcategories = [...category.subcategories, newSubcategoryName.trim()];
      await updateDoc(doc(db, 'categories', category.id), {
        subcategories: updatedSubcategories
      });
      if (onCategorySaved) {
        onCategorySaved({ ...category, subcategories: updatedSubcategories });
      }
      setNewSubcategoryName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${category.id}`);
    }
  };

  const handleDeleteSubcategory = async (category: Category, subName: string) => {
    try {
      const updatedSubcategories = category.subcategories.filter(s => s !== subName);
      await updateDoc(doc(db, 'categories', category.id), {
        subcategories: updatedSubcategories
      });
      if (onCategorySaved) {
        onCategorySaved({ ...category, subcategories: updatedSubcategories });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${category.id}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">Gestión de Categorías</h2>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Nueva categoría..." 
            value={newCategoryName}
            onChange={(e: any) => setNewCategoryName(e.target.value)}
          />
          <Button onClick={handleAddCategory} disabled={isSaving || !newCategoryName.trim()}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        <div className="space-y-4">
          {categories.map(cat => (
            <div key={cat.id} className="border border-gray-100 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                {editingCategory?.id === cat.id ? (
                  <div className="flex gap-2 flex-1">
                    <Input 
                      value={editingCategory.name}
                      onChange={(e: any) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleUpdateCategory(cat.id, editingCategory.name)}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <h3 className={cn("font-bold truncate", cat.isHidden ? "text-gray-400 line-through" : "text-gray-900")}>
                        {cat.name}
                      </h3>
                      {cat.isHidden && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200">
                          Oculta
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        title={cat.isHidden ? "Mostrar categoría a los clientes" : "Ocultar categoría a los clientes"}
                        className={cat.isHidden ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-gray-400 hover:text-gray-600"}
                        onClick={() => handleToggleHideCategory(cat)}
                      >
                        {cat.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingCategory({ ...cat })}>
                        <Settings className="w-4 h-4 text-gray-400" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCategoryToDelete(cat)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="pl-4 border-l-2 border-gray-50 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {cat.subcategories.map(sub => (
                    <div key={sub} className="bg-gray-50 px-3 py-1 rounded-full flex items-center gap-2">
                      <span className="text-xs text-gray-600">{sub}</span>
                      <button onClick={() => handleDeleteSubcategory(cat, sub)}>
                        <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Añadir subcategoría..." 
                    className="h-8 text-xs"
                    value={editingCategory?.id === cat.id ? newSubcategoryName : ''}
                    onChange={(e: any) => {
                      setEditingCategory(cat);
                      setNewSubcategoryName(e.target.value);
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSubcategory(cat)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => handleAddSubcategory(cat)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {categoryToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[110]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">¿Eliminar categoría?</h3>
                <p className="text-gray-500 text-sm">
                  Esta acción eliminará la categoría <strong>{categoryToDelete.name}</strong> y no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setCategoryToDelete(null)}>
                  Cancelar
                </Button>
                <Button variant="destructive" className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleDeleteCategory}>
                  Eliminar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function InventoryView({ 
  products, 
  profile, 
  onBack,
  onEditProduct,
  onAddProduct,
  onHistoryClick,
  hideHeader = false,
  searchQuery: externalSearchQuery,
  setSearchQuery: setExternalSearchQuery,
  selectedCategory: externalSelectedCategory,
  setSelectedCategory: setExternalSelectedCategory,
  selectedSubcategory: externalSelectedSubcategory,
  setSelectedSubcategory: setExternalSelectedSubcategory,
  stockFilter: externalStockFilter,
  setStockFilter: setExternalStockFilter,
  showToast
}: { 
  products: Product[], 
  profile: UserProfile | null, 
  onBack: () => void,
  onEditProduct?: (product: Product) => void,
  onAddProduct?: () => void,
  onHistoryClick?: () => void,
  hideHeader?: boolean,
  searchQuery?: string,
  setSearchQuery?: (q: string) => void,
  selectedCategory?: string,
  setSelectedCategory?: (c: string) => void,
  selectedSubcategory?: string,
  setSelectedSubcategory?: (s: string) => void,
  stockFilter?: string,
  setStockFilter?: (f: string) => void,
  showToast?: (msg: string, type: any) => void
}) {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState<number>(0);
  const [jabas, setJabas] = useState<number>(0);
  const [piezasAdicionales, setPiezasAdicionales] = useState<number>(0);
  const [weightKgs, setWeightKgs] = useState<number>(0);
  const [manualBaseStock, setManualBaseStock] = useState<number>(0);
  const [jabaType, setJabaType] = useState<string>('Verde');
  const [entryMode, setEntryMode] = useState<'normal' | 'jaba' | 'weight-to-pieces'>('normal');
  const [reason, setReason] = useState('');
  const [requestType, setRequestType] = useState<'update' | 'waste'>('update');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  // Search and Filter State (Local fallback)
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = setExternalSearchQuery || setInternalSearchQuery;

  const [internalSelectedCategory, setInternalSelectedCategory] = useState('Todos');
  const selectedCategory = externalSelectedCategory !== undefined ? externalSelectedCategory : internalSelectedCategory;
  const setSelectedCategory = setExternalSelectedCategory || setInternalSelectedCategory;

  const [internalSelectedSubcategory, setInternalSelectedSubcategory] = useState('Todas');
  const selectedSubcategory = externalSelectedSubcategory !== undefined ? externalSelectedSubcategory : internalSelectedSubcategory;
  const setSelectedSubcategory = setExternalSelectedSubcategory || setInternalSelectedSubcategory;

  const [internalStockFilter, setInternalStockFilter] = useState('all');
  const stockFilter = externalStockFilter !== undefined ? externalStockFilter : internalStockFilter;
  const setStockFilter = setExternalStockFilter || setInternalStockFilter;

  if (!profile) return null;

  const effectiveRole = profile.role === 'admin' ? (profile.viewAs || 'admin') : profile.role;

  const isWorker = effectiveRole !== 'client' && effectiveRole !== 'company' && effectiveRole !== 'store_sales';

  // Get unique subcategories
  const subcategories = Array.from(new Set(products
    .filter(p => p.subcategory && !p.isDeleted && (!p.isHidden || effectiveRole === 'admin'))
    .map(p => p.subcategory)))
    .sort();

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (product.subcategory || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || product.category === selectedCategory;
    const matchesSubcategory = selectedSubcategory === 'Todas' || product.subcategory === selectedSubcategory;
    
    let matchesStock = true;
    if (stockFilter === 'out') matchesStock = product.stock <= 0;
    else if (stockFilter === 'low') matchesStock = product.stock > 0 && product.stock < 10;
    else if (stockFilter === 'in') matchesStock = product.stock >= 10;
    const isDeleted = (product as any).isDeleted;

    let matchesVisibility = true;
    if (effectiveRole !== 'admin') {
      matchesVisibility = !product.isHidden;
    } else {
      if (visibilityFilter === 'visible') matchesVisibility = !product.isHidden;
      else if (visibilityFilter === 'hidden') matchesVisibility = !!product.isHidden;
    }

    return matchesSearch && matchesCategory && matchesSubcategory && matchesStock && !isDeleted && matchesVisibility;
  }).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  useEffect(() => {
    if (selectedProduct && newStock > selectedProduct.stock) {
      setRequestType('update');
    }
  }, [newStock, selectedProduct]);

  // Helper to get capacity
  const getCapacity = () => {
    if (!selectedProduct) return 0;
    let capacity = selectedProduct.piecesPerJaba || 0;
    if (capacity === 0) {
      const configKey = Object.keys(JABA_CONFIG).find(key => selectedProduct.name.toLowerCase().includes(key.toLowerCase()));
      if (configKey) {
        const config = JABA_CONFIG[configKey];
        capacity = config.options ? (config.options[jabaType as keyof typeof config.options] || config.perJaba) : config.perJaba;
      }
    }
    return capacity;
  };

  // Jaba calculation effect
  useEffect(() => {
    if (selectedProduct && entryMode === 'jaba') {
      const capacity = getCapacity();
      setNewStock((jabas * capacity) + piezasAdicionales);
    }
  }, [jabas, piezasAdicionales, jabaType, entryMode, selectedProduct]);

  // Weight to pieces preview calculation
  const getWeightPieces = () => {
    if (!selectedProduct) return 0;
    const factor = selectedProduct.approxWeight || 1;
    return Math.round(weightKgs / factor);
  };

  // Weight to pieces additive calculation effect
  useEffect(() => {
    if (selectedProduct && entryMode === 'weight-to-pieces') {
      setNewStock(manualBaseStock + getWeightPieces());
    }
  }, [weightKgs, manualBaseStock, entryMode, selectedProduct]);

  const applyWeightToStock = () => {
    const pieces = getWeightPieces();
    setManualBaseStock(prev => prev + pieces);
    setWeightKgs(0);
  };

  const handleEntryModeChange = (newMode: 'normal' | 'jaba' | 'weight-to-pieces') => {
    let currentNewStock = newStock;
    
    // If switching OUT of weight-to-pieces, commit the calculated extra pieces to manualBaseStock
    if (entryMode === 'weight-to-pieces' && newMode !== 'weight-to-pieces') {
      const convertedPieces = getWeightPieces();
      currentNewStock = manualBaseStock + convertedPieces;
      setManualBaseStock(currentNewStock);
      setWeightKgs(0);
    }

    if (newMode === 'jaba' && entryMode !== 'jaba') {
      const capacity = getCapacity();
      if (capacity > 0) {
        // Translate currently declared stock in form manual (currentNewStock) to Jabas & extra pieces
        const calculatedJabas = Math.floor(currentNewStock / capacity);
        const calculatedExtras = Number((currentNewStock - (calculatedJabas * capacity)).toFixed(2));
        setJabas(calculatedJabas);
        setPiezasAdicionales(calculatedExtras);
      }
    }
    
    if (newMode === 'weight-to-pieces' && entryMode !== 'weight-to-pieces') {
      setManualBaseStock(currentNewStock);
      setWeightKgs(0);
    }

    setEntryMode(newMode);
  };

  const generateJabaReport = () => {
    const productsInJabas = products.filter(p => 
      !p.isDeleted && (
        (p.piecesPerJaba && p.piecesPerJaba > 0) || 
        Object.keys(JABA_CONFIG).some(key => p.name.toLowerCase().includes(key.toLowerCase())) ||
        ['jamon', 'jamón', 'salchicha', 'tocino', 'chorizo', 'peperoni', 'salami'].some(keyword => p.name.toLowerCase().includes(keyword))
      )
    );

    if (productsInJabas.length === 0) {
      alert("No hay productos configurados con jabas para generar el reporte.");
      return;
    }

    const doc = new jsPDF();
    const now = new Date();
    
    // Header
    doc.setFillColor(0, 86, 179);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("DIBAPASA", 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text("REPORTE DE INVENTARIO POR JABAS", 105, 30, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(`Fecha: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 150, 50);

    let y = 60;
    // Table Headers
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y - 5, 190, 8, 'F');
    doc.text("Producto", 12, y);
    doc.text("Stock Total", 100, y);
    doc.text("Jabas", 130, y);
    doc.text("Extras", 160, y);
    
    y += 8;
    doc.setFont("helvetica", "normal");

    productsInJabas.sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => {
      let capacity = p.piecesPerJaba || 0;
      let unit = p.unit || 'Pza';

      if (capacity === 0) {
        const configKey = Object.keys(JABA_CONFIG).find(key => p.name.toLowerCase().includes(key.toLowerCase()));
        if (configKey) {
          capacity = JABA_CONFIG[configKey].perJaba;
          unit = JABA_CONFIG[configKey].unit;
        }
      }

      const totalJabas = capacity > 0 ? Math.floor(p.stock / capacity) : 0;
      const extras = capacity > 0 ? Number((p.stock % capacity).toFixed(2)) : p.stock;

      if (y > 270) {
        doc.addPage();
        y = 30;
      }

      doc.setFontSize(8);
      doc.text(p.name.substring(0, 55), 12, y);
      doc.text(`${p.stock} ${p.unit}`, 100, y);
      doc.text(`${totalJabas} jabas`, 130, y);
      doc.text(`${extras} ${unit}`, 160, y);
      
      doc.setDrawColor(230, 230, 230);
      doc.line(10, y + 2, 200, y + 2);
      y += 8;
    });

    doc.save(`Inventario_Jabas_${now.toISOString().split('T')[0]}.pdf`);
  };

  const handleRequest = async () => {
    if (!selectedProduct || !profile) return;
    try {
      // Auto-correct type: if stock increases, it's always an update (entry)
      const finalType = newStock > selectedProduct.stock ? 'update' : requestType;
      
      if (profile.role === 'admin' || profile.role === 'inventory') {
        // Direct update for admins and inventory profile
        await updateDoc(doc(db, 'products', selectedProduct.id), {
          stock: newStock
        });
        
        // Also create an approved request for history/tracking
        await addDoc(collection(db, 'inventoryRequests'), {
          productId: selectedProduct.id || '',
          productName: selectedProduct.name || 'Producto',
          type: finalType || 'update',
          oldValue: selectedProduct.stock || 0,
          newValue: newStock || 0,
          reason: reason || (profile.role === 'admin' ? 'Actualización directa por administrador' : 'Actualización directa por encargado de inventario'),
          status: 'approved',
          requestedBy: profile.uid || 'unknown',
          requestedByName: profile.name || 'Admin',
          createdAt: serverTimestamp()
        });
      } else {
        // Request for other workers
        await addDoc(collection(db, 'inventoryRequests'), {
          productId: selectedProduct.id || '',
          productName: selectedProduct.name || 'Producto',
          type: finalType || 'update',
          oldValue: selectedProduct.stock || 0,
          newValue: newStock || 0,
          reason: reason || '',
          status: 'pending',
          requestedBy: profile.uid || 'unknown',
          requestedByName: profile.name || 'Usuario',
          createdAt: serverTimestamp()
        });
      }
      
      setIsRequestModalOpen(false);
      setSelectedProduct(null);
      setReason('');
    } catch (error) {
      const op = profile.role === 'admin' ? OperationType.UPDATE : OperationType.CREATE;
      const path = profile.role === 'admin' ? `products/${selectedProduct.id}` : 'inventoryRequests';
      handleFirestoreError(error, op, path);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("space-y-6 pb-20", hideHeader && "pb-0")}
    >
      {!hideHeader && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {effectiveRole !== 'inventory' && (
              <Button variant="ghost" onClick={onBack} className="p-2 -ml-2">
                <ChevronRight className="w-6 h-6 rotate-180" />
              </Button>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">Gestión de Inventario</h2>
              <p className="text-xs text-gray-400 font-medium">Ajustes directos y control de existencias</p>
            </div>
          </div>
          
          {/* Action buttons placed below the header */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {(profile.role === 'admin' || effectiveRole === 'admin' || effectiveRole === 'inventory') && (
              <Button
                variant="primary"
                size="sm"
                onClick={generateJabaReport}
                className="rounded-xl flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 h-9 px-3.5 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span className="font-bold text-xs">Reporte Jabas</span>
              </Button>
            )}
            {(profile.role === 'admin' || effectiveRole === 'admin' || effectiveRole === 'inventory') && (
              <Button 
                variant="outline"
                size="sm"
                onClick={onHistoryClick}
                className="rounded-xl flex items-center gap-2 h-9 px-3.5 bg-gray-50 border-gray-200 text-gray-700 font-semibold text-xs shadow-xs"
              >
                <History className="w-3.5 h-3.5 text-gray-500" />
                <span>Historial</span>
              </Button>
            )}
            {(profile.role === 'admin' || effectiveRole === 'admin') && onAddProduct && (
              <Button 
                onClick={onAddProduct}
                className="rounded-xl flex items-center gap-2 h-9 px-3.5 py-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-bold">Nuevo Producto</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto o marca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-red-600/20 text-sm"
          />
        </div>

        <div className={cn("grid gap-2", effectiveRole === 'admin' ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Categoría</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20"
            >
              <option value="Todos">Todas</option>
              {CATEGORIES.filter(c => c !== 'Todos').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Marca</label>
            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20"
            >
              <option value="Todas">Todas</option>
              {subcategories.map(sub => (
                <option key={sub} value={sub || ''}>{sub}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Existencias</label>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20"
            >
              <option value="all">Ver Todos</option>
              <option value="in">En Stock (+10)</option>
              <option value="low">{"Stock Bajo (<10)"}</option>
              <option value="out">Sin Stock (0)</option>
            </select>
          </div>

          {effectiveRole === 'admin' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Visibilidad</label>
              <select
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value as 'all' | 'visible' | 'hidden')}
                className="w-full px-2 py-1.5 text-xs bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-red-600/20 font-semibold text-gray-800"
              >
                <option value="all">Todos (Visibles y Ocultos)</option>
                <option value="visible">Solo Visibles</option>
                <option value="hidden">Solo Ocultos</option>
              </select>
            </div>
          )}

          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Todos');
                setSelectedSubcategory('Todas');
                setStockFilter('all');
                setVisibilityFilter('all');
              }}
              className="w-full py-1.5 text-[10px] text-gray-400 hover:text-red-600"
            >
              Limpiar
            </Button>
          </div>
        </div>
        
        <div className="pt-2 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
          <span>Catálogo de Productos (A-Z)</span>
          <span className="text-gray-900">{filteredProducts.length} productos</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay productos que coincidan filtros</p>
          </div>
        ) : (
          filteredProducts.map(product => (
            <div 
              key={product.id} 
              className={cn(
                "p-4 rounded-2xl border shadow-xs flex items-center justify-between gap-3 transition-all",
                product.isHidden ? "bg-amber-50/40 border-amber-200" : "bg-white border-gray-100 shadow-sm"
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {product.imageUrl ? (
                  <img 
                    src={product.imageUrl} 
                    alt={product.name} 
                    className="w-14 h-14 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                    <Package className="w-6 h-6" />
                  </div>
                )}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider truncate">
                      {product.category}
                      {product.subcategory && ` • ${product.subcategory}`}
                    </p>
                    {product.isHidden && effectiveRole === 'admin' && (
                      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        <EyeOff className="w-2.5 h-2.5 text-amber-700" />
                        Oculto
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-gray-900 truncate">
                    {product.name}
                    {product.unit === 'Kg' && product.approxWeight && (
                      <span className="text-gray-400 font-normal"> ({product.approxWeight} Kg aprox.)</span>
                    )}
                  </h4>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-gray-500">Stock: <span className="font-bold text-gray-900">{product.stock} pzs</span></span>
                    <span className="text-orange-500">Apartado: <span className="font-bold">{product.reserved} pzs</span></span>
                    <span className="text-blue-500">Disp: <span className="font-bold">{product.stock - product.reserved} pzs</span></span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {effectiveRole === 'admin' && onEditProduct && (
                  <Button 
                    variant="ghost" 
                    className="p-2 rounded-xl text-gray-400 hover:text-red-600 h-9 w-9 flex items-center justify-center"
                    onClick={() => onEditProduct(product)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="p-2 rounded-xl h-9 w-9 flex items-center justify-center border-gray-200"
                  onClick={() => {
                    setSelectedProduct(product);
                    setNewStock(product.stock);
                    setJabas(0);
                    setPiezasAdicionales(0);
                    setWeightKgs(0);
                    setManualBaseStock(product.stock);
                    setEntryMode('normal');
                    setRequestType('update');
                    setIsRequestModalOpen(true);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isRequestModalOpen && selectedProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">{profile.role === 'admin' ? 'Actualizar Inventario' : 'Solicitar Modificación'}</h3>
                <Button variant="ghost" onClick={() => setIsRequestModalOpen(false)} className="p-1">
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Producto</label>
                  <p className="font-medium">{selectedProduct.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant={requestType === 'update' ? 'primary' : 'outline'}
                    onClick={() => setRequestType('update')}
                    className="text-xs"
                  >
                    Actualizar Stock
                  </Button>
                  <Button 
                    variant={requestType === 'waste' ? 'secondary' : 'outline'}
                    onClick={() => setRequestType('waste')}
                    className="text-xs"
                    disabled={newStock > selectedProduct.stock}
                  >
                    Reportar Merma
                  </Button>
                </div>

                {/* Entry Mode Selector */}
                {(selectedProduct.piecesPerJaba || 
                  Object.keys(JABA_CONFIG).some(key => selectedProduct.name.toLowerCase().includes(key.toLowerCase())) ||
                  ['jamon', 'jamón', 'salchicha', 'tocino', 'chorizo', 'peperoni', 'salami'].some(keyword => selectedProduct.name.toLowerCase().includes(keyword))) && (
                  <div className="bg-gray-50 p-1 rounded-xl flex gap-1">
                    {[
                      { id: 'normal', label: 'Manual' },
                      { id: 'jaba', label: 'Jabas/Pzs' },
                      { id: 'weight-to-pieces', label: 'Kilos a Pzs' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => handleEntryModeChange(m.id as any)}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                          entryMode === m.id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}

                {entryMode === 'normal' && (
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Nuevo Valor ({selectedProduct.unit})</label>
                    <div className="flex items-center gap-4 mt-1">
                      <Button 
                        variant="outline" 
                        onClick={() => setNewStock(Math.max(0, newStock - 1))}
                        className="p-2"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <input 
                        type="number"
                        className="text-xl font-bold w-24 text-center border-b-2 border-gray-100 focus:border-[#0056b3] focus:outline-none transition-colors bg-transparent"
                        value={newStock}
                        onChange={(e) => setNewStock(parseFloat(e.target.value) || 0)}
                        step={selectedProduct.unit === 'Kg' ? "0.1" : "1"}
                      />
                      <Button 
                        variant="outline" 
                        onClick={() => setNewStock(newStock + 1)}
                        className="p-2"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {entryMode === 'jaba' && (
                  <div className="space-y-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    {(() => {
                      let capacity = selectedProduct.piecesPerJaba || 0;
                      let unitLabel = selectedProduct.unit;
                      let options: Record<string, number> | undefined;

                      const configKey = Object.keys(JABA_CONFIG).find(key => selectedProduct.name.toLowerCase().includes(key.toLowerCase()));
                      const config = configKey ? JABA_CONFIG[configKey] : null;

                      if (capacity === 0 && config) {
                        capacity = config.perJaba;
                        unitLabel = config.unit;
                        options = config.options;
                      }

                      const finalCapacity = options ? options[jabaType] || capacity : capacity;
                      
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">Jabas ({finalCapacity} {unitLabel}/jaba)</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input 
                                  type="number"
                                  className="w-full text-lg font-bold bg-white border border-blue-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  value={jabas}
                                  onChange={(e) => setJabas(parseInt(e.target.value) || 0)}
                                  min="0"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">Piezas/Kg Extras</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input 
                                  type="number"
                                  className="w-full text-lg font-bold bg-white border border-blue-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  value={piezasAdicionales}
                                  onChange={(e) => setPiezasAdicionales(parseFloat(e.target.value) || 0)}
                                  min="0"
                                  step={unitLabel === 'Kg' ? "0.1" : "1"}
                                />
                              </div>
                            </div>
                          </div>

                          {options && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-blue-600 uppercase">Tipo de Jaba</label>
                              <div className="flex gap-2">
                                {Object.keys(options).map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => setJabaType(opt)}
                                    className={cn(
                                      "flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all",
                                      jabaType === opt ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"
                                    )}
                                  >
                                    {opt} ({options![opt]} {unitLabel})
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="pt-2 border-t border-blue-100 flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium tracking-tight">Total calculado:</span>
                            <span className="text-blue-700 font-black text-sm">{newStock} {unitLabel}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {entryMode === 'weight-to-pieces' && (
                  <div className="space-y-4 bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                    <div>
                      <label className="text-[10px] font-black text-orange-600 uppercase italic">Sumar Peso Recibido (Kilos)</label>
                      <div className="flex items-center gap-3 mt-1">
                        <input 
                          type="number"
                          className="w-full text-xl font-bold bg-white border border-orange-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="0.00 kg"
                          value={weightKgs || ''}
                          onChange={(e) => setWeightKgs(parseFloat(e.target.value) || 0)}
                          step="0.01"
                        />
                      </div>
                      <p className="text-[9px] text-orange-400 mt-2 italic px-1">
                        * Calcula piezas basándose en {selectedProduct.approxWeight || 1}kg por pieza y las suma al total manual ({manualBaseStock})
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-400">Base Manual:</span>
                        <span className="font-bold">{manualBaseStock} Pzs</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-400">Extra por Peso:</span>
                        <span className="font-bold text-orange-600">+{getWeightPieces()} Pzs</span>
                      </div>
                      <div className="pt-2 border-t border-orange-100 flex justify-between items-center text-xs pb-3">
                        <span className="text-gray-500 font-medium tracking-tight">Nuevo Total:</span>
                        <span className="text-orange-700 font-black text-sm">{newStock} Pzs</span>
                      </div>
                      
                      <Button 
                        onClick={applyWeightToStock}
                        disabled={weightKgs <= 0}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black text-xs h-8 rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3 h-3" />
                        CONFIRMAR Y SUMAR AL TOTAL
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Motivo {profile.role !== 'admin' && '(Obligatorio)'}</label>
                  <textarea 
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] transition-all resize-none h-24"
                    placeholder={profile.role === 'admin' ? "Opcional: Notas sobre el cambio..." : "Explica por qué necesitas este cambio..."}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <Button 
                  className="w-full py-4 text-lg" 
                  disabled={profile.role !== 'admin' && !reason}
                  onClick={handleRequest}
                >
                  {profile.role === 'admin' ? 'Confirmar Cambios' : 'Enviar Solicitud'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AdminInventoryTrackingView({ 
  orders, 
  requests, 
  products,
  profile,
  selectedDate,
  onDateChange,
  period = 'day',
  onPeriodChange,
  onBack,
  onDeleteRequest,
  onEditProduct,
  onAddProduct,
  onRefresh,
  inventorySearchQuery,
  setInventorySearchQuery,
  inventorySelectedCategory,
  setInventorySelectedCategory,
  inventorySelectedSubcategory,
  setInventorySelectedSubcategory,
  inventoryStockFilter,
  setInventoryStockFilter,
  showToast
}: { 
  orders: Order[], 
  requests: InventoryRequest[], 
  products: Product[],
  profile: UserProfile,
  selectedDate: string,
  onDateChange?: (date: string) => void,
  period?: 'day' | 'week' | 'month' | 'year',
  onPeriodChange?: (p: 'day' | 'week' | 'month' | 'year') => void,
  onBack: () => void,
  onDeleteRequest: (id: string) => void,
  onEditProduct?: (product: Product) => void,
  onAddProduct?: () => void,
  onRefresh?: () => void,
  inventorySearchQuery?: string,
  setInventorySearchQuery?: (q: string) => void,
  inventorySelectedCategory?: string,
  setInventorySelectedCategory?: (c: string) => void,
  inventorySelectedSubcategory?: string,
  setInventorySelectedSubcategory?: (s: string) => void,
  inventoryStockFilter?: string,
  setInventoryStockFilter?: (f: string) => void,
  showToast?: (msg: string, type: any) => void
}) {
  const effectiveRole = profile.role === 'admin' ? (profile.viewAs || 'admin') : profile.role;
  const [activeTab, setActiveTab] = useState<'management' | 'sold' | 'waste' | 'entries'>('management');
  const [historySearch, setHistorySearch] = useState('');

  const generateJabaReport = () => {
    const productsInJabas = products.filter(p => 
      !p.isDeleted && (
        (p.piecesPerJaba && p.piecesPerJaba > 0) || 
        Object.keys(JABA_CONFIG).some(key => p.name.toLowerCase().includes(key.toLowerCase())) ||
        ['jamon', 'jamón', 'salchicha', 'tocino', 'chorizo', 'peperoni', 'salami'].some(keyword => p.name.toLowerCase().includes(keyword))
      )
    );

    if (productsInJabas.length === 0) {
      alert("No hay productos configurados con jabas para generar el reporte.");
      return;
    }

    const doc = new jsPDF();
    const now = new Date();
    
    // Header
    doc.setFillColor(0, 86, 179);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("DIBAPASA", 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text("REPORTE DE INVENTARIO POR JABAS", 105, 30, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(`Fecha: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 150, 50);

    let y = 60;
    // Table Headers
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y - 5, 190, 8, 'F');
    doc.text("Producto", 12, y);
    doc.text("Stock Total", 100, y);
    doc.text("Jabas", 130, y);
    doc.text("Extras", 160, y);
    
    y += 8;
    doc.setFont("helvetica", "normal");

    productsInJabas.sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => {
      let capacity = p.piecesPerJaba || 0;
      let unit = p.unit || 'Pza';

      if (capacity === 0) {
        const configKey = Object.keys(JABA_CONFIG).find(key => p.name.toLowerCase().includes(key.toLowerCase()));
        if (configKey) {
          capacity = JABA_CONFIG[configKey].perJaba;
          unit = JABA_CONFIG[configKey].unit;
        }
      }

      const totalJabas = capacity > 0 ? Math.floor(p.stock / capacity) : 0;
      const extras = capacity > 0 ? Number((p.stock % capacity).toFixed(2)) : p.stock;

      if (y > 270) {
        doc.addPage();
        y = 30;
      }

      doc.setFontSize(8);
      doc.text(p.name.substring(0, 55), 12, y);
      doc.text(`${p.stock} ${p.unit}`, 100, y);
      doc.text(`${totalJabas} jabas`, 130, y);
      doc.text(`${extras} ${unit}`, 160, y);
      
      doc.setDrawColor(230, 230, 230);
      doc.line(10, y + 2, 200, y + 2);
      y += 8;
    });

    doc.save(`Inventario_Jabas_${now.toISOString().split('T')[0]}.pdf`);
  };

  const anchorDate = new Date(selectedDate + 'T00:00:00');
  const startOfPeriod = new Date(anchorDate);
  const endOfPeriod = new Date(anchorDate);

  if (period === 'week') {
    startOfPeriod.setDate(anchorDate.getDate() - anchorDate.getDay());
    startOfPeriod.setHours(0,0,0,0);
    endOfPeriod.setDate(startOfPeriod.getDate() + 6);
    endOfPeriod.setHours(23,59,59,999);
  } else if (period === 'month') {
    startOfPeriod.setDate(1);
    startOfPeriod.setHours(0,0,0,0);
    endOfPeriod.setMonth(startOfPeriod.getMonth() + 1, 0);
    endOfPeriod.setHours(23,59,59,999);
  } else if (period === 'year') {
    startOfPeriod.setMonth(0, 1);
    startOfPeriod.setHours(0,0,0,0);
    endOfPeriod.setFullYear(startOfPeriod.getFullYear(), 11, 31);
    endOfPeriod.setHours(23,59,59,999);
  }

  const soldProducts = useMemo(() => {
    const sold: Record<string, { name: string, quantity: number, total: number }> = {};
    orders
      .filter(o => {
        if (!o.createdAt) return false;
        const orderDate = new Date(o.createdAt.seconds * 1000);
        
        const isDelivered = o.status === 'delivered';
        if (!isDelivered) return false;

        if (period === 'day') {
          return orderDate.toISOString().split('T')[0] === selectedDate;
        } else {
          return orderDate >= startOfPeriod && orderDate <= endOfPeriod;
        }
      })
      .forEach(o => {
        o.items.forEach(item => {
          if (!sold[item.productId]) {
            sold[item.productId] = { name: item.name, quantity: 0, total: 0 };
          }
          sold[item.productId].quantity += item.quantity;
          sold[item.productId].total += item.quantity * item.price;
        });
      });
    return Object.entries(sold)
      .filter(([_, data]) => data.name.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => b[1].quantity - a[1].quantity);
  }, [orders, selectedDate, period, startOfPeriod, endOfPeriod, historySearch]);

  const wasteRecords = useMemo(() => {
    return requests
      .filter(r => {
        if (!r.createdAt) return false;
        const requestDate = new Date(r.createdAt.seconds * 1000);
        
        const isWaste = r.type === 'waste' && r.status === 'approved';
        if (!isWaste) return false;

        if (period === 'day') {
          return requestDate.toISOString().split('T')[0] === selectedDate;
        } else {
          return requestDate >= startOfPeriod && requestDate <= endOfPeriod;
        }
      })
      .filter(r => r.productName.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [requests, selectedDate, period, startOfPeriod, endOfPeriod, historySearch]);

  const entryRecords = useMemo(() => {
    return requests
      .filter(r => {
        if (!r.createdAt) return false;
        const requestDate = new Date(r.createdAt.seconds * 1000);
        
        const isEntry = r.type === 'update' && r.status === 'approved' && r.newValue > r.oldValue;
        if (!isEntry) return false;

        if (period === 'day') {
          return requestDate.toISOString().split('T')[0] === selectedDate;
        } else {
          return requestDate >= startOfPeriod && requestDate <= endOfPeriod;
        }
      })
      .filter(r => r.productName.toLowerCase().includes(historySearch.toLowerCase()))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }, [requests, selectedDate, period, startOfPeriod, endOfPeriod, historySearch]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {effectiveRole !== 'inventory' && (
            <Button variant="ghost" onClick={onBack} className="p-2 -ml-2">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">Gestión e Inventario</h2>
            <p className="text-xs text-gray-400 font-medium">Control de stock, reportes y métricas operativas</p>
          </div>
        </div>

        {/* Action Buttons arranged cleanly beneath the title */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(profile.role === 'admin' || effectiveRole === 'admin' || effectiveRole === 'inventory') && (
            <Button
              variant="primary"
              size="sm"
              onClick={generateJabaReport}
              className="rounded-xl flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 h-9 px-3.5 shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span className="font-bold text-xs">Reporte Jabas</span>
            </Button>
          )}
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={onRefresh} 
            className="rounded-xl flex items-center gap-2 h-9 px-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs border border-gray-200/60 shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </Button>
          {(profile.role === 'admin' || effectiveRole === 'admin') && onAddProduct && (
            <Button 
              onClick={onAddProduct}
              className="rounded-xl flex items-center gap-2 h-9 px-3.5 py-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs font-bold">Nuevo Producto</span>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Period Selector */}
        {effectiveRole === 'admin' && (
          <div className="bg-gray-100 p-1 rounded-2xl flex">
            {[
              { id: 'day', label: 'Día' },
              { id: 'week', label: 'Semana' },
              { id: 'month', label: 'Mes' },
              { id: 'year', label: 'Año' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => onPeriodChange?.(p.id as any)}
                className={cn(
                  "flex-1 py-1.5 text-[9px] font-bold rounded-xl transition-all",
                  period === p.id ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase">
              {period === 'day' ? 'Fecha Seleccionada' : 'Seleccionar Referencia'}
            </p>
            <Calendar className="w-3 h-3 text-gray-400" />
          </div>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => onDateChange && onDateChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0056b3]/20 focus:border-[#0056b3] text-xs font-medium text-gray-900"
          />
          {period !== 'day' && (
            <div className="pt-2 border-t border-gray-50 text-center">
              <p className="text-[10px] font-bold text-blue-600 uppercase">
                {period === 'week' ? 'Semana selecionada' : period === 'month' ? 'Mes selecionado' : 'Año selecionado'}
              </p>
              <p className="text-[9px] text-blue-400 italic">
                {startOfPeriod.toLocaleDateString()} - {endOfPeriod.toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex bg-gray-100 p-1 rounded-2xl overflow-x-auto no-scrollbar">
        <button 
          onClick={() => { setActiveTab('management'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[80px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'management' ? "bg-white text-[#0056b3] shadow-sm" : "text-gray-500"
          )}
        >
          Gestión
        </button>
        <button 
          onClick={() => { setActiveTab('sold'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[80px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'sold' ? "bg-white text-[#0056b3] shadow-sm" : "text-gray-500"
          )}
        >
          Vendidos
        </button>
        <button 
          onClick={() => { setActiveTab('waste'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[80px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'waste' ? "bg-white text-red-600 shadow-sm" : "text-gray-500"
          )}
        >
          Mermas
        </button>
        <button 
          onClick={() => { setActiveTab('entries'); setHistorySearch(''); }}
          className={cn(
            "flex-1 min-w-[80px] py-2 text-[10px] font-bold rounded-xl transition-all whitespace-nowrap",
            activeTab === 'entries' ? "bg-white text-green-600 shadow-sm" : "text-gray-500"
          )}
        >
          Entradas
        </button>
      </div>

      {activeTab !== 'management' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Filtrar por nombre de producto..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-600/20 text-xs"
          />
        </div>
      )}

      <div className="space-y-4">
        {activeTab === 'management' && (
          <InventoryView 
            products={products} 
            profile={profile} 
            onBack={() => {}} 
            onEditProduct={onEditProduct}
            onAddProduct={onAddProduct}
            hideHeader 
            searchQuery={inventorySearchQuery}
            setSearchQuery={setInventorySearchQuery}
            selectedCategory={inventorySelectedCategory}
            setSelectedCategory={setInventorySelectedCategory}
            selectedSubcategory={inventorySelectedSubcategory}
            setSelectedSubcategory={setInventorySelectedSubcategory}
            stockFilter={inventoryStockFilter}
            setStockFilter={setInventoryStockFilter}
            showToast={showToast}
          />
        )}

        {activeTab === 'sold' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {soldProducts.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No hay registros de ventas entregadas</p>
            ) : (
              soldProducts.map(([id, data]) => {
                const prod = products.find(p => p.id === id || p.name.toLowerCase() === data.name.toLowerCase());
                return (
                  <div key={id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {prod?.imageUrl ? (
                        <img 
                          src={prod.imageUrl} 
                          alt={data.name} 
                          className="w-12 h-12 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 truncate">{data.name}</p>
                        <p className="text-xs text-gray-400">Total vendido: ${data.total.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-black text-[#0056b3]">{data.quantity}</p>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Unidades</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'waste' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {wasteRecords.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No hay registros de mermas aprobadas</p>
            ) : (
              wasteRecords.map(record => {
                const prod = products.find(p => p.id === record.productId || p.name.toLowerCase() === record.productName?.toLowerCase());
                return (
                  <div key={record.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2 relative group">
                    <button 
                      onClick={() => onDeleteRequest(record.id)}
                      className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-3 pr-8">
                      {prod?.imageUrl ? (
                        <img 
                          src={prod.imageUrl} 
                          alt={record.productName} 
                          className="w-12 h-12 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-gray-900 truncate">{record.productName}</p>
                          <div className="bg-red-50 text-red-600 px-2 py-0.5 rounded-lg text-xs font-bold whitespace-nowrap">
                            -{record.oldValue - record.newValue} uds
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">{record.createdAt?.toDate().toLocaleString()}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 italic pl-1">"{record.reason}"</p>
                    <p className="text-[10px] text-gray-400 pl-1">Reportado por: {record.requestedByName}</p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'entries' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {entryRecords.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">No hay registros de entradas aprobadas</p>
            ) : (
              entryRecords.map(record => {
                const prod = products.find(p => p.id === record.productId || p.name.toLowerCase() === record.productName?.toLowerCase());
                return (
                  <div key={record.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2 relative group">
                    <button 
                      onClick={() => onDeleteRequest(record.id)}
                      className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-3 pr-8">
                      {prod?.imageUrl ? (
                        <img 
                          src={prod.imageUrl} 
                          alt={record.productName} 
                          className="w-12 h-12 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-xs" 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 text-gray-300">
                          <Package className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-gray-900 truncate">{record.productName}</p>
                          <div className="bg-green-50 text-green-600 px-2 py-0.5 rounded-lg text-xs font-bold whitespace-nowrap">
                            +{record.newValue - record.oldValue} uds
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">{record.createdAt?.toDate().toLocaleString()}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 italic pl-1">"{record.reason}"</p>
                    <p className="text-[10px] text-gray-400 pl-1">Registrado por: {record.requestedByName}</p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AdminNotificationsView({ 
  requests, 
  notifications, 
  onBack,
  onApprove,
  onReject,
  onMarkAsRead,
  onDeleteNotification,
  isAdmin
}: { 
  requests: InventoryRequest[], 
  notifications: AppNotification[],
  onBack: () => void,
  onApprove: (request: InventoryRequest) => void,
  onReject: (request: InventoryRequest) => void,
  onMarkAsRead: (id: string) => void,
  onDeleteNotification: (id: string) => void,
  isAdmin: boolean
}) {
  const [activeTab, setActiveTab] = useState<'requests' | 'notifications'>(isAdmin ? 'requests' : 'notifications');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="p-2">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </Button>
        <h2 className="text-xl font-bold text-gray-900">
          {isAdmin ? 'Notificaciones y Solicitudes' : 'Mis Alertas'}
        </h2>
      </div>

      {isAdmin && (
        <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
          <button 
            onClick={() => setActiveTab('requests')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
              activeTab === 'requests' ? "bg-white shadow-sm text-[#0056b3]" : "text-gray-500"
            )}
          >
            Solicitudes ({requests.filter(r => r.status === 'pending').length})
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
              activeTab === 'notifications' ? "bg-white shadow-sm text-[#0056b3]" : "text-gray-500"
            )}
          >
            Alertas ({notifications.filter(n => !n.read).length})
          </button>
        </div>
      )}

      <div className="space-y-4">
        {activeTab === 'requests' && isAdmin ? (
          requests.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay solicitudes pendientes</p>
            </div>
          ) : (
            requests.map(request => (
              <div key={request.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-bold uppercase mb-1 inline-block",
                      request.type === 'update' ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    )}>
                      {request.type === 'update' ? 'Actualización' : 'Merma'}
                    </span>
                    <h4 className="font-bold text-gray-900">{request.productName}</h4>
                    <p className="text-[10px] text-gray-500">Por: {request.requestedByName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-400">Cambio</p>
                    <p className="text-sm font-black">{request.oldValue} → {request.newValue}</p>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded-xl">
                  <p className="text-xs text-gray-600 italic">"{request.reason}"</p>
                </div>

                {request.status === 'pending' ? (
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="secondary" 
                      className="flex-1 py-2 text-xs"
                      onClick={() => onReject(request)}
                    >
                      Rechazar
                    </Button>
                    <Button 
                      className="flex-1 py-2 text-xs"
                      onClick={() => onApprove(request)}
                    >
                      Aprobar
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-center pt-2">
                    <span className={cn(
                      "text-xs font-bold px-4 py-1 rounded-full",
                      request.status === 'approved' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {request.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          notifications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No tienes notificaciones</p>
            </div>
          ) : (
            notifications.map(notification => (
              <div 
                key={notification.id} 
                className={cn(
                  "bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex gap-4 items-start transition-all relative group",
                  !notification.read && "border-l-4 border-l-[#0056b3]"
                )}
                onClick={() => onMarkAsRead(notification.id)}
              >
                <div className={cn(
                  "p-2 rounded-xl shrink-0",
                  notification.type === 'order' ? "bg-blue-100 text-blue-600" :
                  notification.type === 'inventory' ? "bg-orange-100 text-orange-600" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {notification.type === 'order' ? <Package className="w-5 h-5" /> :
                   notification.type === 'inventory' ? <AlertTriangle className="w-5 h-5" /> :
                   <Bell className="w-5 h-5" />}
                </div>
                <div className="flex-1 space-y-1 pr-6">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm text-gray-900">{notification.title}</h4>
                    <span className="text-[10px] text-gray-400">
                      {notification.createdAt?.seconds ? new Date(notification.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ahora'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{notification.message}</p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNotification(notification.id);
                  }}
                  className="absolute top-4 right-4 p-1 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))
          )
        )}
      </div>
    </motion.div>
  );
}

function AdminOrdersView({ 
  orders, 
  users, 
  products, 
  filter = 'all', 
  selectedDate,
  onBack,
  showToast,
  onLoadMore,
  onRefresh,
  hasMore,
  isLoading
}: { 
  orders: Order[], 
  users: UserProfile[], 
  products: Product[], 
  filter?: Order['status'] | 'all', 
  selectedDate: string,
  onBack: () => void,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  onLoadMore?: () => void,
  onRefresh?: () => void,
  hasMore?: boolean,
  isLoading?: boolean
}) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isChangingDriver, setIsChangingDriver] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [newDriverId, setNewDriverId] = useState('');

  useEffect(() => {
    if (!selectedOrder) {
      setIsCancelling(false);
      setIsChangingDriver(false);
    }
  }, [selectedOrder]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (!o.createdAt) return false;
      const orderDate = new Date(o.createdAt.seconds * 1000).toISOString().split('T')[0];
      const matchesDate = orderDate === selectedDate;
      const matchesStatus = filter === 'all' || o.status === filter;
      return matchesDate && matchesStatus;
    });
  }, [orders, filter, selectedDate]);

  const drivers = users.filter(u => u.role === 'driver' || u.role === 'admin');

  const cancelOrder = async (order: Order) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
      
      if (order.status === 'processing') {
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            await updateDoc(doc(db, 'products', product.id), {
              reserved: Math.max(0, (product.reserved || 0) - item.quantity)
            });
          }
        }
      } else if (['ready', 'shipped', 'delivered'].includes(order.status)) {
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            await updateDoc(doc(db, 'products', product.id), {
              stock: (product.stock || 0) + item.quantity
            });
          }
        }
      }
      
      setIsCancelling(false);
      setSelectedOrder(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const changeDriver = async (order: Order) => {
    if (!newDriverId) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        driverId: newDriverId,
        status: 'shipped',
        onboarded: true
      });
      setIsChangingDriver(false);
      setNewDriverId('');
      setSelectedOrder(prev => prev ? { ...prev, driverId: newDriverId, status: 'shipped', onboarded: true } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const statusLabels: Record<string, string> = {
    all: 'Todos los Pedidos',
    pending: 'Pedidos Pendientes',
    processing: 'Pedidos en Preparación',
    ready: 'Pedidos Listos',
    shipped: 'Pedidos en Ruta',
    delivered: 'Pedidos Entregados',
    cancelled: 'Pedidos Cancelados'
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ChevronRight className="w-6 h-6 rotate-180" />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">{statusLabels[filter]}</h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} className="p-2 h-10 w-10 flex items-center justify-center">
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay pedidos en esta sección</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <button 
              key={order.id} 
              onClick={() => setSelectedOrder(order)}
              className="w-full text-left bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 hover:border-[#0056b3] transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                  <p className="text-xs text-gray-500">{order.userName}</p>
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                  order.status === 'pending' ? "bg-orange-100 text-orange-700" :
                  order.status === 'processing' ? "bg-blue-100 text-blue-700" :
                  order.status === 'ready' ? "bg-purple-100 text-purple-700" :
                  order.status === 'shipped' ? "bg-indigo-100 text-indigo-700" :
                  order.status === 'delivered' ? "bg-green-100 text-green-700" :
                  "bg-red-100 text-red-700"
                )}>
                  {order.status}
                </span>
              </div>
              <div className="flex items-start gap-2 text-[10px] text-gray-500">
                <MapPin className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                <span className="truncate">{order.address}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                <span className="text-xs text-gray-400">{order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleDateString() : 'Recién'}</span>
                <div className="text-right">
                  {order.hasReturns && (
                    <p className="text-[8px] text-gray-400 line-through">${order.total.toFixed(2)}</p>
                  )}
                  <p className="font-bold text-[#0056b3]">${(order.adjustedTotal ?? order.total).toFixed(2)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button 
            variant="outline" 
            onClick={onLoadMore} 
            disabled={isLoading}
            className="w-full max-w-xs"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Cargar más pedidos"}
          </Button>
        </div>
      )}

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Detalles del Pedido</h3>
                <Button variant="ghost" onClick={() => setSelectedOrder(null)} className="p-1">
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-start p-4 bg-gray-50 rounded-2xl">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">ID del Pedido</p>
                    <p className="font-bold text-gray-900">#{selectedOrder.id.toUpperCase()}</p>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-1 rounded font-bold uppercase",
                    selectedOrder.status === 'pending' ? "bg-orange-100 text-orange-700" :
                    selectedOrder.status === 'processing' ? "bg-blue-100 text-blue-700" :
                    selectedOrder.status === 'ready' ? "bg-purple-100 text-purple-700" :
                    selectedOrder.status === 'shipped' ? "bg-indigo-100 text-indigo-700" :
                    selectedOrder.status === 'delivered' ? "bg-green-100 text-green-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {selectedOrder.status}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Cliente</p>
                  <div className="p-4 bg-white border border-gray-100 rounded-2xl space-y-1">
                    <p className="font-bold text-gray-900">{selectedOrder.userName}</p>
                    <p className="text-xs text-gray-500">{selectedOrder.userEmail}</p>
                    {selectedOrder.userPhone && <p className="text-xs text-gray-500">{selectedOrder.userPhone}</p>}
                    <div className="flex flex-col gap-2 pt-2 border-t border-gray-50 mt-2">
                      <div className="flex items-start gap-2 text-xs text-gray-500">
                        <MapPin className="w-4 h-4 text-red-500 shrink-0" />
                        <span>{selectedOrder.address}</span>
                      </div>
                      {selectedOrder.deliveryDistance && (
                        <p className="text-[10px] font-bold text-blue-600 pl-6">
                          DISTANCIA: {selectedOrder.deliveryDistance.toFixed(1)} km
                        </p>
                      )}
                    </div>
                    {selectedOrder.deliveryWindowStart && selectedOrder.deliveryWindowEnd && (
                      <div className="flex items-center gap-2 text-[10px] text-blue-700 bg-blue-50/50 p-2 rounded-xl border border-blue-100/30 mt-2">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-bold">ORDENADO P/ FECHA: {selectedOrder.deliverySlot?.split(' ')[0]} - VENTANA: {selectedOrder.deliveryWindowStart} - {selectedOrder.deliveryWindowEnd}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 border border-gray-100">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-medium text-gray-900">{item.name}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-900">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {(selectedOrder.returnedItems || []).map((item, i) => (
                      <div key={`ret-${i}`} className="flex justify-between items-center p-3 bg-orange-50/50 border border-dashed border-orange-100 rounded-xl opacity-70">
                        <div className="flex items-center gap-3">
                          <RotateCcw className="w-4 h-4 text-orange-400" />
                          <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-orange-500 border border-orange-100">
                            {item.quantity}
                          </span>
                          <span className="text-xs font-medium text-orange-900 line-through">{item.name}</span>
                        </div>
                        <span className="text-xs font-bold text-orange-900">-${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Subtotal Productos</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                  </div>
                  {(selectedOrder.deliveryFee || 0) > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Costo de Envío</span>
                      <span className="font-bold text-gray-900">${(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">IVA Incluido (16%)</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - ((selectedOrder.adjustedTotal ?? selectedOrder.total) / 1.16)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-gray-500">Monto sin ajustar</span>
                    <span className="font-bold text-gray-900">${selectedOrder.total.toFixed(2)}</span>
                  </div>
                  {selectedOrder.hasReturns && (
                    <div className="flex justify-between items-center py-1 text-orange-600">
                      <span className="text-sm font-medium">Descuento por Devolución</span>
                      <span className="font-bold">-${(selectedOrder.total - (selectedOrder.adjustedTotal ?? selectedOrder.total)).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                    <span className="text-sm font-bold text-gray-900">Total a Pagar</span>
                    <span className="text-xl font-black text-[#0056b3]">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</span>
                  </div>

                </div>

                {selectedOrder.status !== 'cancelled' && (
                  <div className="pt-4 space-y-3">
                    {isCancelling ? (
                      <div className="bg-red-50 p-4 rounded-2xl border border-red-100 space-y-3">
                        <p className="text-xs font-bold text-red-600 text-center">¿Estás seguro de que deseas cancelar este pedido?</p>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 bg-white" onClick={() => setIsCancelling(false)}>No, volver</Button>
                          <Button variant="secondary" className="flex-1 bg-red-600 text-white hover:bg-red-700" onClick={() => cancelOrder(selectedOrder)}>Sí, cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {['ready', 'shipped'].includes(selectedOrder.status) && (
                          <div className="space-y-2">
                            <p className="text-[10px] text-gray-400 font-bold uppercase ml-1">Gestión de Repartidor</p>
                            {isChangingDriver ? (
                              <div className="space-y-2">
                                <select 
                                  className="w-full p-3 rounded-xl border border-gray-200 text-sm"
                                  value={newDriverId}
                                  onChange={(e) => setNewDriverId(e.target.value)}
                                >
                                  <option value="">Seleccionar nuevo repartidor</option>
                                  {drivers.map(d => (
                                    <option key={d.uid} value={d.uid}>{d.name || 'Sin nombre'} ({d.role})</option>
                                  ))}
                                </select>
                                <div className="flex gap-2">
                                  <Button variant="outline" className="flex-1" onClick={() => setIsChangingDriver(false)}>Cancelar</Button>
                                  <Button className="flex-1" onClick={() => changeDriver(selectedOrder)} disabled={!newDriverId}>Confirmar</Button>
                                </div>
                              </div>
                            ) : (
                              <Button 
                                variant="outline" 
                                className="w-full h-12 flex items-center justify-center gap-2"
                                onClick={() => setIsChangingDriver(true)}
                              >
                                <Truck className="w-5 h-5" />
                                {selectedOrder.driverId ? 'Cambiar Repartidor' : 'Asignar Repartidor'}
                              </Button>
                            )}
                          </div>
                        )}
                        
                        <Button 
                          variant="secondary" 
                          className="w-full h-12 text-red-600 hover:bg-red-50 border-red-100"
                          onClick={() => setIsCancelling(true)}
                        >
                          Cancelar Pedido
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {selectedOrder.status !== 'cancelled' && (
                  <Button 
                    variant="outline" 
                    className="w-full py-3 rounded-2xl flex items-center justify-center gap-2"
                    onClick={() => generateInvoicePDF(selectedOrder)}
                  >
                    <FileText className="w-5 h-5" />
                    Descargar Factura PDF
                  </Button>
                )}

                <div className="text-[10px] text-gray-400 text-center">
                  Fecha: {selectedOrder.createdAt?.seconds ? new Date(selectedOrder.createdAt.seconds * 1000).toLocaleString() : 'Recién'}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DispatcherView({ 
  orders, 
  routes,
  users, 
  products, 
  onBack, 
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[], 
  routes: DeliveryRoute[],
  users: UserProfile[], 
  products: Product[], 
  onBack: () => void, 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  initialTab?: 'pending' | 'history'
}) {
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'routes'>('orders');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [newRouteData, setNewRouteData] = useState({ name: '', unitNumber: '', driverId: '' });

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const acceptedOrders = orders.filter(o => o.status === 'accepted');
  const processableOrders = orders.filter(o => o.status === 'processing' || o.status === 'ready');
  const historyOrders = orders.filter(o => o.status !== 'pending' && o.status !== 'accepted' && o.status !== 'processing' && o.status !== 'ready' && o.status !== 'cancelled').slice(0, 50);

  const drivers = users.filter(u => u.role === 'driver' || u.role === 'admin');

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getTimingStatus = (order: Order) => {
    if (order.status === 'delivered' || order.status === 'completed' || order.status === 'cancelled') return null;
    if (!order.deliveryWindowStart) return null;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    let dateStr = "";
    if (order.type === 'pickup') {
      const match = order.deliverySlot?.match(/(\d{4}-\d{2}-\d{2})/);
      dateStr = match ? match[1] : "";
    } else {
      dateStr = order.deliverySlot?.split(' ')[0] || "";
    }

    if (!dateStr) return null;

    if (dateStr < todayStr) return { label: 'RETRASADO', color: 'red' };
    
    if (dateStr === todayStr) {
      const deadlineStr = order.type === 'pickup' ? order.deliveryWindowStart : order.deliveryWindowEnd;
      const [h, m] = deadlineStr!.split(':').map(Number);
      const deadlineTotal = h * 60 + m;
      const currentTotal = now.getHours() * 60 + now.getMinutes();

      if (currentTotal > deadlineTotal) {
        return { label: 'RETRASADO', color: 'red' };
      } else if (deadlineTotal - currentTotal <= 60) {
        return { label: 'POR VENCER', color: 'amber' };
      }
    }

    return { label: 'A TIEMPO', color: 'green' };
  };

  const saveRoute = async () => {
    if (!newRouteData.name || !newRouteData.unitNumber || !newRouteData.driverId) {
      showToast('Por favor completa todos los campos de la ruta', 'error');
      return;
    }

    // Check if driver already has an active or in-progress route
    const existingDriverRoute = routes.find(r => 
      r.driverId === newRouteData.driverId && 
      (r.status === 'active' || r.status === 'in_progress') &&
      r.id !== editingRouteId
    );

    if (existingDriverRoute) {
      showToast(`El repartidor ya tiene la ruta "${existingDriverRoute.name}" activa. Solo puede tener una ruta a la vez.`, 'error');
      return;
    }

    setIsSavingRoute(true);
    try {
      if (editingRouteId) {
        await updateDoc(doc(db, 'routes', editingRouteId), {
          ...newRouteData,
          updatedAt: serverTimestamp()
        });
        showToast('Ruta actualizada con éxito', 'success');
      } else {
        await addDoc(collection(db, 'routes'), {
          ...newRouteData,
          status: 'active',
          orderIds: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        showToast('Ruta creada con éxito', 'success');
      }
      setShowRouteModal(false);
      setEditingRouteId(null);
      setNewRouteData({ name: '', unitNumber: '', driverId: '' });
    } catch (error) {
      handleFirestoreError(error, editingRouteId ? OperationType.UPDATE : OperationType.CREATE, editingRouteId ? `routes/${editingRouteId}` : 'routes');
    } finally {
      setIsSavingRoute(false);
    }
  };

  const deleteRoute = async (routeId: string) => {
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    // Check if any order in this route is already onboarded
    const routeOrders = orders.filter(o => route.orderIds.includes(o.id));
    const isAnyOnboarded = routeOrders.some(o => o.onboarded);

    if (isAnyOnboarded) {
      showToast('No se puede eliminar una ruta que ya tiene pedidos cargados a la unidad.', 'error');
      return;
    }

    if (!window.confirm('¿Estás seguro de que deseas eliminar esta ruta? Los pedidos asignados quedarán sin ruta y el cargador deberá confirmarlos nuevamente si los asignas a otra ruta.')) {
      return;
    }

    try {
      // Clean up orders first
      for (const orderId of route.orderIds) {
        await updateDoc(doc(db, 'orders', orderId), {
          routeId: deleteField(),
          driverId: deleteField(),
          onboarded: false
        });
      }

      // Delete the route
      await deleteDoc(doc(db, 'routes', routeId));
      showToast('Ruta eliminada con éxito', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `routes/${routeId}`);
    }
  };

  const releaseRouteToPrep = async (routeId: string) => {
    try {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;

      const routeOrders = orders.filter(o => route.orderIds.includes(o.id) && o.status === 'accepted');
      if (routeOrders.length === 0) {
        showToast('No hay pedidos aceptados en esta ruta para enviar a preparación', 'info');
        return;
      }

      // Update Route
      await updateDoc(doc(db, 'routes', routeId), {
        releasedToPrep: true,
        updatedAt: serverTimestamp()
      });

      // Update all orders in route to processing
      for (const order of routeOrders) {
        await updateDoc(doc(db, 'orders', order.id), {
          status: 'processing',
          dispatchedAt: serverTimestamp()
        });

        // Reserve stock (only if not already reserved)
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            await updateDoc(doc(db, 'products', product.id), {
              reserved: (product.reserved || 0) + item.quantity
            });
          }
        }
      }
      
      showToast(`${routeOrders.length} pedidos enviados a preparación en la ruta ${route.name}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${routeId}`);
    }
  };

  const addOrderToRoute = async (orderId: string, routeId: string) => {
    try {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;

      // Check if order already in another route and remove it
      const existingRoute = routes.find(r => r.orderIds.includes(orderId));
      if (existingRoute && existingRoute.id !== routeId) {
        await updateDoc(doc(db, 'routes', existingRoute.id), {
          orderIds: existingRoute.orderIds.filter(id => id !== orderId)
        });
      }

      // Update Order
      const order = orders.find(o => o.id === orderId);
      const orderUpdates: any = { 
        routeId: routeId,
        driverId: route.driverId,
        onboarded: false
      };

      // If route is already released to prep, and order is accepted, move it to processing
      if (route.releasedToPrep && order && order.status === 'accepted') {
        orderUpdates.status = 'processing';
        
        // Reserve stock
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            await updateDoc(doc(db, 'products', product.id), {
              reserved: (product.reserved || 0) + item.quantity
            });
          }
        }
      }

      await updateDoc(doc(db, 'orders', orderId), orderUpdates);

      // Update Route
      if (!route.orderIds.includes(orderId)) {
        await updateDoc(doc(db, 'routes', routeId), {
          orderIds: [...route.orderIds, orderId],
          updatedAt: serverTimestamp()
        });
      }
      showToast('Pedido agregado a la ruta', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const removeOrderFromRoute = async (orderId: string, routeId: string) => {
    try {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;

      // Update Order
      await updateDoc(doc(db, 'orders', orderId), { 
        routeId: deleteField(),
        driverId: deleteField(),
        onboarded: false
      });

      // Update Route
      await updateDoc(doc(db, 'routes', routeId), {
        orderIds: route.orderIds.filter(id => id !== orderId),
        updatedAt: serverTimestamp()
      });
      showToast('Pedido removido de la ruta', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const acceptOrder = async (order: Order) => {
    try {
      let nextStatus: Order['status'] = 'accepted';
      const route = order.routeId ? routes.find(r => r.id === order.routeId) : null;
      
      // If it's a pickup order, it goes directly to processing (preparation)
      // Or if it's already in a route that was released
      if (order.type === 'pickup' || route?.releasedToPrep) {
        nextStatus = 'processing';
        // Reserve stock
        for (const item of order.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            await updateDoc(doc(db, 'products', product.id), {
              reserved: (product.reserved || 0) + item.quantity
            });
          }
        }
      }

      await updateDoc(doc(db, 'orders', order.id), { 
        status: nextStatus,
        dispatchedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pedido Aceptado',
        message: nextStatus === 'processing' 
          ? `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido aceptado y está en preparación.`
          : `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido aceptado y está pendiente de asignación a ruta.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });
      showToast(nextStatus === 'processing' ? 'Pedido aceptado y enviado a preparación' : 'Pedido aceptado', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const rawPendingOrders = [...pendingOrders, ...acceptedOrders];
  const displayedOrders = initialTab === 'pending' ? sortOrdersByWindowAndDistance(rawPendingOrders) : historyOrders;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 border-l-4 border-red-600 pl-4">
            {initialTab === 'pending' ? 'Despacho de Pedidos' : 'Historial de Despachos'}
          </h2>
          {initialTab === 'pending' && (
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setActiveSubTab('orders')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeSubTab === 'orders' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Pedidos
              </button>
              <button 
                onClick={() => setActiveSubTab('routes')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeSubTab === 'routes' ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Rutas
              </button>
            </div>
          )}
        </div>
      </div>

      {initialTab === 'pending' && activeSubTab === 'routes' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-700">Rutas de Entrega Activas</h3>
            <Button onClick={() => setShowRouteModal(true)} className="text-xs h-9 flex items-center justify-center">
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva Ruta
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {routes.filter(r => r.status === 'active').length === 0 ? (
              <div className="lg:col-span-2 text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No hay rutas activas</p>
              </div>
            ) : (
              routes.filter(r => r.status === 'active').map(route => {
                const routeOrders = orders.filter(o => route.orderIds.includes(o.id));
                const driver = users.find(u => u.uid === route.driverId);
                return (
                  <div key={route.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <Truck className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-900">{route.name}</h4>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => {
                                  setEditingRouteId(route.id);
                                  setNewRouteData({ name: route.name, unitNumber: route.unitNumber, driverId: route.driverId });
                                  setShowRouteModal(true);
                                }}
                                className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => deleteRoute(route.id)}
                                className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-500">Unidad: {route.unitNumber} • Driver: {driver?.name || 'Desconocido'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase">Activa</span>
                    </div>
                    <div className="p-4 flex-1 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Pedidos en esta ruta ({routeOrders.length})</p>
                      </div>
                      {routeOrders.length === 0 ? (
                        <p className="text-xs text-gray-400 italic text-center py-4">Sin pedidos asignados</p>
                      ) : (
                        <div className="space-y-2">
                          {routeOrders.map(order => (
                            <div key={order.id} className="flex justify-between items-center p-2 bg-white rounded-xl border border-gray-100 text-xs shadow-sm">
                              <div className="flex items-center gap-2">
                                <Package className="w-3.5 h-3.5 text-gray-400" />
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-gray-700">#{order.id.slice(-6).toUpperCase()}</span>
                                    {order.onboarded && (
                                      <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded font-bold uppercase">Cargado</span>
                                    )}
                                    {getTimingStatus(order) && (
                                      <span className={cn(
                                        "text-[7px] px-1 rounded font-black uppercase tracking-tighter",
                                        getTimingStatus(order)?.color === 'red' ? "bg-red-500 text-white" : 
                                        getTimingStatus(order)?.color === 'amber' ? "bg-amber-400 text-amber-900" : 
                                        "bg-emerald-500 text-white"
                                      )}>
                                        {getTimingStatus(order)?.label}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500">{order.userName}</span>
                                    <span className="text-[8px] text-gray-400 opacity-70">• {
                                      order.status === 'pending' ? 'Pendiente' : 
                                      order.status === 'accepted' ? 'Aceptado' : 
                                      order.status === 'processing' ? 'Prep' : 'Listo'
                                    }</span>
                                  </div>
                                  {order.deliveryWindowStart && order.deliveryWindowEnd && (
                                    <div className="flex items-center gap-1 text-[8px] text-blue-600 font-bold mt-0.5">
                                      <Calendar className="w-2.5 h-2.5" />
                                      <span>{order.deliverySlot?.split(' ')[0]} ({order.deliveryWindowStart} - {order.deliveryWindowEnd})</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {!order.onboarded && (
                                <button 
                                  onClick={() => removeOrderFromRoute(order.id, route.id)}
                                  className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-2 ml-1">Agregar Pedido a Ruta</p>
                        <select 
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all font-medium appearance-none"
                          onChange={(e) => {
                            if (e.target.value) {
                              addOrderToRoute(e.target.value, route.id);
                              e.target.value = "";
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Seleccionar pedido...</option>
                          {orders
                            .filter(o => ['pending', 'accepted', 'processing', 'ready'].includes(o.status) && (!o.routeId || !o.onboarded) && o.type !== 'pickup')
                            .map(o => (
                              <option key={o.id} value={o.id} disabled={o.routeId === route.id}>
                                #{o.id.slice(-6).toUpperCase()} - {o.userName} ({
                                  o.status === 'pending' ? 'P' : 
                                  o.status === 'accepted' ? 'A' : 
                                  o.status === 'processing' ? 'Prep' : 'L'
                                }) {o.routeId && o.routeId !== route.id ? ' (REASIGNAR)' : ''}
                              </option>
                            ))
                          }
                        </select>
                      </div>
                      
                      {!route.releasedToPrep && routeOrders.length > 0 && (
                        <Button 
                          className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-xs font-bold shadow-md shadow-blue-100" 
                          onClick={() => releaseRouteToPrep(route.id)}
                        >
                          Lanzar a Preparación
                        </Button>
                      )}
                      {route.releasedToPrep && (
                        <div className="flex items-center justify-center gap-2 p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase">Lanzada a Preparación</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {initialTab === 'pending' && displayedOrders.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 text-[11px] text-blue-900 font-semibold shadow-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Orden prioritario: <strong>Ventana de entrega más próxima</strong> y <strong>menor distancia</strong></span>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
                {displayedOrders.length} pedidos
              </span>
            </div>
          )}
          {displayedOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay pedidos {initialTab === 'pending' ? 'pendientes' : 'en el historial'}</p>
            </div>
          ) : (
            displayedOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-4">
                <div className="flex justify-between items-start gap-2">
                  <div onClick={() => toggleExpand(order.id)} className="cursor-pointer flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <h4 className="font-bold text-gray-900 text-sm">#{order.id.slice(-6).toUpperCase()}</h4>
                      
                      {/* Delivery Mode Badge - Single & Unambiguous */}
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1 shrink-0",
                        order.type === 'pickup' 
                          ? "bg-blue-100 text-blue-700 border border-blue-200" 
                          : "bg-orange-100 text-orange-700 border border-orange-200"
                      )}>
                        {order.type === 'pickup' ? <Store className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                        {order.type === 'pickup' ? 'Recoger en Tienda' : 'A Domicilio'}
                      </span>

                      {/* Status Badge */}
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0",
                        order.status === 'pending' ? "bg-amber-100 text-amber-800 border border-amber-200" : 
                        order.status === 'accepted' ? "bg-purple-100 text-purple-700 border border-purple-200" :
                        order.status === 'processing' ? "bg-blue-100 text-blue-700 border border-blue-200" :
                        order.status === 'ready' ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                        "bg-green-100 text-green-700"
                      )}>
                        {order.status === 'pending' ? 'Pendiente' : 
                         order.status === 'accepted' ? 'Aceptado' : 
                         order.status === 'processing' ? 'En Prep' : 
                         order.status === 'ready' ? 'Listo' : order.status}
                      </span>

                      {getTimingStatus(order) && (
                        <div className={cn(
                          "flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter shrink-0",
                          getTimingStatus(order)?.color === 'red' ? "bg-red-100 text-red-600 border border-red-200" : 
                          getTimingStatus(order)?.color === 'amber' ? "bg-amber-100 text-amber-600 border border-amber-200" : 
                          "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        )}>
                          <Clock className="w-2.5 h-2.5" />
                          {getTimingStatus(order)?.label}
                        </div>
                      )}

                      {order.routeId && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                          Ruta: {routes.find(r => r.id === order.routeId)?.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-medium">{order.userName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-[10px] text-gray-400 font-medium">
                        {order.items.length} productos • ${order.total.toFixed(2)}
                        {order.deliveryDistance && ` • ${order.deliveryDistance.toFixed(1)} km`}
                      </p>
                      {order.deliveryWindowStart && order.deliveryWindowEnd && (
                        <div className="flex items-center gap-1 text-[9px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          <Calendar className="w-2.5 h-2.5" />
                          <span>{order.deliverySlot?.split(' ')[0]} ({order.deliveryWindowStart} - {order.deliveryWindowEnd})</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {initialTab === 'pending' && order.status === 'pending' && (
                      <Button 
                        className="text-xs py-1.5 px-3.5 h-9 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-sm flex items-center gap-1.5 shrink-0" 
                        onClick={(e) => {
                          e.stopPropagation();
                          acceptOrder(order);
                        }}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Aceptar
                      </Button>
                    )}
                    <button 
                      onClick={() => toggleExpand(order.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                    >
                      {expandedOrders[order.id] ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </button>
                  </div>
                </div>

                {/* Quick Info Bar */}
                <div className="flex flex-wrap gap-4 p-2 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
                    {order.paymentMethod === 'card' ? <CreditCard className="w-3.5 h-3.5 text-blue-500" /> : <Banknote className="w-3.5 h-3.5 text-green-500" />}
                    <span>{order.paymentMethod === 'card' ? 'Tarjeta' : 'Efectivo'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium border-l border-gray-200 pl-4">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      order.paymentStatus === 'paid' ? "bg-green-500" : "bg-orange-500"
                    )} />
                    <span>{order.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}</span>
                  </div>
                  {order.routeId && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium border-l border-gray-200 pl-4">
                      <Truck className="w-3.5 h-3.5 text-purple-500" />
                      <span>{routes.find(r => r.id === order.routeId)?.name || 'Ruta'} (Unidad {routes.find(r => r.id === order.routeId)?.unitNumber})</span>
                    </div>
                  )}
                </div>

                {expandedOrders[order.id] && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 pt-2 border-t border-gray-50"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tiempos</p>
                        <div className="flex flex-col gap-1">
                          <p className="text-[10px] text-gray-600">Creado: {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'N/A'}</p>
                          {order.dispatchedAt && (
                            <p className="text-[10px] text-blue-600 font-bold">Despachado: {order.dispatchedAt.toDate().toLocaleString()}</p>
                          )}
                          {order.preparedAt && (
                            <p className="text-[10px] text-green-600">Preparado: {order.preparedAt.toDate().toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contacto</p>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-900 font-medium">{order.userPhone || 'Sin teléfono'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3 text-gray-400" />
                          <p className="text-[10px] text-gray-500 truncate">{order.userEmail}</p>
                        </div>
                      </div>
                    </div>

                    {order.type === 'delivery' && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Dirección de Entrega</p>
                        <div className="flex items-start gap-2 p-2 bg-orange-50 rounded-lg border border-orange-100">
                          <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-700 leading-relaxed font-medium">{order.address}</p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Detalle de Productos</p>
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
                        {order.items.map((item, i) => {
                          const product = products.find(p => p.id === item.productId);
                          const available = product ? product.stock - product.reserved : 0;
                          const isLowStock = available < item.quantity;
                          
                          return (
                            <div key={i} className="flex justify-between items-center">
                              <span className="text-xs text-gray-600 font-medium truncate pr-4">
                                {item.quantity}x {item.name}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  isLowStock ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                )}>
                                  Disp: {available} pzas
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {order.type === 'delivery' && (order.status === 'accepted' || order.status === 'processing' || order.status === 'ready') && initialTab === 'pending' && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1">Asignar a Ruta</p>
                        <div className="flex gap-2">
                          <select 
                            className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all font-medium"
                            onChange={(e) => {
                              if (e.target.value) {
                                addOrderToRoute(order.id, e.target.value);
                              } else {
                                // Manual "Sin ruta" removal
                                const currentRoute = routes.find(r => r.orderIds.includes(order.id));
                                if (currentRoute) removeOrderFromRoute(order.id, currentRoute.id);
                              }
                            }}
                            value={order.routeId || ""}
                          >
                            <option value="">-- Sin ruta asignada --</option>
                            {routes.filter(r => r.status === 'active').map(r => (
                              <option key={r.id} value={r.id}>{r.name} ({r.unitNumber})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* New Route Modal */}
      <AnimatePresence>
        {showRouteModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-600 rounded-xl">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{editingRouteId ? 'Editar Ruta' : 'Nueva Ruta'}</h3>
                </div>
                <button onClick={() => {
                  setShowRouteModal(false);
                  setEditingRouteId(null);
                  setNewRouteData({ name: '', unitNumber: '', driverId: '' });
                }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 ml-1">Nombre de la Ruta</label>
                  <input 
                    type="text"
                    placeholder="Ej. Ruta Norte, Ruta Centro..."
                    value={newRouteData.name}
                    onChange={(e) => setNewRouteData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-gray-50 border-gray-100 border rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:bg-white transition-all outline-none font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 ml-1">Número de Unidad</label>
                  <input 
                    type="text"
                    placeholder="Ej. Unidad 10, Van 04..."
                    value={newRouteData.unitNumber}
                    onChange={(e) => setNewRouteData(prev => ({ ...prev, unitNumber: e.target.value }))}
                    className="w-full bg-gray-50 border-gray-100 border rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:bg-white transition-all outline-none font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 ml-1">Asignar Chófer</label>
                  <select 
                    value={newRouteData.driverId}
                    onChange={(e) => setNewRouteData(prev => ({ ...prev, driverId: e.target.value }))}
                    className="w-full bg-gray-50 border-gray-100 border rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:bg-white transition-all outline-none font-medium appearance-none"
                  >
                    <option value="">Seleccionar chófer...</option>
                    {drivers.map(d => (
                      <option key={d.uid} value={d.uid}>{d.name} ({d.email})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => {
                  setShowRouteModal(false);
                  setEditingRouteId(null);
                  setNewRouteData({ name: '', unitNumber: '', driverId: '' });
                }}>Cancelar</Button>
                <Button className="flex-1 h-12 rounded-2xl bg-red-600 hover:bg-red-700 font-bold" onClick={saveRoute} disabled={isSavingRoute}>
                  {isSavingRoute ? 'Guardando...' : (editingRouteId ? 'Guardar Cambios' : 'Crear Ruta')}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StoreTicketView({ order, onDone }: { order: Order, onDone: () => void }) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadTicket = async () => {
    if (!ticketRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Add a style block to force standard colors and avoid oklch
          const styleOverride = clonedDoc.createElement('style');
          styleOverride.innerHTML = `
            * {
              -webkit-print-color-adjust: exact;
            }
            #thermal-ticket-content, #thermal-ticket-content * {
              color: #000000 !important;
              background-color: #ffffff !important;
              border-color: #000000 !important;
              box-shadow: none !important;
              text-shadow: none !important;
            }
            .thermal-bold {
              font-weight: 900 !important;
            }
          `;
          clonedDoc.head.appendChild(styleOverride);

          // Remove all buttons in the clone
          clonedDoc.querySelectorAll('button').forEach(btn => btn.remove());
            
          // Aggressively replace colors that might use oklch
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach(el => {
            const htmlEl = el as HTMLElement;
            
            // Check inline styles
            const inlineStyle = htmlEl.getAttribute('style') || '';
            if (inlineStyle.includes('oklch')) {
              if (htmlEl.style.color.includes('oklch')) htmlEl.style.color = '#000000';
              if (htmlEl.style.backgroundColor.includes('oklch')) htmlEl.style.backgroundColor = '#ffffff';
              if (htmlEl.style.borderColor.includes('oklch')) htmlEl.style.borderColor = '#000000';
            }

            // Force computed styles to safe values if they use oklch
            try {
              const style = window.getComputedStyle(htmlEl);
              if (style.color.includes('oklch')) htmlEl.style.setProperty('color', '#000000', 'important');
              if (style.backgroundColor.includes('oklch')) htmlEl.style.setProperty('background-color', '#ffffff', 'important');
              if (style.borderColor.includes('oklch')) htmlEl.style.setProperty('border-color', '#000000', 'important');
            } catch (e) {}
          });
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 160]
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`TICKET-${order.id.slice(-6).toUpperCase()}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF térmico:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto space-y-6 pb-20"
    >
      <div 
        ref={ticketRef} 
        id="thermal-ticket-content"
        className="mx-auto w-[300px] bg-white p-4 border border-gray-100 shadow-sm font-mono text-black"
        style={{ color: '#000000', backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
      >
        <div className="text-center space-y-1 mb-4 border-b border-black pb-4">
          <h1 className="text-xl font-black uppercase tracking-tighter thermal-bold">DIBAPASA</h1>
          <p className="text-[10px] leading-tight font-bold">Distribuidora de básicos del pacifico</p>
          <p className="text-[9px]">Calle toma de torreón 2220</p>
          <p className="text-[9px]">Col. Francisco Villa, C.P. 82127</p>
        </div>

        <div className="space-y-1 mb-4 text-[11px]">
          <div className="flex justify-between">
            <span className="font-bold">ORDEN:</span>
            <span>#{order.id.slice(-6).toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">FECHA:</span>
            <span>{new Date().toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">CLIENTE:</span>
            <span className="uppercase">{order.userName}</span>
          </div>
        </div>

        <div className="border-t border-b border-black border-dashed py-2 mb-4">
          <div className="grid grid-cols-[1fr_2fr_1fr] text-[10px] font-bold mb-1 border-b border-black pb-1">
            <span>CANT</span>
            <span>PRODUCTO</span>
            <span className="text-right">TOTAL</span>
          </div>
          <div className="space-y-1 pt-1">
            {order.items.map((item, i) => {
              const itemTotal = item.unit === 'Kg' 
                ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                : (item.price * item.quantity);
              
              return (
                <div key={i} className="grid grid-cols-[1fr_2fr_1fr] text-[10px] leading-tight items-start">
                  <span>{item.quantity}{item.unit === 'Kg' ? 'kg' : 'pz'}</span>
                  <div className="flex flex-col">
                    <span className="font-bold uppercase">{item.name}</span>
                    {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight) && (
                      <span className="text-[8px] italic">Surtido: {item.loaderWeight || item.preparerWeight}kg</span>
                    )}
                  </div>
                  <span className="text-right">${itemTotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1 mb-6">
          <div className="flex justify-between text-[11px]">
            <span>SUBTOTAL</span>
            <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-black border-t border-black pt-1 thermal-bold">
            <span>TOTAL</span>
            <span>${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[9px] pt-1">
            <span>METODO PAGO:</span>
            <span className="uppercase font-bold">{order.paymentMethod === 'cash' ? 'EFECTIVO' : 'TARJETA'}</span>
          </div>
        </div>

        <div className="text-center pt-2 space-y-1 border-t border-dashed border-black mt-2">
          <div className="py-1 flex items-center justify-center border border-black text-[10px] font-bold uppercase mb-1 mt-2">
            PAGADO - GRACIAS
          </div>
          <p className="text-[8px] italic text-gray-400">Este no es un comprobante fiscal</p>
        </div>
      </div>



      <div className="space-y-3 px-4">
        <Button 
          onClick={downloadTicket}
          disabled={isDownloading}
          className="w-full h-14 bg-black hover:bg-zinc-800 text-white rounded-2xl font-bold flex items-center justify-center gap-2"
        >
          {isDownloading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Download className="w-5 h-5" />
              Descargar Ticket PDF (80mm)
            </>
          )}
        </Button>
        
        <Button 
          variant="outline"
          className="w-full h-14 rounded-2xl bg-gray-50 border-none font-bold text-gray-600"
          onClick={onDone}
        >
          Finalizar y Volver
        </Button>
      </div>

      <div className="text-center">
        <p className="text-xs text-gray-400">Gracias por su compra en Dibapasa</p>
      </div>
    </motion.div>
  );
}

function StoreSalesView({ 
  orders, 
  onBack,
  onNewOrderClick,
  showToast
}: { 
  orders: Order[], 
  onBack: () => void,
  onNewOrderClick: () => void,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [activeTab, setActiveTab] = useState<'pedidos' | 'historial'>('pedidos');
  const [searchTerm, setSearchTerm] = useState('');
  
  const pendingPaymentOrders = orders.filter(o => o.type === 'pickup' && o.status !== 'delivered' && o.status !== 'cancelled' && o.paymentStatus === 'pending');
  const readyToDeliverOrders = orders.filter(o => o.type === 'pickup' && o.status === 'ready' && o.paymentStatus === 'paid');
  
  const completedStoreSales = orders.filter(o => 
    (o.status === 'delivered' || o.status === 'completed') && 
    (o.type === 'pickup' || o.id.startsWith('STORE-'))
  ).sort((a, b) => {
    const dateA = a.deliveredAt || a.paidAt || a.createdAt;
    const dateB = b.deliveredAt || b.paidAt || b.createdAt;
    // @ts-ignore
    return (dateB?.seconds || 0) - (dateA?.seconds || 0);
  });

  const filteredHistory = completedStoreSales.filter(o => 
    o.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isViewingTicket, setIsViewingTicket] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const confirmPayment = async (order: Order) => {
    setIsProcessingPayment(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        paymentStatus: 'paid',
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Update local state immediately for a snappier UI transition
      setSelectedOrder({
        ...order,
        paymentStatus: 'paid'
      });

      // Notify client that they can now see their code
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pago Confirmado',
        message: `Tu pago para el pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido confirmado. Ya puedes ver tu código de entrega en la app.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      showToast("Pago confirmado correctamente. Ya puedes introducir el código del cliente.", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Focus the code input when it becomes available
  useEffect(() => {
    if (selectedOrder?.paymentStatus === 'paid' && !isProcessingPayment) {
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 100);
    }
  }, [selectedOrder?.paymentStatus, isProcessingPayment]);

  const deliverOrder = async (order: Order) => {
    // Only check code if provided, otherwise allow (as per user request for staff convenience)
    if (verificationCode && verificationCode.toUpperCase() !== order.pickupCode.toUpperCase()) {
      showToast("Código de verificación incorrecto", 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'delivered',
        deliveredAt: serverTimestamp()
      });
      setSelectedOrder(null);
      setVerificationCode('');
      showToast("Pedido entregado correctamente", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  if (isViewingTicket && selectedOrder) {
    return <StoreTicketView order={selectedOrder} onDone={() => { setIsViewingTicket(false); setSelectedOrder(null); }} />;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Ventas en Tienda</h2>
          <Button 
            onClick={onNewOrderClick}
            className="bg-gray-900 hover:bg-black text-white h-10 px-4 rounded-xl flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Venta</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        </div>

        <div className="flex p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setActiveTab('pedidos')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              activeTab === 'pedidos' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            Pedidos App
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={cn(
              "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
              activeTab === 'historial' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            Historial de Ventas
          </button>
        </div>
      </div>

      {activeTab === 'pedidos' ? (
        <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-orange-500 uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Pendientes de Pago en Tienda
          </h3>
          {pendingPaymentOrders.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <p className="text-xs text-gray-400">No hay pagos pendientes</p>
            </div>
          ) : (
            pendingPaymentOrders.map(order => (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrder(order)}
                className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm space-y-3 cursor-pointer hover:border-orange-300 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                    <p className="text-xs text-gray-500">{order.userName}</p>
                    <div className="mt-1">
                      {order.status === 'ready' ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold uppercase tracking-wider">
                          Listo para Entrega
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold uppercase tracking-wider italic">
                          En Preparación...
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-orange-100 text-orange-700">
                    Cobrar ${(order.adjustedTotal ?? order.total).toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4" />
            Listos para Entrega
          </h3>
          {readyToDeliverOrders.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <p className="text-xs text-gray-400">No hay pedidos listos para entregar</p>
            </div>
          ) : (
            readyToDeliverOrders.map(order => (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrder(order)}
                className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm space-y-3 cursor-pointer hover:border-emerald-300 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                    <p className="text-xs text-gray-500">{order.userName}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-100 text-emerald-700">
                    Entregar (Pagado)
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Buscar por cliente o folio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-gray-200"
            />
          </div>

          <div className="space-y-3">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-100">
                <p className="text-sm text-gray-400">No se encontraron ventas finalizadas</p>
              </div>
            ) : (
              filteredHistory.map(order => (
                <div 
                  key={order.id}
                  onClick={() => {
                    setSelectedOrder(order);
                    setIsViewingTicket(true);
                  }}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2 cursor-pointer hover:border-gray-300 transition-all active:scale-[0.98]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</span>
                        {order.id.startsWith('STORE-') && (
                          <span className="text-[8px] bg-gray-900 text-white px-1 rounded">MOSTRADOR</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{order.userName}</p>
                    </div>
                    <span className="text-sm font-black text-gray-900">${(order.adjustedTotal ?? order.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                    <span className="text-[10px] text-gray-400">
                      {order.deliveredAt ? new Date((order.deliveredAt as any).toDate()).toLocaleString() : 
                       order.paidAt ? new Date((order.paidAt as any).toDate()).toLocaleString() : 
                       new Date((order.createdAt as any).toDate()).toLocaleString()}
                    </span>
                    <Button variant="ghost" className="h-6 px-2 text-[10px] font-bold text-gray-500 hover:text-gray-900">
                      Ver Ticket
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Recogida: #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <button onClick={() => { setSelectedOrder(null); setVerificationCode(''); }} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase">Cliente</p>
                  <p className="font-bold text-gray-900">{selectedOrder.userName}</p>
                  <p className="text-sm text-gray-500">{selectedOrder.userEmail}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="bg-white border border-gray-100 rounded-xl p-3">
                    {selectedOrder.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0">
                        <span>
                          {item.quantity}x {item.name}
                          {item.unit === 'Kg' && (item.loaderWeight || item.preparerWeight || item.approxWeight) && (
                            <span className="text-[10px] text-gray-400 block italic">
                              ({item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)} Kg)
                            </span>
                          )}
                        </span>
                        <span className="font-bold text-gray-700">
                          ${(item.unit === 'Kg' 
                            ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                            : (item.price * item.quantity)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 space-y-4">
                  {selectedOrder.paymentStatus === 'pending' ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex flex-col items-center gap-2 text-center">
                        <CreditCard className="w-8 h-8 text-orange-500" />
                        <div>
                          <p className="text-orange-900 font-bold">Cobro Pendiente</p>
                          <p className="text-sm text-orange-700 font-medium">
                            {selectedOrder.weightValidated ? 'Peso Validado' : 'Peso Aproximado (Pendiente Pesaje)'}
                          </p>
                          <p className="text-sm text-orange-700">Total a cobrar: <span className="text-lg font-black">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</span></p>
                        </div>
                      </div>
                      <Button 
                        className="w-full h-12 bg-[#0056b3] hover:bg-blue-900" 
                        onClick={() => confirmPayment(selectedOrder)}
                        disabled={isProcessingPayment}
                      >
                        {isProcessingPayment ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Confirmar Pago Recibido"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        <p className="text-sm font-bold text-emerald-900 uppercase">Pago Confirmado</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-1">Código de Verificación (Opcional para Staff)</label>
                        <Input 
                          ref={codeInputRef}
                          placeholder="Código del cliente (si está disponible)"
                          value={verificationCode}
                          onChange={(e: any) => setVerificationCode(e.target.value)}
                          className="text-center font-black tracking-widest text-lg border-emerald-100 focus:border-emerald-300"
                        />
                      </div>
                      <Button 
                        className="w-full h-12 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100" 
                        onClick={() => deliverOrder(selectedOrder)}
                      >
                        Confirmar Entrega en Tienda
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PreparerView({ 
  orders, 
  routes,
  products, 
  onBack, 
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[], 
  routes: DeliveryRoute[],
  products: Product[], 
  onBack: () => void, 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  initialTab?: 'pending' | 'history'
}) {
  // Only show orders that are processing AND if they belong to a route, the route must be releasedToPrep
  const assignedOrders = orders.filter(o => {
    if (o.status !== 'processing') return false;
    if (o.routeId) {
      const route = routes.find(r => r.id === o.routeId);
      return route?.releasedToPrep === true;
    }
    return true; // Orders without a route (pickup) show up immediately when processing
  });
  const historyOrders = orders.filter(o => ['ready', 'shipped', 'delivered'].includes(o.status)).slice(0, 50);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [itemWeights, setItemWeights] = useState<Record<string, string>>({});

  const toggleItem = (itemName: string) => {
    setCheckedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }));
  };

  const markAsReady = async (order: Order) => {
    // Check if all Kg items have weights
    const kgItemsWithoutWeight = order.items.filter(item => item.unit === 'Kg' && !itemWeights[item.productId]);
    if (kgItemsWithoutWeight.length > 0) {
      showToast("Por favor ingresa el peso para todos los productos vendidos por kilo", 'error');
      return;
    }

    try {
      // Update order status and item weights
      const updatedItems = order.items.map(item => ({
        ...item,
        ...(item.unit === 'Kg' ? { preparerWeight: parseFloat(itemWeights[item.productId]) || 0 } : {})
      }));

      // Calculate adjusted total
      const newSubtotal = updatedItems.reduce((sum, item) => {
        if (item.unit === 'Kg') {
          return sum + ((item.preparerWeight || 0) * item.price);
        }
        return sum + (item.quantity * item.price);
      }, 0);
      
      const newTotal = newSubtotal + (order.deliveryFee || 0);

      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'ready',
        preparedAt: serverTimestamp(),
        items: updatedItems,
        adjustedTotal: newTotal,
        weightValidated: true
      });
      
      // Update stock and reserved for each product
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await updateDoc(doc(db, 'products', product.id), {
            stock: Math.max(0, product.stock - item.quantity),
            reserved: Math.max(0, product.reserved - item.quantity)
          });
        }
      }

      // Notify client
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: order.type === 'pickup' ? 'Pedido Listo para Recoger' : 'Pedido Preparado',
        message: order.type === 'pickup' 
          ? (order.paymentStatus === 'paid' 
             ? `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} está listo. Ven a recogerlo con el código: ${order.pickupCode || 'S/C'}`
             : `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} está listo. Ven a sucursal a realizar tu pago en caja para recibirlo.`)
          : `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido preparado y pronto será enviado.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      setSelectedOrder(null);
      setCheckedItems({});
      showToast('Pedido marcado como listo', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const allChecked = selectedOrder?.items.every(item => checkedItems[item.name]);
  const displayedOrders = initialTab === 'pending' ? sortOrdersByWindowAndDistance(assignedOrders) : historyOrders;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900">
          {initialTab === 'pending' ? 'Preparación de Pedidos' : 'Historial de Preparación'}
        </h2>
      </div>

      <div className="space-y-8">
        {displayedOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay pedidos {initialTab === 'pending' ? 'para preparar' : 'en el historial'}</p>
          </div>
        ) : (
          Object.entries(
            displayedOrders.reduce((acc, order) => {
              const routeId = order.routeId || 'no-route';
              if (!acc[routeId]) acc[routeId] = [];
              acc[routeId].push(order);
              return acc;
            }, {} as Record<string, Order[]>)
          ).map(([routeId, routeOrders]) => {
            const route = routes.find(r => r.id === routeId);
            return (
              <div key={routeId} className="space-y-3">
                <div className="flex items-center gap-2 ml-1">
                  <div className="p-1 px-2.5 bg-gray-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">
                    {route ? route.name : 'Sin Ruta (Pick up)'}
                  </div>
                  {route && <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Unidad: {route.unitNumber}</span>}
                </div>
                <div className="space-y-4">
                  {sortOrdersByWindowAndDistance(routeOrders).map(order => (
                    <div 
                      key={order.id} 
                      onClick={() => setSelectedOrder(order)}
                      className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2 cursor-pointer hover:border-blue-200 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                            order.status === 'processing' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                          )}>
                            {order.status === 'processing' ? 'En Preparación' : 'Listo'}
                          </span>
                          {order.preparedAt && initialTab === 'history' && (
                            <span className="text-[8px] text-gray-400">Preparado: {order.preparedAt.toDate().toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-xs text-gray-900 font-bold">{order.userName}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-500">{order.items.length} productos</span>
                            {order.deliveryDistance && (
                              <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                                {order.deliveryDistance.toFixed(1)} km
                              </span>
                            )}
                            {order.deliveryWindowStart && order.deliveryWindowEnd && (
                              <div className="flex items-center gap-1 text-[9px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                <Clock className="w-2.5 h-2.5 text-indigo-600" />
                                <span>{order.deliveryWindowStart} - {order.deliveryWindowEnd}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {initialTab === 'history' && (
                          <p className="text-[10px] text-gray-400 italic">#{order.id.slice(-6)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">
                  {initialTab === 'history' ? 'Detalle de Pedido' : 'Checklist'}: #{selectedOrder.id.slice(-6).toUpperCase()}
                </h3>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {initialTab === 'history' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-2xl space-y-3 border border-gray-100">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cliente</p>
                      <p className="font-bold text-gray-900">{selectedOrder.userName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dirección</p>
                      <p className="text-sm text-gray-600 font-medium">{selectedOrder.address}</p>
                    </div>
                    {selectedOrder.preparedAt && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preparado</p>
                        <p className="text-sm text-blue-600 font-bold">{selectedOrder.preparedAt.toDate().toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Resumen de Productos</p>
                    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                      {selectedOrder.items.map((item, i) => {
                        const product = products.find(p => p.id === item.productId);
                        const weight = item.preparerWeight || item.loaderWeight;
                        return (
                          <div key={i} className="p-4 border-b border-gray-50 last:border-0 flex justify-between items-center group bg-white hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3">
                              {product?.imageUrl ? (
                                <img src={product.imageUrl} className="w-10 h-10 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-sm" alt={item.name} referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
                                  <Package className="w-5 h-5 text-gray-300" />
                                </div>
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                {item.unit === 'Kg' ? (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-black">
                                      {weight ? `${weight.toFixed(2)} Kg` : `${item.quantity} Piezas`}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-medium">${item.price.toFixed(2)}/Kg</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400 font-medium">
                                    {item.quantity} und. x ${item.price.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-black text-gray-900">
                                ${(item.unit === 'Kg' 
                                  ? (item.price * (weight || 0)) 
                                  : (item.price * item.quantity)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-4 bg-gray-900 rounded-2xl space-y-2 shadow-lg shadow-gray-200">
                      <div className="flex justify-between items-center text-xs text-gray-400 font-bold uppercase tracking-widest">
                        <span>Estado</span>
                        <span className="text-white bg-green-500 rounded px-2 py-0.5">{selectedOrder.status.toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-gray-400 text-sm font-bold">TOTAL</span>
                        <span className="text-2xl font-black text-white">
                          ${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedOrder.items.map((item, i) => {
                    const product = products.find(p => p.id === item.productId);
                    return (
                      <div 
                        key={i} 
                        onClick={() => toggleItem(item.name)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer",
                          checkedItems[item.name] ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-100"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0",
                          checkedItems[item.name] ? "bg-green-500 border-green-500" : "border-gray-300"
                        )}>
                          {checkedItems[item.name] && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {product?.imageUrl ? (
                          <img src={product.imageUrl} className="w-10 h-10 rounded-lg object-cover bg-gray-50 flex-shrink-0 border border-gray-100 shadow-sm" alt={item.name} referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
                            <Package className="w-5 h-5 text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1">
                          <span className={cn(
                            "font-medium block",
                            checkedItems[item.name] ? "text-green-700 line-through" : "text-gray-700"
                          )}>
                            {item.quantity}x {item.name}
                          </span>
                          {item.unit === 'Kg' && (
                            <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[10px] font-bold text-gray-400 uppercase">PESO (KG):</span>
                              <input 
                                type="number" 
                                step="0.01"
                                placeholder="0.00"
                                value={itemWeights[item.productId] || ''}
                                onChange={(e) => setItemWeights(prev => ({ ...prev, [item.productId]: e.target.value }))}
                                className="w-20 px-2 py-1 text-xs border border-gray-200 rounded focus:border-blue-500 focus:outline-none"
                              />
                              {item.approxWeight && (
                                <span className="text-[9px] text-blue-500 font-medium">
                                  Ref: {(item.approxWeight * item.quantity).toFixed(2)} Kg
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {initialTab === 'pending' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                    <p className="text-[10px] font-bold text-orange-700 uppercase mb-1">Aviso de Preparación</p>
                    <p className="text-[11px] text-orange-600">Para productos por kilo, ingresa el peso exacto. El cargador validará este peso antes del envío.</p>
                  </div>
                  <Button 
                    className="w-full h-12" 
                    onClick={() => markAsReady(selectedOrder)}
                    disabled={!allChecked}
                  >
                    Marcar como Preparado
                  </Button>
                </div>
              ) : (
                <Button 
                  className="w-full h-12 bg-gray-100 text-gray-600 hover:bg-gray-200" 
                  onClick={() => setSelectedOrder(null)}
                >
                  Cerrar
                </Button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DriverView({ 
  orders, 
  routes,
  profile, 
  products, 
  onBack,
  onNewOrderClick,
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[], 
  routes: DeliveryRoute[],
  profile: UserProfile | null, 
  products: Product[], 
  onBack: () => void,
  onNewOrderClick: () => void,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  initialTab?: 'pending' | 'history'
}) {
  if (!profile) return null;
  
  const myRoutes = routes.filter(r => r.driverId === profile.uid);
  const activeRoutes = myRoutes.filter(r => {
    if (r.status === 'in_progress') return true;
    if (r.status === 'active') {
      const routeOrders = orders.filter(o => r.orderIds.includes(o.id));
      if (routeOrders.length === 0) return false;
      // Una ruta solo aparece para iniciar si TODOS su pedidos han sido cargados (onboarded)
      return routeOrders.every(o => o.onboarded === true);
    }
    return false;
  });
  const finishedRoutes = myRoutes.filter(r => r.status === 'completed');

  const readyOrders = orders.filter(o => {
    if (o.status !== 'shipped' || o.onboarded !== true) return false;
    const route = activeRoutes.find(r => r.id === o.routeId);
    return !!route;
  });

  const historyOrders = orders.filter(o => {
    if (o.status !== 'delivered') return false;
    const route = finishedRoutes.find(r => r.id === o.routeId) || activeRoutes.find(r => r.id === o.routeId);
    return !!route;
  }).slice(0, 50);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const selectedRoute = routes.find(r => r.id === selectedRouteId);

  const startRoute = async (route: DeliveryRoute) => {
    try {
      await updateDoc(doc(db, 'routes', route.id), { 
        status: 'in_progress',
        updatedAt: serverTimestamp()
      });
      showToast(`Ruta ${route.name} iniciada`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${route.id}`);
    }
  };

  const finishRoute = async (route: DeliveryRoute) => {
    const routeOrders = orders.filter(o => o.routeId === route.id);
    const pendingOrders = routeOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    
    if (pendingOrders.length > 0) {
      showToast(`No puedes finalizar la ruta. Aún hay ${pendingOrders.length} pedidos pendientes de entrega.`, 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'routes', route.id), { 
        status: 'completed',
        updatedAt: serverTimestamp()
      });
      setSelectedRouteId(null);
      showToast(`Ruta ${route.name} finalizada exitosamente`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `routes/${route.id}`);
    }
  };

  const notifyClient = async (order: Order) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pedido en Camino',
        message: `El repartidor está en camino a tu ubicación para entregar el pedido #${(order.id || '').slice(-6).toUpperCase()}.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });
      showToast(`Notificación enviada a ${order.userName || 'Cliente'}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notifications');
    }
  };

  const confirmArrival = async (order: Order) => {
    const route = routes.find(r => r.id === order.routeId);
    if (!route || route.status !== 'in_progress') {
      showToast("No puedes confirmar llegada si la ruta no ha sido iniciada.", 'error');
      return;
    }
    try {
      // Optimistic update
      setSelectedOrder({ ...order, arrivedAt: new Date() });
      
      await updateDoc(doc(db, 'orders', order.id), { 
        arrivedAt: serverTimestamp()
      });
      showToast("Llegada confirmada. El cliente ahora puede revisar su pedido.", 'success');
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Repartidor ha llegado',
        message: `Tu repartidor ha llegado. Por favor revisa tus productos. Si hay algún inconveniente, puedes solicitar una devolución ahora.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const confirmReview = async (order: Order) => {
    try {
      // Optimistic update
      setSelectedOrder({ ...order, reviewedAt: new Date() });
      
      await updateDoc(doc(db, 'orders', order.id), { 
        reviewedAt: serverTimestamp()
      });
      showToast("Mercancía confirmada como revisada.", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const collectPayment = async (order: Order) => {
    try {
      // Optimistic update
      setSelectedOrder({ ...order, paymentStatus: 'paid' });
      
      await updateDoc(doc(db, 'orders', order.id), { 
        paymentStatus: 'paid'
      });
      showToast("Pago registrado correctamente. El cliente ahora puede ver su código.", 'success');
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pago Confirmado',
        message: `Tu pago para el pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido registrado. Ya puedes entregar el código al repartidor.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const deliverOrder = async (order: Order) => {
    if (verificationCode.toUpperCase() !== order.pickupCode.toUpperCase()) {
      showToast("Código de verificación incorrecto", 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'delivered',
        deliveredAt: serverTimestamp()
      });
      setSelectedOrder(null);
      setVerificationCode('');
      showToast("Pedido entregado correctamente", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const rawFilteredOrders = (initialTab === 'pending' ? readyOrders : historyOrders).filter(o => 
    !selectedRouteId || o.routeId === selectedRouteId
  );
  const displayedOrders = initialTab === 'pending' ? sortOrdersByWindowAndDistance(rawFilteredOrders) : rawFilteredOrders;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <Truck className="w-6 h-6 text-red-600" />
            {initialTab === 'pending' ? 'Mis Rutas y Entregas' : 'Historial de Entregas'}
          </h2>
          {initialTab === 'pending' && (
            <button 
              onClick={onNewOrderClick}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-red-100 flex items-center gap-2 hover:bg-red-700 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-bold">Venta Ruta</span>
            </button>
          )}
        </div>

        {!selectedRouteId && initialTab === 'pending' && (
          <div className="space-y-3">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Rutas Asignadas</h3>
            {activeRoutes.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No tienes rutas asignadas actualmente</p>
              </div>
            ) : (
              activeRoutes.map(route => (
                <div key={route.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        route.status === 'in_progress' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                      )}>
                        <Navigation className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{route.name}</h4>
                        <p className="text-[10px] text-gray-500 font-bold uppercase">{route.unitNumber}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[8px] px-2 py-0.5 rounded-full font-black uppercase",
                      route.status === 'in_progress' ? "bg-green-600 text-white" : "bg-blue-600 text-white"
                    )}>
                      {route.status === 'in_progress' ? 'En Curso' : 'Preparada'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 text-xs h-9" 
                      variant={route.status === 'in_progress' ? 'outline' : 'default'}
                      onClick={() => setSelectedRouteId(route.id)}
                    >
                      Ver {route.orderIds?.length || 0} Pedidos
                    </Button>
                    {route.status === 'active' && (
                      <Button className="bg-green-600 hover:bg-green-700 text-xs h-9" onClick={() => startRoute(route)}>
                        Iniciar Ruta
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {selectedRouteId && (
          <div className="space-y-4">
            <div className="p-4 bg-white rounded-3xl text-gray-900 border border-gray-100 space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedRouteId(null)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-900">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h3 className="font-bold text-lg">{selectedRoute?.name}</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">{selectedRoute?.unitNumber}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className={cn(
                    "text-[8px] px-2 py-0.5 rounded-full font-black uppercase text-white",
                    selectedRoute?.status === 'in_progress' ? "bg-green-500" : "bg-blue-500"
                  )}>
                    {selectedRoute?.status === 'in_progress' ? 'En Curso' : 'Preparada'}
                  </span>
                </div>
              </div>

              {selectedRoute?.status === 'active' ? (
                <Button className="w-full bg-green-500 hover:bg-green-600 h-10 font-bold text-white" onClick={() => startRoute(selectedRoute)}>
                  INICIAR RUTA AHORA
                </Button>
              ) : selectedRoute?.status === 'in_progress' && (
                <Button variant="outline" className="w-full border-green-500 text-green-500 hover:bg-green-500/10 h-10 font-bold" onClick={() => finishRoute(selectedRoute)}>
                  FINALIZAR RUTA
                </Button>
              )}
            </div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Listado de Pedidos</h3>
          </div>
        )}

      </div>

      {(selectedRouteId || initialTab === 'history') && (
        <div className="space-y-4">
          {initialTab === 'pending' && displayedOrders.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 text-[11px] text-blue-900 font-semibold shadow-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Itinerario secuencial: <strong>Ventana de entrega</strong> y <strong>menor distancia</strong></span>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
                {displayedOrders.length} paradas
              </span>
            </div>
          )}
          {displayedOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay pedidos {initialTab === 'pending' ? 'para entregar en esta ruta' : 'en el historial'}</p>
            </div>
          ) : (
            displayedOrders.map((order, index) => (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrder(order)}
                className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3 cursor-pointer hover:border-blue-200 transition-colors relative"
              >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {initialTab === 'pending' && (
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-xs">
                      {index + 1}
                    </span>
                  )}
                  <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                    order.status === 'shipped' ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"
                  )}>
                    {order.status === 'shipped' ? 'En Ruta' : 'Entregado'}
                  </span>
                  {order.deliveredAt && order.status === 'delivered' && (
                    <span className="text-[8px] text-gray-400">Entregado: {order.deliveredAt.toDate().toLocaleTimeString()}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-gray-900 font-bold">{order.userName}</p>
                <div className="flex items-start gap-2 text-[10px] text-gray-500">
                  <MapPin className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                  <span className="truncate">{order.address}</span>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {order.deliveryDistance && (
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 flex items-center gap-1">
                      <Navigation className="w-2.5 h-2.5 text-blue-600" />
                      {order.deliveryDistance.toFixed(1)} km
                    </span>
                  )}
                  {order.deliveryWindowStart && order.deliveryWindowEnd && (
                    <div className="flex items-center gap-1.5 text-[9px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      <Calendar className="w-3 h-3 text-indigo-600 shrink-0" />
                      <span>Ventana: {order.deliverySlot?.split(' ')[0]} ({order.deliveryWindowStart} - {order.deliveryWindowEnd})</span>
                    </div>
                  )}
                </div>

                {order.status === 'delivered' && (
                  <div className="flex justify-between items-center mt-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                       {order.paymentMethod === 'cash' ? (
                         <>
                           <Banknote className="w-3 h-3 text-green-600" />
                           <span className="text-green-700">Cobrar: ${order.total.toFixed(2)}</span>
                         </>
                       ) : (
                         <>
                           <CreditCard className="w-3 h-3 text-blue-600" />
                           <span className="text-blue-700">Pagado</span>
                         </>
                       )}
                    </div>
                    <span className="text-[10px] text-gray-400">{order.items.length} productos</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      )}

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Entrega: #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase">Cliente</p>
                  <p className="font-bold text-gray-900">{selectedOrder.userName}</p>
                  <p className="text-sm text-gray-500">{selectedOrder.address}</p>
                  {selectedOrder.deliveryWindowStart && selectedOrder.deliveryWindowEnd && (
                    <div className="flex items-center gap-2 text-[10px] text-blue-700 bg-blue-100/30 px-3 py-1.5 rounded-full border border-blue-200/50 mt-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="font-bold tracking-tight">ENTREGA: {selectedOrder.deliverySlot?.split(' ')[0]} ({selectedOrder.deliveryWindowStart} - {selectedOrder.deliveryWindowEnd})</span>
                    </div>
                  )}
                  {selectedOrder.location && (
                    <div className="space-y-2 pt-2">
                      <div className="h-40 w-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm relative bg-gray-100">
                        <OSMMap
                          center={selectedOrder.location}
                          customerLocation={selectedOrder.location}
                          zoom={15}
                          isDraggable={false}
                          className="w-full h-full"
                        />
                      </div>
                      
                      {/* Botón único de navegación GPS con dirección completa (calle, no. exterior, colonia, etc.) */}
                      <button 
                        type="button"
                        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]"
                        onClick={() => {
                          const fullAddr = selectedOrder.address?.trim() || (selectedOrder.location ? `${selectedOrder.location.lat},${selectedOrder.location.lng}` : '');
                          if (fullAddr) {
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`, '_blank');
                          }
                        }}
                      >
                        <Navigation className="w-4 h-4 text-white" />
                        <span>Abrir Navegación GPS (Dirección Completa)</span>
                      </button>
                    </div>
                  )}
                  {selectedOrder.userPhone && (
                    <div className="pt-2 flex items-center justify-between border-t border-gray-100">
                      <span className="text-xs text-gray-500 font-medium">Teléfono:</span>
                      <a 
                        href={`tel:${selectedOrder.userPhone}`} 
                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100"
                      >
                        <Phone className="w-3 h-3" />
                        {selectedOrder.userPhone}
                      </a>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-bold uppercase ml-1">Productos</p>
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                    {selectedOrder.items.map((item, i) => {
                      const product = products.find(p => p.id === item.productId);
                      return (
                        <div key={i} className="flex items-center gap-3 p-2">
                          {product?.imageUrl ? (
                            <img src={product.imageUrl} className="w-8 h-8 rounded-lg object-cover bg-gray-50 flex-shrink-0" alt={item.name} referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{item.name}</p>
                            <div className="flex flex-col">
                              {item.unit === 'Kg' ? (
                                <>
                                  <p className="text-[10px] text-gray-500">
                                    P: ${(item.price).toFixed(2)} / Kg
                                  </p>
                                  <p className="text-[10px] text-blue-600 font-bold">
                                    F: {(item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)).toFixed(2)} Kg
                                  </p>
                                </>
                              ) : (
                                <p className="text-[10px] text-gray-500">{item.quantity}x ${(item.price).toFixed(2)}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-gray-700">
                              ${(item.unit === 'Kg' 
                                ? (item.price * (item.loaderWeight || item.preparerWeight || (item.approxWeight ? item.approxWeight * item.quantity : 0)))
                                : (item.price * item.quantity)).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                  </div>
                  {(selectedOrder.deliveryFee || 0) > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Envío</span>
                      <span className="font-bold text-gray-900">${(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">IVA Incluido (16%)</span>
                    <span className="font-bold text-gray-900">${((selectedOrder.adjustedTotal ?? selectedOrder.total) - ((selectedOrder.adjustedTotal ?? selectedOrder.total) / 1.16)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-lg font-bold text-gray-400 uppercase">TOTAL</span>
                    <span className="text-2xl font-black text-gray-900">
                      ${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  {selectedOrder.status === 'shipped' ? (
                    <>
                      {!selectedOrder.arrivedAt ? (
                        <div className="space-y-3">
                          {(() => {
                            const orderRoute = routes.find(r => r.id === selectedOrder.routeId);
                            const isRouteInProgress = orderRoute?.status === 'in_progress';
                            return (
                              <>
                                {!isRouteInProgress && (
                                  <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-2 text-xs font-bold animate-pulse">
                                    <AlertTriangle className="w-4 h-4" />
                                    Debes iniciar la ruta para confirmar llegada
                                  </div>
                                )}
                                <Button 
                                  className={cn(
                                    "w-full h-14 shadow-lg text-lg font-bold flex items-center justify-center gap-2",
                                    isRouteInProgress ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 cursor-not-allowed"
                                  )} 
                                  onClick={() => confirmArrival(selectedOrder)}
                                  disabled={!isRouteInProgress}
                                >
                                  <MapPin className="w-6 h-6" />
                                  <span>He llegado con el cliente</span>
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                      ) : !selectedOrder.reviewedAt ? (
                        <Button 
                          className="w-full h-14 bg-orange-600 hover:bg-orange-700 shadow-lg text-lg font-bold flex items-center justify-center gap-2" 
                          onClick={() => confirmReview(selectedOrder)}
                        >
                          <ClipboardList className="w-6 h-6" />
                          <span>Mercancía Revisada por Cliente</span>
                        </Button>
                      ) : selectedOrder.paymentMethod === 'cash' && selectedOrder.paymentStatus === 'pending' ? (
                        <div className="space-y-4">
                              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-center gap-3">
                                <Banknote className="w-8 h-8 text-emerald-600" />
                                <div>
                                  <p className="text-xs text-emerald-600 font-bold uppercase">Pago en Efectivo</p>
                                  <p className="text-xl font-black text-gray-900">${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}</p>
                                </div>
                              </div>
                          <Button 
                            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 text-lg font-bold flex items-center justify-center gap-2" 
                            onClick={() => collectPayment(selectedOrder)}
                          >
                            <Banknote className="w-6 h-6" />
                            <span>Cobrar Efectivo</span>
                          </Button>
                          <p className="text-[10px] text-center text-gray-400 italic">
                            Al cobrar, se habilitará el código de entrega para el cliente.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1">Código de Verificación</label>
                              <Input 
                                placeholder="Ingresa el código del cliente"
                                value={verificationCode}
                                onChange={(e: any) => setVerificationCode(e.target.value)}
                                className="text-center font-black tracking-widest text-lg"
                                autoFocus
                              />
                          </div>
    
                          <Button 
                            className="w-full h-12 bg-green-600 hover:bg-green-700" 
                            onClick={() => deliverOrder(selectedOrder)}
                            disabled={!verificationCode}
                          >
                            Marcar como Entregado
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-2xl text-center space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase">Estado del Pedido</p>
                      <p className={cn(
                        "font-black text-lg",
                        selectedOrder.status === 'delivered' ? "text-green-600" : "text-red-600"
                      )}>
                        {selectedOrder.status === 'delivered' ? 'COMPLETADO' : 'CANCELADO'}
                      </p>
                      {selectedOrder.deliveredAt && (
                        <p className="text-[10px] text-gray-400">
                          Finalizado el {selectedOrder.deliveredAt.toDate ? selectedOrder.deliveredAt.toDate().toLocaleString() : new Date(selectedOrder.deliveredAt.seconds * 1000).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LoaderView({ 
  orders, 
  routes,
  users, 
  products, 
  onBack, 
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[], 
  routes: DeliveryRoute[],
  users: UserProfile[], 
  products: Product[], 
  onBack: () => void, 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  initialTab?: 'pending' | 'history'
}) {
  const pendingOrders = orders.filter(o => (o.status === 'processing' || o.status === 'ready') && !o.onboarded && o.type !== 'pickup');
  const historyOrders = orders.filter(o => o.onboarded === true && o.type !== 'pickup').slice(0, 50);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [loaderWeights, setLoaderWeights] = useState<Record<string, string>>({});

  const displayedOrders = initialTab === 'pending' ? sortOrdersByWindowAndDistance(pendingOrders) : historyOrders;
  const selectedOrder = displayedOrders.find(o => o.id === selectedOrderId) || null;

  useEffect(() => {
    setCheckedItems({});
    if (selectedOrder) {
      const initialWeights: Record<string, string> = {};
      selectedOrder.items.forEach(item => {
        if (item.unit === 'Kg' && item.preparerWeight) {
          initialWeights[item.productId] = item.preparerWeight.toString();
        } else if (item.unit === 'Kg' && item.loaderWeight) {
          initialWeights[item.productId] = item.loaderWeight.toString();
        }
      });
      setLoaderWeights(initialWeights);
    } else {
      setLoaderWeights({});
    }
  }, [selectedOrderId, selectedOrder]);

  const toggleItem = (itemName: string) => {
    setCheckedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }));
  };

  const markAsReady = async (order: Order) => {
    try {
      const updatedItems = order.items.map(item => {
        const currentWeightStr = loaderWeights[item.productId];
        const weightValue = currentWeightStr ? parseFloat(currentWeightStr) : (item.preparerWeight || 0);
        
        return {
          ...item,
          ...(item.unit === 'Kg' ? { loaderWeight: weightValue } : {})
        };
      });

      // Calculate adjusted total
      let adjustedTotal = order.total;
      const hasKgItems = updatedItems.some(item => item.unit === 'Kg');
      if (hasKgItems) {
        const nonKgItemsTotal = updatedItems.filter(i => i.unit !== 'Kg').reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const kgItemsTotal = updatedItems.filter(i => i.unit === 'Kg').reduce((sum, i) => sum + (i.price * (i.loaderWeight || 0)), 0);
        adjustedTotal = nonKgItemsTotal + kgItemsTotal + (order.deliveryFee || 0);
      }

      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'ready',
        preparedAt: serverTimestamp(),
        items: updatedItems,
        adjustedTotal: adjustedTotal,
        weightValidated: true
      });
      
      // Update stock and reserved
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await updateDoc(doc(db, 'products', product.id), {
            stock: Math.max(0, product.stock - item.quantity),
            reserved: Math.max(0, product.reserved - item.quantity)
          });
        }
      }
      setCheckedItems({});
      showToast("Orden validada correctamente", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const onboardOrder = async (order: Order) => {
    const route = routes.find(r => r.id === order.routeId);
    if (!route) {
      showToast("Este pedido no tiene una ruta asignada por despacho", 'error');
      return;
    }
    
    // Logic for kg items validation is now more relaxed
    const hasKgItems = order.items.some(item => item.unit === 'Kg');

    try {
      let updateData: any = { 
        status: 'shipped', 
        onboarded: true 
      };

      if (hasKgItems) {
        const updatedItems = order.items.map(item => {
          const currentWeightStr = loaderWeights[item.productId];
          const weightValue = currentWeightStr ? parseFloat(currentWeightStr) : (item.preparerWeight || 0);

          return {
            ...item,
            ...(item.unit === 'Kg' ? { loaderWeight: weightValue } : {})
          };
        });

        const nonKgItemsTotal = updatedItems.filter(i => i.unit !== 'Kg').reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const kgItemsTotal = updatedItems.filter(i => i.unit === 'Kg').reduce((sum, i) => sum + (i.price * (i.loaderWeight || 0)), 0);
        const adjustedTotal = nonKgItemsTotal + kgItemsTotal + (order.deliveryFee || 0);

        updateData.items = updatedItems;
        updateData.adjustedTotal = adjustedTotal;
        updateData.weightValidated = true;
      }

      await updateDoc(doc(db, 'orders', order.id), updateData);
      
      // Notify client
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pedido en Camino',
        message: `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido cargado en la ${route.name} y está en camino.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      // Notify driver
      await addDoc(collection(db, 'notifications'), {
        userId: route.driverId || 'unknown',
        title: 'Nuevo Pedido Asignado',
        message: `Se te ha asignado el pedido #${(order.id || '').slice(-6).toUpperCase()} para entrega en tu ruta.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

      setSelectedOrderId(null);
      showToast("Pedido cargado exitosamente", 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const allChecked = selectedOrder?.items.every(item => checkedItems[item.name]);

  const selectedOrderRoute = selectedOrder?.routeId ? routes.find(r => r.id === selectedOrder.routeId) : null;
  const selectedOrderDriver = selectedOrderRoute?.driverId ? users.find(u => u.uid === selectedOrderRoute.driverId) : null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900 border-l-4 border-orange-500 pl-4">
          {initialTab === 'pending' ? 'Carga y Onboarding' : 'Historial de Carga'}
        </h2>
      </div>

      <div className="space-y-4">
        {displayedOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay pedidos {initialTab === 'pending' ? 'para cargar' : 'en el historial'}</p>
          </div>
        ) : (
          displayedOrders.map(order => {
            const route = routes.find(r => r.id === order.routeId);
            const driver = route ? users.find(u => u.uid === route.driverId) : null;
            return (
              <div key={order.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h4>
                    <p className="text-xs text-gray-500 font-medium">{order.userName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                        order.status === 'processing' ? "bg-blue-100 text-blue-700" : 
                        order.status === 'ready' ? "bg-purple-100 text-purple-700" :
                        "bg-indigo-100 text-indigo-700"
                      )}>
                        {order.status === 'processing' ? 'En Preparación' : 
                         order.status === 'ready' ? 'Listo p/ Carga' : order.status}
                      </span>
                      {order.onboarded && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold uppercase">
                          Cargado
                        </span>
                      )}
                    </div>
                    {initialTab === 'pending' ? (
                      <Button className="text-xs h-8 px-4" onClick={() => setSelectedOrderId(order.id)}>
                        {order.status === 'processing' ? 'Validar' : 'Confirmar Carga'}
                      </Button>
                    ) : (
                      route && (
                        <div className="flex items-center gap-1 text-[9px] text-gray-500 font-bold bg-gray-50 px-2 py-1 rounded">
                          <Truck className="w-3 h-3 text-red-500" />
                          <span>{route.name} ({route.unitNumber})</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
                
                {route ? (
                  <div className="p-2 bg-orange-50/50 rounded-xl border border-orange-100 flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-[10px] font-bold text-orange-700">Ruta: {route.name} • {route.unitNumber} • {driver?.name || 'Chófer'}</span>
                  </div>
                ) : (
                  <div className="p-2 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-bold text-red-700 italic">Pendiente de ruta por Despacho</span>
                  </div>
                )}

                <div className="flex items-start gap-2 text-[10px] text-gray-500">
                  <MapPin className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                  <span className="truncate">{order.address}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-50">
                  {order.deliveryDistance && (
                    <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 flex items-center gap-1">
                      <Navigation className="w-2.5 h-2.5 text-blue-600" />
                      {order.deliveryDistance.toFixed(1)} km
                    </span>
                  )}
                  {order.deliveryWindowStart && order.deliveryWindowEnd && (
                    <div className="flex items-center gap-1.5 text-[9px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                      <Clock className="w-3 h-3 text-indigo-600 shrink-0" />
                      <span>Ventana: {order.deliverySlot?.split(' ')[0]} ({order.deliveryWindowStart} - {order.deliveryWindowEnd})</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-600 rounded-xl shadow-lg shadow-orange-100">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-bold text-xl">
                    {initialTab === 'history' ? 'Detalles del Pedido' : `Cargar Pedido: #${selectedOrder.id.slice(-6).toUpperCase()}`}
                  </h3>
                </div>
                <button onClick={() => setSelectedOrderId(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {initialTab === 'history' ? (
                <div className="space-y-6">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] text-blue-600 font-bold uppercase mb-1">Estado General</p>
                    <div className="flex justify-between items-center">
                      <span className="font-black text-lg text-gray-900 uppercase">{selectedOrder.status}</span>
                      {selectedOrder.onboarded && <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">CARGADO</span>}
                    </div>
                  </div>

                  {selectedOrderRoute && (
                    <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-2">
                       <p className="text-[10px] text-orange-600 font-bold uppercase">Información de Ruta</p>
                       <div className="flex items-center gap-3">
                         <Truck className="w-6 h-6 text-orange-500" />
                         <div>
                           <p className="text-sm font-bold text-gray-900">{selectedOrderRoute.name}</p>
                           <p className="text-[10px] text-gray-500 font-medium italic">Unidad: {selectedOrderRoute.unitNumber} • Chófer: {selectedOrderDriver?.name || 'Asignado'}</p>
                         </div>
                       </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Resumen de Productos</p>
                    <div className="space-y-2">
                       {selectedOrder.items.map((item, i) => {
                         const product = products.find(p => p.id === item.productId);
                         const weight = item.loaderWeight || item.preparerWeight;
                         return (
                          <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm transition-colors">
                             <div className="flex items-center gap-3">
                               {product?.imageUrl ? (
                                 <img src={product.imageUrl} className="w-10 h-10 rounded-xl object-cover bg-gray-50 flex-shrink-0 border border-gray-100" alt={item.name} referrerPolicy="no-referrer" />
                               ) : (
                                 <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
                                   <Package className="w-5 h-5 text-gray-300" />
                                 </div>
                               )}
                               <div className="flex flex-col">
                                 <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                 {item.unit === 'Kg' ? (
                                   <div className="flex items-center gap-2 mt-0.5">
                                     <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-black">
                                       {weight ? `${weight.toFixed(2)} Kg` : `${item.quantity} Piezas`}
                                     </span>
                                     <span className="text-[9px] text-gray-400 font-bold">${item.price.toFixed(2)}/Kg</span>
                                   </div>
                                 ) : (
                                   <span className="text-[10px] text-gray-400 font-bold">
                                     {item.quantity} und. x ${item.price.toFixed(2)}
                                   </span>
                                 )}
                               </div>
                             </div>
                             <div className="text-right">
                               <span className="text-sm font-black text-gray-900">
                                 ${(item.unit === 'Kg' 
                                   ? (item.price * (weight || 0)) 
                                   : (item.price * item.quantity)).toFixed(2)}
                               </span>
                             </div>
                           </div>
                         );
                       })}
                    </div>

                    <div className="p-4 bg-gray-900 rounded-2xl space-y-2 mt-4 shadow-xl shadow-gray-200">
                      <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-widest border-b border-gray-800 pb-2 mb-2">
                        <span>Resumen de Pago</span>
                        <div className="flex gap-2">
                          {selectedOrder.onboarded && <span className="bg-green-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black">CARGADO</span>}
                          <span className="text-white bg-blue-600 rounded px-1.5 py-0.5 text-[8px] font-black">{selectedOrder.status.toUpperCase()}</span>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-gray-400 text-sm font-bold uppercase">Total del Pedido</span>
                        <span className="text-2xl font-black text-white">
                          ${(selectedOrder.adjustedTotal ?? selectedOrder.total).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Destino</p>
                    <p className="text-sm font-bold text-gray-900">{selectedOrder.address}</p>
                  </div>
                  
                  <Button className="w-full h-12" variant="outline" onClick={() => setSelectedOrderId(null)}>
                    Cerrar Historial
                  </Button>
                </div>
              ) : (
                <>
                  {selectedOrderRoute ? (
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-2 shadow-sm">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-orange-600 font-black uppercase tracking-wider">Información de Ruta</p>
                    <span className="text-[10px] bg-orange-200 text-orange-800 px-2 py-0.5 rounded font-bold">{selectedOrderRoute.unitNumber}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Truck className="w-8 h-8 text-orange-500" />
                    <div>
                      <p className="font-bold text-gray-900">{selectedOrderRoute.name}</p>
                      <p className="text-xs text-orange-700 font-medium italic">Chofer: {selectedOrderDriver?.name || 'Asignado'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                  <p className="text-xs text-red-700 font-bold">Aún no se ha asignado una ruta para este pedido en Despacho.</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4 shadow-sm">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Checklist de Carga</p>
                  <div className="space-y-3">
                    {selectedOrder.items.map((item, i) => {
                      const product = products.find(p => p.id === item.productId);
                      return (
                        <div 
                          key={i} 
                          onClick={() => toggleItem(item.name)}
                          className={cn(
                            "flex flex-col p-3 rounded-xl border transition-all cursor-pointer",
                            checkedItems[item.name] ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-100"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                              checkedItems[item.name] ? "bg-green-500 border-green-500" : "border-gray-300"
                            )}>
                              {checkedItems[item.name] && <Check className="w-3 h-3 text-white" />}
                            </div>
                            {product?.imageUrl && (
                              <img src={product.imageUrl} className="w-8 h-8 rounded-lg object-cover" alt={item.name} referrerPolicy="no-referrer" />
                            )}
                            <div className="flex-1">
                              <span className={cn(
                                "text-sm font-bold block",
                                checkedItems[item.name] ? "text-green-800 line-through" : "text-gray-900"
                              )}>
                                {item.quantity}x {item.name}
                              </span>
                            </div>
                          </div>
                          
                          {item.unit === 'Kg' && (
                            <div className="mt-3 flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-50" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-col flex-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase">Valida KG Real</span>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  placeholder="0.00"
                                  value={loaderWeights[item.productId] || ''}
                                  onChange={(e) => setLoaderWeights(prev => ({ ...prev, [item.productId]: e.target.value }))}
                                  className="w-full bg-transparent text-sm font-bold text-blue-600 outline-none"
                                />
                              </div>
                              <div className="text-right">
                                <span className="text-[8px] text-gray-400 block uppercase">Prep:</span>
                                <span className="text-xs font-bold text-gray-500">{item.preparerWeight?.toFixed(2) || '0.00'} Kg</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {initialTab === 'pending' && (
                  <div className="space-y-3">
                    {selectedOrder.status === 'processing' ? (
                      <Button 
                        className="w-full h-14 bg-orange-600 hover:bg-orange-700 shadow-lg text-lg font-bold" 
                        onClick={() => markAsReady(selectedOrder)}
                        disabled={!allChecked}
                      >
                        Validar Preparación
                      </Button>
                    ) : (
                      <Button 
                        className="w-full h-14 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100 text-lg font-bold flex items-center justify-center gap-2" 
                        onClick={() => onboardOrder(selectedOrder)}
                        disabled={!allChecked || !selectedOrder.routeId}
                      >
                        <PackageCheck className="w-6 h-6" />
                        <span>Confirmar Carga en Ruta</span>
                      </Button>
                    )}
                    {!selectedOrder.routeId && (
                      <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-2 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-[10px] font-bold">Requiere Ruta de Despacho para continuar</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
