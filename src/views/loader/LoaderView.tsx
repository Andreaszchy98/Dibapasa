import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Truck, AlertTriangle, MapPin, Navigation, Clock, X, Check, PackageCheck } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Button, cn } from '../../components/ui';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, DeliveryRoute, UserProfile, Product } from '../../types';
import { sortOrdersByWindowAndDistance } from '../../lib/utils';
import { calculateOrderStatusInventoryDelta } from '../../lib/inventory';
import { calculateOrderPricing } from '../../lib/orders';

export function LoaderView({ 
  orders, 
  routes,
  users, 
  products, 
  profile,
  onBack: _onBack, 
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[]; 
  routes: DeliveryRoute[]; 
  users: UserProfile[]; 
  products: Product[]; 
  profile: UserProfile;
  onBack: () => void; 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void; 
  initialTab?: 'pending' | 'history'; 
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

      const { total: adjustedTotal } = calculateOrderPricing(updatedItems, order.deliveryFee, order.discount);

      await updateDoc(doc(db, 'orders', order.id), { 
        status: 'ready',
        preparedAt: serverTimestamp(),
        items: updatedItems,
        adjustedTotal: adjustedTotal,
        weightValidated: true
      });
      
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const delta = calculateOrderStatusInventoryDelta(order.status, 'ready', item.quantity);
          await updateDoc(doc(db, 'products', product.id), {
            stock: Math.max(0, (product.stock || 0) + delta.stockDelta),
            reserved: Math.max(0, (product.reserved || 0) + delta.reservedDelta)
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
    
    const hasKgItems = order.items.some(item => item.unit === 'Kg');

    try {
      const updateData: Partial<Order> = { 
        status: 'shipped', 
        onboarded: true,
        loadedAt: serverTimestamp(),
        loadedBy: profile.uid,
        loadedByName: profile.name
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

        const { total: adjustedTotal } = calculateOrderPricing(updatedItems, order.deliveryFee, order.discount);

        updateData.items = updatedItems;
        updateData.adjustedTotal = adjustedTotal;
        updateData.weightValidated = true;
      }

      await updateDoc(doc(db, 'orders', order.id), updateData);
      
      await addDoc(collection(db, 'notifications'), {
        userId: order.userId || 'unknown',
        title: 'Pedido en Camino',
        message: `Tu pedido #${(order.id || '').slice(-6).toUpperCase()} ha sido cargado en la ${route.name} y está en camino.`,
        type: 'order',
        read: false,
        createdAt: serverTimestamp()
      });

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
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold uppercase">
                            Cargado
                          </span>
                          {order.loadedByName && (
                            <span className="text-[8px] text-gray-400">por {order.loadedByName}</span>
                          )}
                        </div>
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
                      {selectedOrder.onboarded && (
                        <div className="flex flex-col items-end">
                          <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">CARGADO</span>
                          {selectedOrder.loadedByName && (
                            <span className="text-[9px] text-gray-500 mt-0.5">por {selectedOrder.loadedByName}</span>
                          )}
                        </div>
                      )}
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
