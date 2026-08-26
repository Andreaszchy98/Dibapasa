import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, RotateCcw, Settings, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Button } from '../../components/ui';
import { cn } from '../../components/ui';
import { UserProfile } from '../../types';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  client: 'Cliente',
  company: 'Empresa',
  dispatcher: 'Despachador',
  preparer: 'Preparador',
  driver: 'Conductor',
  loader: 'Cargador',
  store_sales: 'Cajero',
  inventory: 'Inventarios',
  karey_inventory: 'Inv. Jabas Karey'
};

export function AdminUsersView({ users, onBack, onRefresh }: { users: UserProfile[]; onBack: () => void; onRefresh?: () => void }) {
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
                    u.role === 'loader' ? "bg-amber-100 text-amber-700" :
                    u.role === 'store_sales' ? "bg-emerald-100 text-emerald-700" :
                    u.role === 'company' ? "bg-blue-50 text-blue-600" :
                    "bg-gray-100 text-gray-600"
                  )}>
                    {ROLE_LABELS[u.role] || u.role}
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
                    {(['client', 'company', 'dispatcher', 'preparer', 'driver', 'loader', 'store_sales', 'inventory', 'karey_inventory', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => updateUserRole(selectedUser.uid, r)}
                        className={cn(
                          "py-3 px-4 rounded-xl border-2 text-xs font-bold transition-all",
                          selectedUser.role === r ? "border-[#0056b3] bg-blue-50 text-[#0056b3]" : "border-gray-100 text-gray-500 hover:border-gray-200"
                        )}
                      >
                        {ROLE_LABELS[r] || r}
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
