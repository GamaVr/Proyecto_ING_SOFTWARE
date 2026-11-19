/** Comparte la sesión y las preferencias entre los componentes. */
import { createContext, useContext } from 'react';
import type { Usuario, Estadisticas, Preferencias } from '../../compartido/tipos';

interface ValorContextoAplicacion {
  usuario: Usuario;
  estadisticas: Estadisticas;
  preferencias: Preferencias;
  notificar: (mensaje: string) => void;
  actualizar: () => Promise<void>;
  fijarPreferencias: (preferencias: Preferencias) => void;
  cerrarSesion: () => Promise<void>;
}
export const ContextoAplicacion = createContext<ValorContextoAplicacion | null>(null);

/** Entrega la sesión compartida y falla claramente si un componente se monta fuera del proveedor. */
export function useAplicacion(): ValorContextoAplicacion {
  const contexto = useContext(ContextoAplicacion);
  if (!contexto) throw new Error('Falta el proveedor de la aplicación.');
  return contexto;
}

/** Cambia la ruta de la SPA manteniendo enlaces copiables y navegación del navegador. */
export function navegar(rutaDestino: string): void {
  window.location.hash = `/${rutaDestino}`;
}
