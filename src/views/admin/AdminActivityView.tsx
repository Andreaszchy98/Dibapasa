import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronRight, 
  Activity, 
  User, 
  Truck, 
  PackageCheck, 
  Package, 
  CreditCard, 
  CheckCircle2, 
  Filter, 
  Clock, 
  FileText
} from 'lucide-react';
import { Order, DeliveryRoute, UserProfile } from '../../types';
import { cn } from '../../components/ui';

export type ActivityEventType = 'dispatched' | 'prepared' | 'loaded' | 'paid' | 'delivered' | 'route_created';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: Date;
  actorId?: string;
  actorName: string;
  orderId?: string;
  clientName?: string;
  routeId?: string;
  routeName?: string;
  orderCount?: number;
}

function toJsDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (ts instanceof Date) return ts;
  if (typeof (ts as { seconds?: number }).seconds === 'number') {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

const ACTION_CONFIG: Record<ActivityEventType, { label: string; icon: React.ElementType; color: string; badge: string }> = {
  dispatched: {
    label: 'Despachado',
    icon: Truck,
    color: 'bg-blue-50 text-blue-600 border-blue-100',
    badge: 'bg-blue-100 text-blue-700'
  },
  prepared: {
    label: 'Preparado',
    icon: PackageCheck,
    color: 'bg-purple-50 text-purple-600 border-purple-100',
    badge: 'bg-purple-100 text-purple-700'
  },
  loaded: {
    label: 'Cargado a Unidad',
    icon: Package,
    color: 'bg-orange-50 text-orange-600 border-orange-100',
    badge: 'bg-orange-100 text-orange-700'
  },
  paid: {
    label: 'Pago Cobrado',
    icon: CreditCard,
    color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    badge: 'bg-emerald-100 text-emerald-700'
  },
  delivered: {
    label: 'Entregado',
    icon: CheckCircle2,
    color: 'bg-green-50 text-green-600 border-green-100',
    badge: 'bg-green-100 text-green-700'
  },
  route_created: {
    label: 'Ruta Creada',
    icon: Truck,
    color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    badge: 'bg-indigo-100 text-indigo-700'
  }
};

export function AdminActivityView({
  orders,
  users,
  routes,
  onBack
}: {
  orders: Order[];
  users: UserProfile[];
  routes: DeliveryRoute[];
  onBack: () => void;
}) {
  const [selectedActor, setSelectedActor] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  const userMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach(u => map.set(u.uid, u));
    return map;
  }, [users]);

  // Aggregate all events
  const allEvents = useMemo(() => {
    const events: ActivityEvent[] = [];

    // Order events
    orders.forEach(order => {
      // Dispatched event
      if (order.dispatchedAt && (order.dispatchedBy || order.dispatchedByName)) {
        const d = toJsDate(order.dispatchedAt);
        if (d) {
          events.push({
            id: `disp-${order.id}`,
            type: 'dispatched',
            timestamp: d,
            actorId: order.dispatchedBy,
            actorName: order.dispatchedByName || (order.dispatchedBy ? userMap.get(order.dispatchedBy)?.name : '') || 'Despachador',
            orderId: order.id,
            clientName: order.userName
          });
        }
      }

      // Prepared event
      if (order.preparedAt && (order.preparedBy || order.preparedByName)) {
        const d = toJsDate(order.preparedAt);
        if (d) {
          events.push({
            id: `prep-${order.id}`,
            type: 'prepared',
            timestamp: d,
            actorId: order.preparedBy,
            actorName: order.preparedByName || (order.preparedBy ? userMap.get(order.preparedBy)?.name : '') || 'Preparador',
            orderId: order.id,
            clientName: order.userName
          });
        }
      }

      // Loaded event
      if (order.loadedAt && (order.loadedBy || order.loadedByName)) {
        const d = toJsDate(order.loadedAt);
        if (d) {
          events.push({
            id: `load-${order.id}`,
            type: 'loaded',
            timestamp: d,
            actorId: order.loadedBy,
            actorName: order.loadedByName || (order.loadedBy ? userMap.get(order.loadedBy)?.name : '') || 'Cargador',
            orderId: order.id,
            clientName: order.userName
          });
        }
      }

      // Paid / Processed event
      if (order.paidAt && (order.processedBy || order.processedByName)) {
        const d = toJsDate(order.paidAt);
        if (d) {
          events.push({
            id: `paid-${order.id}`,
            type: 'paid',
            timestamp: d,
            actorId: order.processedBy,
            actorName: order.processedByName || (order.processedBy ? userMap.get(order.processedBy)?.name : '') || 'Cajero',
            orderId: order.id,
            clientName: order.userName
          });
        }
      }

      // Delivered event
      if (order.deliveredAt && order.driverId) {
        const d = toJsDate(order.deliveredAt);
        if (d) {
          events.push({
            id: `deliv-${order.id}`,
            type: 'delivered',
            timestamp: d,
            actorId: order.driverId,
            actorName: userMap.get(order.driverId)?.name || 'Chófer',
            orderId: order.id,
            clientName: order.userName
          });
        }
      }
    });

    // Route events
    routes.forEach(route => {
      if (route.assignedBy || route.assignedByName) {
        const d = toJsDate(route.createdAt || route.updatedAt) || new Date();
        events.push({
          id: `route-${route.id}`,
          type: 'route_created',
          timestamp: d,
          actorId: route.assignedBy,
          actorName: route.assignedByName || (route.assignedBy ? userMap.get(route.assignedBy)?.name : '') || 'Despachador',
          routeId: route.id,
          routeName: route.name,
          orderCount: route.orderIds?.length || 0
        });
      }
    });

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [orders, routes, userMap]);

  // Employee summary metrics
  const employeeSummaries = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      total: number;
      dispatched: number;
      prepared: number;
      loaded: number;
      paid: number;
      delivered: number;
      routes: number;
    }>();

    allEvents.forEach(evt => {
      const key = evt.actorId || evt.actorName;
      const current = map.get(key) || {
        id: key,
        name: evt.actorName,
        total: 0,
        dispatched: 0,
        prepared: 0,
        loaded: 0,
        paid: 0,
        delivered: 0,
        routes: 0
      };

      current.total++;
      if (evt.type === 'dispatched') current.dispatched++;
      else if (evt.type === 'prepared') current.prepared++;
      else if (evt.type === 'loaded') current.loaded++;
      else if (evt.type === 'paid') current.paid++;
      else if (evt.type === 'delivered') current.delivered++;
      else if (evt.type === 'route_created') current.routes++;

      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [allEvents]);

  // List of distinct staff users for filter
  const staffActors = useMemo(() => {
    const actorsMap = new Map<string, string>();
    employeeSummaries.forEach(s => {
      actorsMap.set(s.id, s.name);
    });
    users.filter(u => ['admin', 'dispatcher', 'preparer', 'loader', 'driver', 'store_sales'].includes(u.role)).forEach(u => {
      actorsMap.set(u.uid, u.name);
    });
    return Array.from(actorsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [employeeSummaries, users]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return allEvents.filter(evt => {
      const matchesActor = selectedActor === 'all' || evt.actorId === selectedActor || evt.actorName === selectedActor;
      const matchesType = selectedType === 'all' || evt.type === selectedType;
      return matchesActor && matchesType;
    }).slice(0, 150);
  }, [allEvents, selectedActor, selectedType]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Volver al Panel"
          >
            <ChevronRight className="w-6 h-6 text-gray-500 rotate-180" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Auditoría y Actividad por Empleado
            </h2>
            <p className="text-xs text-gray-500">Historial detallado de intervenciones operativas y logística</p>
          </div>
        </div>
      </div>

      {/* Employee Activity Summary Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">Resumen de Intervenciones</h3>
        {employeeSummaries.length === 0 ? (
          <div className="bg-white p-6 rounded-3xl border border-gray-100 text-center text-gray-400">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Aún no se registran acciones con atribución de personal.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {employeeSummaries.map(emp => (
              <div 
                key={emp.id}
                onClick={() => setSelectedActor(selectedActor === emp.id ? 'all' : emp.id)}
                className={cn(
                  "p-4 rounded-2xl border transition-all cursor-pointer",
                  selectedActor === emp.id 
                    ? "bg-indigo-50/70 border-indigo-200 shadow-sm" 
                    : "bg-white border-gray-100 hover:border-gray-200 shadow-sm"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900 leading-tight">{emp.name}</p>
                      <p className="text-[10px] text-gray-400">{emp.total} {emp.total === 1 ? 'acción' : 'acciones'} registradas</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                    {emp.total}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-gray-50 text-[10px]">
                  {emp.dispatched > 0 && (
                    <div className="bg-blue-50/70 p-1.5 rounded-lg text-blue-700 font-semibold text-center">
                      <span className="block font-black text-xs">{emp.dispatched}</span>
                      <span>Despachos</span>
                    </div>
                  )}
                  {emp.prepared > 0 && (
                    <div className="bg-purple-50/70 p-1.5 rounded-lg text-purple-700 font-semibold text-center">
                      <span className="block font-black text-xs">{emp.prepared}</span>
                      <span>Preparados</span>
                    </div>
                  )}
                  {emp.loaded > 0 && (
                    <div className="bg-orange-50/70 p-1.5 rounded-lg text-orange-700 font-semibold text-center">
                      <span className="block font-black text-xs">{emp.loaded}</span>
                      <span>Cargas</span>
                    </div>
                  )}
                  {emp.paid > 0 && (
                    <div className="bg-emerald-50/70 p-1.5 rounded-lg text-emerald-700 font-semibold text-center">
                      <span className="block font-black text-xs">{emp.paid}</span>
                      <span>Cobros</span>
                    </div>
                  )}
                  {emp.delivered > 0 && (
                    <div className="bg-green-50/70 p-1.5 rounded-lg text-green-700 font-semibold text-center">
                      <span className="block font-black text-xs">{emp.delivered}</span>
                      <span>Entregas</span>
                    </div>
                  )}
                  {emp.routes > 0 && (
                    <div className="bg-indigo-50/70 p-1.5 rounded-lg text-indigo-700 font-semibold text-center">
                      <span className="block font-black text-xs">{emp.routes}</span>
                      <span>Rutas</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
          <Filter className="w-4 h-4 text-indigo-600" />
          <span>Filtros de Auditoría</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Empleado
            </label>
            <select
              value={selectedActor}
              onChange={(e) => setSelectedActor(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Todos los empleados ({allEvents.length} eventos)</option>
              {staffActors.map(actor => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Etapa / Tipo de Acción
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Todas las etapas</option>
              <option value="dispatched">Despacho de Pedidos</option>
              <option value="prepared">Preparación de Pedidos</option>
              <option value="loaded">Carga a Unidad</option>
              <option value="paid">Cobro / Confirmación de Pago</option>
              <option value="delivered">Entrega a Cliente</option>
              <option value="route_created">Creación de Rutas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Registro de Eventos ({filteredEvents.length})
          </h3>
          {(selectedActor !== 'all' || selectedType !== 'all') && (
            <button 
              onClick={() => {
                setSelectedActor('all');
                setSelectedType('all');
              }}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {filteredEvents.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center space-y-2">
            <FileText className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm font-bold text-gray-700">No se encontraron eventos</p>
            <p className="text-xs text-gray-400">Prueba cambiando los criterios del filtro de búsqueda.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEvents.map(evt => {
              const cfg = ACTION_CONFIG[evt.type];
              const Icon = cfg.icon;

              return (
                <div 
                  key={evt.id}
                  className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-100 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("p-2.5 rounded-xl border shrink-0 mt-0.5", cfg.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-[9px] px-2 py-0.5 rounded font-bold uppercase", cfg.badge)}>
                          {cfg.label}
                        </span>
                        {evt.orderId && (
                          <span className="text-xs font-black text-gray-900">
                            #{evt.orderId.slice(-6).toUpperCase()}
                          </span>
                        )}
                        {evt.routeName && (
                          <span className="text-xs font-black text-indigo-700">
                            {evt.routeName}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-xs text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {evt.clientName && (
                          <span className="font-medium text-gray-900">
                            Cliente: {evt.clientName}
                          </span>
                        )}
                        {typeof evt.orderCount === 'number' && (
                          <span className="font-medium text-gray-600">
                            {evt.orderCount} {evt.orderCount === 1 ? 'pedido asignado' : 'pedidos asignados'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold text-indigo-700">
                        <User className="w-3 h-3 text-indigo-500" />
                        <span>Realizado por: <strong className="text-gray-900">{evt.actorName}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 sm:self-start shrink-0 pl-11 sm:pl-0">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span>{evt.timestamp.toLocaleDateString()} · {evt.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
