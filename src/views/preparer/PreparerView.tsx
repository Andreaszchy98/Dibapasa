import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, Clock, Package, X, Check } from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Button, cn } from '../../components/ui';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Order, DeliveryRoute, Product } from '../../types';
import { sortOrdersByWindowAndDistance } from '../../lib/utils';

export function PreparerView({ 
  orders, 
  routes,
  products, 
  onBack: _onBack, 
  showToast,
  initialTab = 'pending'
}: { 
  orders: Order[]; 
  routes: DeliveryRoute[]; 
  products: Product[]; 
  onBack: () => void; 
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void; 
  initialTab?: 'pending' | 'history'; 
}) {
  const assignedOrders = orders.filter(o => {
    if (o.status !== 'processing') return false;
    if (o.routeId) {
      const route = routes.find(r => r.id === o.routeId);
      return route?.releasedToPrep === true;
    }
    return true;
  });
  const historyOrders = orders.filter(o => ['ready', 'shipped', 'delivered'].includes(o.status)).slice(0, 50);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [itemWeights, setItemWeights] = useState<Record<string, string>>({});

  const toggleItem = (itemName: string) => {
    setCheckedItems(prev => ({ ...prev, [itemName]: !prev[itemName] }));
  };

  const markAsReady = async (order: Order) => {
    const kgItemsWithoutWeight = order.items.filter(item => item.unit === 'Kg' && !itemWeights[item.productId]);
    if (kgItemsWithoutWeight.length > 0) {
      showToast("Por favor ingresa el peso para todos los productos vendidos por kilo", 'error');
      return;
    }

    try {
      const updatedItems = order.items.map(item => ({
        ...item,
        ...(item.unit === 'Kg' ? { preparerWeight: parseFloat(itemWeights[item.productId]) || 0 } : {})
      }));

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
      
      for (const item of order.items) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await updateDoc(doc(db, 'products', product.id), {
            stock: Math.max(0, product.stock - item.quantity),
            reserved: Math.max(0, product.reserved - item.quantity)
          });
        }
      }

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
