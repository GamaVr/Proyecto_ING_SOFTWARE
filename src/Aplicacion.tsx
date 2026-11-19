/** Coordina las pantallas, la sesión y la navegación principal. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './servicios/api';
import { AppContext, navigate } from './estado/contexto';
import { Ambient, Avatar, Brand, Icon, Button } from './componentes/comunes';
import { AuthPage } from './paginas/Acceso';
import { HomePage } from './paginas/Inicio';
import { SetupPage } from './paginas/PrepararPartida';
import { GamePage, ResultsPage } from './paginas/Partida';
import { MultiplayerPage, LobbyPage } from './paginas/Multijugador';
import { SettingsPage } from './paginas/Opciones';
import { FriendsPage } from './paginas/Amigos';
import { SocialProvider, FriendNavBadge } from './estado/social';
import { DEFAULT_SETTINGS, type User, type Stats, type Settings } from '../compartido/tipos';

const initialStats: Stats = {
  played: 0,
  bestScore: 0,
  bestStreak: 0,
};

/** Coordina sesión, rutas copiables, preferencias globales y notificaciones de la aplicación. */
export function App(): ReactNode {
  const [path, setPath] = useState(window.location.hash.slice(2) || 'inicio'),
    [user, setUser] = useState<User | null>(null),
    [stats, setStats] = useState(initialStats),
    [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS),
    [ready, setReady] = useState(false),
    [serverError, setServerError] = useState(''),
    [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  /** Refresca el perfil y las métricas después de completar partidas o cambiar el nombre. */
  const refresh = useCallback(async (): Promise<void> => {
    const result = await api<{ user: User; stats: Stats }>('/me');
    setUser(result.user);
    setStats(result.stats);
  }, []);
  /** Revoca la cookie en el servidor y devuelve al acceso sin conservar credenciales. */
  const logout = useCallback(async (): Promise<void> => {
    await api('/auth/logout', 'POST');
    setUser(null);
    setStats(initialStats);
    setSettings(DEFAULT_SETTINGS);
    navigate('login');
  }, []);
  useEffect(() => {
    const listener = (): void => {
      setPath(window.location.hash.slice(2) || 'inicio');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void api<{ user: User; stats: Stats }>('/me')
      .then((result) => {
        if (!cancelled) {
          setUser(result.user);
          setStats(result.stats);
        }
      })
      .catch((error) => {
        if (!cancelled && (!(error instanceof ApiError) || error.status !== 401))
          setServerError(error.message);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void api<{ settings: Settings }>('/settings')
      .then((result) => {
        if (!cancelled) setSettings(result.settings);
      })
      .catch((error) => notify(error.message));
    void refresh().catch((error) => notify(error.message));
    return () => {
      cancelled = true;
    };
  }, [user?.id, refresh, notify]);
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', settings.contrast);
    document.documentElement.classList.toggle('large-interface', settings.largeInterface);
  }, [settings.contrast, settings.largeInterface]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  /** Conserva una invitación pendiente al entrar y abre el inicio para rutas de autenticación. */
  function onLogin(profile: User): void {
    setUser(profile);
    setServerError('');
    if (['inicio', 'login', 'registro'].includes(path)) navigate('inicio');
  }
  if (!ready)
    return (
      <div className="app-loading">
        <Brand />
        <p>Preparando el escenario…</p>
      </div>
    );
  if (!user)
    return (
      <AuthPage onLogin={onLogin} initialRegister={path === 'registro'} serverError={serverError} />
    );
  const [page, parameter] = path.split('/'),
    active = ['partida', 'resultados'].includes(page)
      ? 'un-jugador'
      : ['sala', 'duelo', 'duelo-invitacion', 'equipos'].includes(page)
        ? 'multijugador'
        : page;
  let content: ReactNode;
  switch (page) {
    case 'inicio':
    case 'login':
    case 'registro':
      content = <HomePage />;
      break;
    case 'un-jugador':
      content = <SetupPage />;
      break;
    case 'duelo':
    case 'duelo-invitacion':
      content = <MultiplayerPage key="duel" mode="duel" />;
      break;
    case 'equipos':
    case 'multijugador':
      content = <MultiplayerPage key="teams" mode="teams" />;
      break;
    case 'sala':
      content = /^[A-Z0-9]{6}$/.test(parameter || '') ? (
        <LobbyPage key={parameter} code={parameter} />
      ) : (
        <NotFound />
      );
      break;
    case 'partida':
      content = /^[a-f0-9-]{36}$/.test(parameter || '') ? (
        <GamePage key={parameter} id={parameter} />
      ) : (
        <NotFound />
      );
      break;
    case 'resultados':
      content = /^[a-f0-9-]{36}$/.test(parameter || '') ? (
        <ResultsPage key={parameter} id={parameter} />
      ) : (
        <NotFound />
      );
      break;
    case 'amigos':
      content = <FriendsPage />;
      break;
    case 'opciones':
      content = <SettingsPage tab={parameter} />;
      break;
    default:
      content = <NotFound />;
  }
  return (
    <AppContext.Provider value={{ user, stats, settings, setSettings, refresh, notify, logout }}>
      <SocialProvider key={user.id}>
        <div className="application">
          <Ambient />
          <header className="topbar">
            <Brand />
            <nav className="main-nav" aria-label="Navegación principal">
              {[
                { route: 'inicio', label: 'Inicio', icon: 'home' },
                { route: 'un-jugador', label: 'Un jugador', icon: 'headphones' },
                { route: 'equipos', active: 'multijugador', label: 'Multijugador', icon: 'users' },
                { route: 'amigos', label: 'Amigos', icon: 'users' },
                { route: 'opciones', label: 'Opciones', icon: 'settings' },
              ].map((item) => {
                const selected = active === (item.active || item.route);
                return (
                  <a
                    key={item.route}
                    href={`#/${item.route}`}
                    className={selected ? 'active' : ''}
                    aria-current={selected ? 'page' : undefined}
                  >
                    <Icon name={selected ? `${item.icon}Active` : item.icon} />
                    <span>{item.label}</span>
                    {item.route === 'amigos' && <FriendNavBadge />}
                  </a>
                );
              })}
            </nav>
            <a className="profile" href="#/opciones/cuenta">
              <Avatar name={user.name} purple />
              <strong>{user.name}</strong>
            </a>
          </header>
          <main className="page-content" key={page === 'sala' ? path : undefined}>
            {content}
          </main>
          {toast && (
            <div className="toast" role="status">
              <Icon name="info" />
              <span>{toast}</span>
              <button aria-label="Cerrar notificación" onClick={() => setToast('')}>
                ×
              </button>
            </div>
          )}
        </div>
      </SocialProvider>
    </AppContext.Provider>
  );
}

/** Ofrece una salida clara ante enlaces inexistentes o parámetros de ruta inválidos. */
function NotFound(): ReactNode {
  return (
    <div className="empty-state">
      <h1>ESTE ESCENARIO NO EXISTE</h1>
      <p>El enlace puede estar incompleto. Vuelve al inicio y elige cómo quieres jugar.</p>
      <Button onClick={() => navigate('inicio')}>Volver al inicio</Button>
    </div>
  );
}
