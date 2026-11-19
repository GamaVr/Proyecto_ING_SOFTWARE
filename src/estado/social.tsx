import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { api } from '../servicios/api';
import { useAplicacion } from './contexto';
import { useEnVivo } from '../componentes/comunes';
import type { EstadoSocial } from '../../compartido/tipos';

interface ValorContextoSocial {
  datos: EstadoSocial | null;
  error: string;
  actualizar: () => Promise<void>;
}
const ContextoSocial = createContext<ValorContextoSocial | null>(null);

/** Mantiene un único buzón personal activo en todas las pantallas, incluso dentro de una partida. */
export function ProveedorSocial({ children }: { children: ReactNode }): ReactNode {
  const { usuario, notificar } = useAplicacion();
  const { datos, fijarDatos, error } = useEnVivo<EstadoSocial>(`usuario:${usuario.id}`, () =>
    api('/social'),
  );
  const vistos = useRef<Set<string> | null>(null);
  const actualizar = useCallback(async (): Promise<void> => {
    fijarDatos(await api<EstadoSocial>('/social'));
  }, [fijarDatos]);
  useEffect(() => {
    if (!datos) return;
    const actual = new Set(datos.invitaciones.map((invitacion) => invitacion.id));
    if (vistos.current)
      for (const invitacion of datos.invitaciones) {
        if (!vistos.current.has(invitacion.id))
          notificar(
            `${invitacion.remitente.nombre} te invitó a ${invitacion.modo === 'duelo' ? 'un duelo 1 vs 1' : 'equipos 2 vs 2'}. Revisa Amigos.`,
          );
      }
    vistos.current = actual;
  }, [datos, notificar]);
  return (
    <ContextoSocial.Provider value={{ datos, error, actualizar }}>
      {children}
    </ContextoSocial.Provider>
  );
}

/** Comparte amigos y notificaciones sin abrir una conexión adicional por cada componente. */
export function useSocial(): ValorContextoSocial {
  const contexto = useContext(ContextoSocial);
  if (!contexto) throw new Error('Falta el proveedor de amigos.');
  return contexto;
}

/** Señala solicitudes e invitaciones pendientes desde la navegación principal. */
export function InsigniaAmigosNavegacion(): ReactNode {
  const { datos } = useSocial();
  const cantidad = (datos?.solicitudesRecibidas.length || 0) + (datos?.invitaciones.length || 0);
  return cantidad ? (
    <span className="social-count" aria-label={`${cantidad} solicitudes e invitaciones pendientes`}>
      {cantidad > 9 ? '9+' : cantidad}
    </span>
  ) : null;
}
