/** Comparte la sesión y las preferencias entre los componentes. */
import { createContext, useContext } from 'react';
import type { User, Stats, Settings } from '../shared/tipos';

interface AppContextValue {
  user: User;
  stats: Stats;
  settings: Settings;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
  setSettings: (settings: Settings) => void;
  logout: () => Promise<void>;
}
export const AppContext = createContext<AppContextValue | null>(null);

/** Entrega la sesión compartida y falla claramente si un componente se monta fuera del proveedor. */
export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('Falta el proveedor de la aplicación.');
  return context;
}

/** Cambia la ruta de la SPA manteniendo enlaces copiables y navegación del navegador. */
export function navigate(route: string): void {
  window.location.hash = `/${route}`;
}
