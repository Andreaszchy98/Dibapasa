import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, ShieldCheck, ChevronRight, Calendar, Package, AlertTriangle, Tags, Settings, ClipboardList, Truck, Activity, Box } from 'lucide-react';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { Order, UserProfile } from '../../types';

export function AdminDashboard({ 
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
  onActivityClick,
  onUnitsClick,
  onKareyControlClick,
  onSettingsClick,
  onCategoriesClick,
  onRefresh,
  onSeedData
}: { 
  orders: Order[]; 
  users: UserProfile[]; 
  currentUserId: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onStatClick: (status: Order['status'] | 'all') => void;
  onUsersClick: () => void;
  onInventoryTrackingClick: (p: 'day' | 'week' | 'month' | 'year') => void;
  onReturnsClick: () => void;
  onDriverRouteClick: () => void;
  onActivityClick?: () => void;
  onUnitsClick?: () => void;
  onKareyControlClick?: () => void;
  onSettingsClick: () => void;
  onProductsClick?: () => void;
  onCategoriesClick: () => void;
  onRefresh?: () => void;
  onSeedData?: () => void;
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
  }, [orders, selectedDate, period, startOfPeriod, endOfPeriod]);

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
                      onClick={() => setPeriod(p.id as 'day' | 'week' | 'month' | 'year')}
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

        {onUnitsClick && (
          <button 
            onClick={onUnitsClick}
            className="col-span-2 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-emerald-200 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Truck className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-gray-900">Unidades / Camiones</p>
                <p className="text-[10px] text-gray-400">Gestiona camiones para rutas y control de jabas</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </button>
        )}

        {onKareyControlClick && (
          <button 
            onClick={onKareyControlClick}
            className="col-span-2 bg-white p-5 rounded-3xl border border-amber-200 shadow-sm flex items-center justify-between hover:border-amber-400 transition-colors bg-amber-50/20"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
                <Box className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-amber-950">Módulo Control de Jabas Karey</p>
                <p className="text-[10px] text-amber-700">Recepción de camiones, conteo JV/JN, transferencias y adeudos</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-400" />
          </button>
        )}

        {onActivityClick && (
          <button 
            onClick={onActivityClick}
            className="col-span-2 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-indigo-200 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Activity className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-gray-900">Auditoría y Actividad por Empleado</p>
                <p className="text-[10px] text-gray-400">Rastreo de acciones por despachador, preparador, chofer y cargador</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </button>
        )}

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
