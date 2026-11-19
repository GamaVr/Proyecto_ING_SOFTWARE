import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { api } from './api';
import { useApp } from './contexto';
import { useLive } from './componentes';
import type { SocialSnapshot } from '../shared/tipos';

interface SocialState {
  data: SocialSnapshot | null;
  error: string;
  refresh: () => Promise<void>;
}
const SocialContext = createContext<SocialState | null>(null);

/** Mantiene un único buzón personal activo en todas las pantallas, incluso dentro de una partida. */
export function SocialProvider({ children }: { children: ReactNode }): ReactNode {
  const { user, notify } = useApp();
  const { data, setData, error } = useLive<SocialSnapshot>(`user:${user.id}`, () => api('/social'));
  const seen = useRef<Set<string> | null>(null);
  const refresh = useCallback(async (): Promise<void> => {
    setData(await api<SocialSnapshot>('/social'));
  }, [setData]);
  useEffect(() => {
    if (!data) return;
    const current = new Set(data.invitations.map((invitation) => invitation.id));
    if (seen.current)
      for (const invitation of data.invitations) {
        if (!seen.current.has(invitation.id))
          notify(
            `${invitation.sender.name} te invitó a ${invitation.mode === 'duel' ? 'un duelo 1 vs 1' : 'equipos 2 vs 2'}. Revisa Amigos.`,
          );
      }
    seen.current = current;
  }, [data, notify]);
  return (
    <SocialContext.Provider value={{ data, error, refresh }}>{children}</SocialContext.Provider>
  );
}

/** Comparte amigos y notificaciones sin abrir una conexión adicional por cada componente. */
export function useSocial(): SocialState {
  const context = useContext(SocialContext);
  if (!context) throw new Error('Falta el proveedor de amigos.');
  return context;
}

/** Señala solicitudes e invitaciones pendientes desde la navegación principal. */
export function FriendNavBadge(): ReactNode {
  const { data } = useSocial();
  const count = (data?.incomingRequests.length || 0) + (data?.invitations.length || 0);
  return count ? (
    <span className="social-count" aria-label={`${count} solicitudes e invitaciones pendientes`}>
      {count > 9 ? '9+' : count}
    </span>
  ) : null;
}
