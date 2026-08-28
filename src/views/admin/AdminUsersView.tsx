import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  RotateCcw, 
  Settings, 
  X, 
  Search, 
  Users, 
  UserCheck, 
  Briefcase, 
  ShoppingBag, 
  Building2, 
  Truck, 
  Package, 
  Scale, 
  ShieldCheck, 
  Store, 
  Boxes, 
  Phone, 
  Mail, 
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button, Input } from '../../components/ui';
import { cn } from '../../components/ui';
import { UserProfile, UserRole, ToastType } from '../../types';

export const ROLE_CONFIG: Record<UserRole, {
  label: string;
  category: 'employee' | 'client';
  color: string;
  bgColor: string;
  borderColor: string;
  icon: any;
  description: string;
  area: string;
}> = {
  admin: {
    label: 'Administrador General',
    category: 'employee',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: ShieldCheck,
    description: 'Control total de la plataforma, finanzas, usuarios y configuración.',
    area: 'Dirección'
  },
  dispatcher: {
    label: 'Despachador de Rutas',
    category: 'employee',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: Truck,
    description: 'Asignación de pedidos a choferes y organización de rutas de entrega.',
    area: 'Logística'
  },
  preparer: {
    label: 'Preparador / Pesador',
    category: 'employee',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Scale,
    description: 'Pesaje de quesos y embutidos, tarado de jabas y surtido de bultos.',
    area: 'Almacén'
  },
  driver: {
    label: 'Conductor / Chofer',
    category: 'employee',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Truck,
    description: 'Entrega en ruta a clientes, cobro de pedidos y retorno de jabas.',
    area: 'Reparto'
  },
  loader: {
    label: 'Cargador / Estibador',
    category: 'employee',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: Package,
    description: 'Carga física en vehículos y verificación de conteo de bultos.',
    area: 'Logística'
  },
  store_sales: {
    label: 'Cajero / Mostrador',
    category: 'employee',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    icon: Store,
    description: 'Ventas directas en mostrador, tickets y cobros en punto de venta.',
    area: 'Ventas'
  },
  inventory: {
    label: 'Encargado de Inventario',
    category: 'employee',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    icon: Boxes,
    description: 'Recepción de mercancía por proveedor, ajustes y registro de mermas.',
    area: 'Almacén'
  },
  karey_inventory: {
    label: 'Control Jabas Karey',
    category: 'employee',
    color: 'text-cyan-800',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    icon: Boxes,
    description: 'Auditoría y control de peso de jabas origen Karey.',
    area: 'Almacén'
  },
  client: {
    label: 'Cliente Particular',
    category: 'client',
    color: 'text-slate-700',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-200',
    icon: ShoppingBag,
    description: 'Comprador individual. Acceso a catálogo público y seguimiento de pedidos.',
    area: 'Clientes'
  },
  company: {
    label: 'Cliente Empresa / Mayorista',
    category: 'client',
    color: 'text-sky-800',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    icon: Building2,
    description: 'Comprador institucional o mayorista con condiciones comerciales.',
    area: 'Clientes'
  }
};

const EMPLOYEE_ROLES: UserRole[] = [
  'admin',
  'dispatcher',
  'preparer',
  'driver',
  'loader',
  'store_sales',
  'inventory',
  'karey_inventory'
];

const CLIENT_ROLES: UserRole[] = ['client', 'company'];

interface AdminUsersViewProps {
  users: UserProfile[];
  onBack: () => void;
  onRefresh?: () => void;
  showToast?: (msg: string, type?: ToastType) => void;
}

export function AdminUsersView({ users, onBack, onRefresh, showToast }: AdminUsersViewProps) {
  const [activeTab, setActiveTab] = useState<'employees' | 'clients' | 'all'>('employees');
  const [searchTerm, setSearchTerm] = useState('');
  const [employeeAreaFilter, setEmployeeAreaFilter] = useState<string>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Split and metrics
  const { employees, clients } = useMemo(() => {
    const emp: UserProfile[] = [];
    const cli: UserProfile[] = [];

    users.forEach(u => {
      if (EMPLOYEE_ROLES.includes(u.role)) {
        emp.push(u);
      } else {
        cli.push(u);
      }
    });

    return { employees: emp, clients: cli };
  }, [users]);

  // Filtered list based on active tab and search
  const filteredUsers = useMemo(() => {
    let list: UserProfile[] = [];

    if (activeTab === 'employees') {
      list = employees;
      if (employeeAreaFilter !== 'all') {
        list = list.filter(u => ROLE_CONFIG[u.role]?.area === employeeAreaFilter || u.role === employeeAreaFilter);
      }
    } else if (activeTab === 'clients') {
      list = clients;
      if (clientTypeFilter !== 'all') {
        list = list.filter(u => u.role === clientTypeFilter);
      }
    } else {
      list = users;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(u => 
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (ROLE_CONFIG[u.role]?.label.toLowerCase().includes(q))
      );
    }

    return list;
  }, [activeTab, employees, clients, users, employeeAreaFilter, clientTypeFilter, searchTerm]);

  const updateUserRole = async (uid: string, newRole: UserRole) => {
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      if (showToast) {
        showToast(`Rol actualizado a "${ROLE_CONFIG[newRole]?.label || newRole}"`, 'success');
      }
      setSelectedUser(null);
      if (onRefresh) onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      if (showToast) {
        showToast('Error al actualizar el rol', 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-24"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronRight className="w-6 h-6 rotate-180 text-gray-700" />
          </Button>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              Personal y Clientes
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Administración de empleados, puestos operativos y directorio de clientes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRefresh} 
              className="h-10 px-3.5 flex items-center gap-2 rounded-xl text-xs font-semibold border-gray-200 hover:bg-gray-50 text-gray-700 shadow-xs"
            >
              <RotateCcw className="w-4 h-4 text-gray-500" />
              <span>Actualizar</span>
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards de Segmentación */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <button
          onClick={() => { setActiveTab('employees'); setEmployeeAreaFilter('all'); }}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between",
            activeTab === 'employees' 
              ? "bg-purple-900 text-white border-purple-900 shadow-md ring-2 ring-purple-600/30" 
              : "bg-white text-gray-900 border-gray-100 shadow-xs hover:border-purple-200 hover:bg-purple-50/30"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
              activeTab === 'employees' ? "bg-white/10 text-purple-200" : "bg-purple-50 text-purple-600"
            )}>
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <p className={cn("text-xs font-bold uppercase tracking-wider", activeTab === 'employees' ? "text-purple-200" : "text-gray-400")}>
                Personal de Empresa
              </p>
              <p className="text-2xl font-black mt-0.5">
                {employees.length}
              </p>
              <p className={cn("text-[11px] font-medium mt-0.5", activeTab === 'employees' ? "text-purple-200/80" : "text-gray-500")}>
                Choferes, Almacén, Ventas y Admin
              </p>
            </div>
          </div>
          <ChevronRight className={cn("w-5 h-5 shrink-0", activeTab === 'employees' ? "text-purple-300" : "text-gray-300")} />
        </button>

        <button
          onClick={() => { setActiveTab('clients'); setClientTypeFilter('all'); }}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between",
            activeTab === 'clients' 
              ? "bg-blue-900 text-white border-blue-900 shadow-md ring-2 ring-blue-600/30" 
              : "bg-white text-gray-900 border-gray-100 shadow-xs hover:border-blue-200 hover:bg-blue-50/30"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
              activeTab === 'clients' ? "bg-white/10 text-blue-200" : "bg-blue-50 text-blue-600"
            )}>
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className={cn("text-xs font-bold uppercase tracking-wider", activeTab === 'clients' ? "text-blue-200" : "text-gray-400")}>
                Clientes Registrados
              </p>
              <p className="text-2xl font-black mt-0.5">
                {clients.length}
              </p>
              <p className={cn("text-[11px] font-medium mt-0.5", activeTab === 'clients' ? "text-blue-200/80" : "text-gray-500")}>
                Particulares y Empresas
              </p>
            </div>
          </div>
          <ChevronRight className={cn("w-5 h-5 shrink-0", activeTab === 'clients' ? "text-blue-300" : "text-gray-300")} />
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center justify-between sm:col-span-2 lg:col-span-1",
            activeTab === 'all' 
              ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-600/30" 
              : "bg-white text-gray-900 border-gray-100 shadow-xs hover:border-slate-300 hover:bg-slate-50/30"
          )}
        >
          <div className="flex items-center gap-3.5">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
              activeTab === 'all' ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"
            )}>
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className={cn("text-xs font-bold uppercase tracking-wider", activeTab === 'all' ? "text-slate-300" : "text-gray-400")}>
                Total de Cuentas
              </p>
              <p className="text-2xl font-black mt-0.5">
                {users.length}
              </p>
              <p className={cn("text-[11px] font-medium mt-0.5", activeTab === 'all' ? "text-slate-300/80" : "text-gray-500")}>
                Base completa de usuarios
              </p>
            </div>
          </div>
          <ChevronRight className={cn("w-5 h-5 shrink-0", activeTab === 'all' ? "text-slate-300" : "text-gray-300")} />
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Tabs Selector */}
          <div className="flex items-center p-1 bg-gray-100/80 rounded-xl overflow-x-auto shrink-0">
            <button
              onClick={() => setActiveTab('employees')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                activeTab === 'employees' 
                  ? "bg-white text-purple-900 shadow-xs" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Personal Operativo ({employees.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('clients')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                activeTab === 'clients' 
                  ? "bg-white text-blue-900 shadow-xs" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Clientes ({clients.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0",
                activeTab === 'all' 
                  ? "bg-white text-gray-900 shadow-xs" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Todos ({users.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'employees' 
                  ? "Buscar empleado por nombre, correo, puesto..." 
                  : activeTab === 'clients' 
                  ? "Buscar cliente por nombre, teléfono, empresa..." 
                  : "Buscar usuario..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 transition-colors"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-filtros específicos por pestaña */}
        {activeTab === 'employees' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-gray-100">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Área:
            </span>
            {[
              { id: 'all', label: 'Todos los Puestos' },
              { id: 'Dirección', label: 'Dirección' },
              { id: 'Logística', label: 'Logística' },
              { id: 'Reparto', label: 'Reparto / Choferes' },
              { id: 'Almacén', label: 'Almacén & Jabas' },
              { id: 'Ventas', label: 'Ventas Mostrador' }
            ].map(area => (
              <button
                key={area.id}
                onClick={() => setEmployeeAreaFilter(area.id)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
                  employeeAreaFilter === area.id
                    ? "bg-purple-100 text-purple-800 border border-purple-200 font-black"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                {area.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 border-t border-gray-100">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Tipo:
            </span>
            {[
              { id: 'all', label: 'Todos los Clientes' },
              { id: 'client', label: 'Particulares' },
              { id: 'company', label: 'Empresas / Mayoristas' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setClientTypeFilter(type.id)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
                  clientTypeFilter === type.id
                    ? "bg-blue-100 text-blue-800 border border-blue-200 font-black"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid de Resultados */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-xs space-y-3">
          <div className="w-14 h-14 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center mx-auto">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">No se encontraron usuarios</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {searchTerm 
              ? `No hay coincidencias para "${searchTerm}". Intenta con otro término o limpia el buscador.`
              : 'No hay usuarios en esta categoría.'}
          </p>
          {searchTerm && (
            <Button variant="outline" size="sm" onClick={() => setSearchTerm('')} className="mt-2 text-xs">
              Limpiar búsqueda
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(u => {
            const roleInfo = ROLE_CONFIG[u.role] || ROLE_CONFIG.client;
            const RoleIcon = roleInfo.icon;
            const isEmp = roleInfo.category === 'employee';

            return (
              <div 
                key={u.uid} 
                className={cn(
                  "bg-white rounded-2xl p-4 border shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 group",
                  isEmp ? "border-purple-100/80 hover:border-purple-300" : "border-gray-100 hover:border-blue-200"
                )}
              >
                {/* Cabecera de la Tarjeta */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border",
                      isEmp 
                        ? "bg-purple-50 text-purple-700 border-purple-100" 
                        : u.role === 'company'
                        ? "bg-sky-50 text-sky-700 border-sky-100"
                        : "bg-gray-100 text-gray-700 border-gray-200"
                    )}>
                      {(u.name || u.email || 'U').charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-gray-950 text-sm leading-snug truncate">
                          {u.name || 'Usuario sin nombre'}
                        </h4>
                      </div>

                      <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </p>

                      {u.phone && (
                        <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>{u.phone}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Badge de Rol y Categoría */}
                <div className="pt-2 border-t border-gray-50 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border",
                      roleInfo.bgColor,
                      roleInfo.color,
                      roleInfo.borderColor
                    )}>
                      <RoleIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{roleInfo.label}</span>
                    </span>
                    
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                      {roleInfo.area}
                    </span>
                  </div>

                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedUser(u)}
                    className="h-8 px-2.5 text-xs font-semibold text-gray-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg flex items-center gap-1.5 shrink-0"
                    title="Modificar rol o permisos"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Asignación / Cambio de Rol */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              {/* Header Modal */}
              <div className="flex justify-between items-start pb-4 border-b border-gray-100">
                <div>
                  <h3 className="font-black text-lg text-gray-900">Gestionar Puesto / Rol</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Asigna permisos operativos o designa como cliente
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)} 
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info del usuario */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Usuario Seleccionado</p>
                <p className="font-black text-gray-900 text-sm">{selectedUser.name || 'Sin nombre asignado'}</p>
                <p className="text-xs text-gray-500 font-medium">{selectedUser.email}</p>
                {selectedUser.phone && (
                  <p className="text-xs text-gray-500 font-medium">Tel: {selectedUser.phone}</p>
                )}
                <div className="pt-2 flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 font-medium">Rol actual:</span>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded-md",
                    ROLE_CONFIG[selectedUser.role]?.bgColor || "bg-gray-100",
                    ROLE_CONFIG[selectedUser.role]?.color || "text-gray-700"
                  )}>
                    {ROLE_CONFIG[selectedUser.role]?.label || selectedUser.role}
                  </span>
                </div>
              </div>

              {/* Selector de Roles Agrupado */}
              <div className="space-y-4">
                {/* Grupo 1: Personal y Operación */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Briefcase className="w-3.5 h-3.5 text-purple-600" />
                    <p className="text-xs font-black text-purple-900 uppercase tracking-wider">
                      Personal Operativo de la Empresa
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {EMPLOYEE_ROLES.map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      const Icon = cfg.icon;
                      const isSelected = selectedUser.role === r;

                      return (
                        <button
                          key={r}
                          disabled={isUpdating}
                          onClick={() => updateUserRole(selectedUser.uid, r)}
                          className={cn(
                            "p-3 rounded-xl border text-left transition-all flex items-start gap-2.5",
                            isSelected 
                              ? "border-purple-600 bg-purple-50 ring-2 ring-purple-600/20" 
                              : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/20"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            cfg.bgColor,
                            cfg.color
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-bold leading-tight", isSelected ? "text-purple-950 font-black" : "text-gray-900")}>
                                {cfg.label}
                              </p>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                            </div>
                            <p className="text-[10px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
                              {cfg.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grupo 2: Clientes y Empresas */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 px-1">
                    <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-xs font-black text-blue-900 uppercase tracking-wider">
                      Clientes y Compradores
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CLIENT_ROLES.map((r) => {
                      const cfg = ROLE_CONFIG[r];
                      const Icon = cfg.icon;
                      const isSelected = selectedUser.role === r;

                      return (
                        <button
                          key={r}
                          disabled={isUpdating}
                          onClick={() => updateUserRole(selectedUser.uid, r)}
                          className={cn(
                            "p-3 rounded-xl border text-left transition-all flex items-start gap-2.5",
                            isSelected 
                              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/20" 
                              : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/20"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            cfg.bgColor,
                            cfg.color
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className={cn("text-xs font-bold leading-tight", isSelected ? "text-blue-950 font-black" : "text-gray-900")}>
                                {cfg.label}
                              </p>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                            </div>
                            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
                              {cfg.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botón Cerrar */}
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedUser(null)} 
                  className="w-full h-11 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
