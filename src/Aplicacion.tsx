/** Coordina las pantallas, la sesión y la navegación principal. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ErrorApi } from './servicios/api';
import { ContextoAplicacion, navegar } from './estado/contexto';
import { Ambiente, Avatar, Marca, Icono, Boton } from './componentes/comunes';
import { PaginaAcceso } from './paginas/Acceso';
import { PaginaInicio } from './paginas/Inicio';
import { PaginaPrepararPartida } from './paginas/PrepararPartida';
import { PaginaPartida, PaginaResultados } from './paginas/Partida';
import { PaginaMultijugador, PaginaSalaEspera } from './paginas/Multijugador';
import { PaginaOpciones } from './paginas/Opciones';
import { PaginaAmigos } from './paginas/Amigos';
import { ProveedorSocial, InsigniaAmigosNavegacion } from './estado/social';
import {
  PREFERENCIAS_PREDETERMINADAS,
  type Usuario,
  type Estadisticas,
  type Preferencias,
} from '../compartido/tipos';

const estadisticasIniciales: Estadisticas = {
  jugadas: 0,
  mejorPuntuacion: 0,
  mejorRacha: 0,
};

/** Coordina sesión, rutas copiables, preferencias globales y notificaciones de la aplicación. */
export function Aplicacion(): ReactNode {
  const [ruta, fijarRuta] = useState(window.location.hash.slice(2) || 'inicio'),
    [usuario, fijarUsuario] = useState<Usuario | null>(null),
    [estadisticas, fijarEstadisticas] = useState(estadisticasIniciales),
    [preferencias, fijarPreferencias] = useState<Preferencias>(PREFERENCIAS_PREDETERMINADAS),
    [listo, fijarListo] = useState(false),
    [errorServidor, fijarErrorServidor] = useState(''),
    [aviso, fijarAviso] = useState('');
  const notificar = useCallback((mensaje: string) => fijarAviso(mensaje), []);
  /** Refresca el perfil y las métricas después de completar partidas o cambiar el nombre. */
  const actualizar = useCallback(async (): Promise<void> => {
    const resultado = await api<{ usuario: Usuario; estadisticas: Estadisticas }>('/perfil');
    fijarUsuario(resultado.usuario);
    fijarEstadisticas(resultado.estadisticas);
  }, []);
  /** Revoca la cookie en el servidor y devuelve al acceso sin conservar credenciales. */
  const cerrarSesion = useCallback(async (): Promise<void> => {
    await api('/autenticacion/cerrar-sesion', 'POST');
    fijarUsuario(null);
    fijarEstadisticas(estadisticasIniciales);
    fijarPreferencias(PREFERENCIAS_PREDETERMINADAS);
    navegar('login');
  }, []);
  useEffect(() => {
    const oyente = (): void => {
      fijarRuta(window.location.hash.slice(2) || 'inicio');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', oyente);
    return () => window.removeEventListener('hashchange', oyente);
  }, []);
  useEffect(() => {
    let cancelado = false;
    void api<{ usuario: Usuario; estadisticas: Estadisticas }>('/perfil')
      .then((resultado) => {
        if (!cancelado) {
          fijarUsuario(resultado.usuario);
          fijarEstadisticas(resultado.estadisticas);
        }
      })
      .catch((error) => {
        if (!cancelado && (!(error instanceof ErrorApi) || error.estado !== 401))
          fijarErrorServidor(error.message);
      })
      .finally(() => {
        if (!cancelado) fijarListo(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);
  useEffect(() => {
    if (!usuario) return;
    let cancelado = false;
    void api<{ preferencias: Preferencias }>('/preferencias')
      .then((resultado) => {
        if (!cancelado) fijarPreferencias(resultado.preferencias);
      })
      .catch((error) => notificar(error.message));
    void actualizar().catch((error) => notificar(error.message));
    return () => {
      cancelado = true;
    };
  }, [usuario?.id, actualizar, notificar]);
  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', preferencias.altoContraste);
    document.documentElement.classList.toggle('large-interface', preferencias.interfazGrande);
  }, [preferencias.altoContraste, preferencias.interfazGrande]);
  useEffect(() => {
    if (!aviso) return;
    const temporizador = window.setTimeout(() => fijarAviso(''), 5000);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);
  /** Conserva una invitación pendiente al entrar y abre el inicio para rutas de autenticación. */
  function alIniciarSesion(perfil: Usuario): void {
    fijarUsuario(perfil);
    fijarErrorServidor('');
    if (['inicio', 'login', 'registro'].includes(ruta)) navegar('inicio');
  }
  if (!listo)
    return (
      <div className="app-loading">
        <Marca />
        <p>Preparando el escenario…</p>
      </div>
    );
  if (!usuario)
    return (
      <PaginaAcceso
        alIniciarSesion={alIniciarSesion}
        registroInicial={ruta === 'registro'}
        errorServidor={errorServidor}
      />
    );
  const [pagina, parametro] = ruta.split('/'),
    activo = ['partida', 'resultados'].includes(pagina)
      ? 'un-jugador'
      : ['sala', 'duelo', 'duelo-invitacion', 'equipos'].includes(pagina)
        ? 'multijugador'
        : pagina;
  let contenido: ReactNode;
  switch (pagina) {
    case 'inicio':
    case 'login':
    case 'registro':
      contenido = <PaginaInicio />;
      break;
    case 'un-jugador':
      contenido = <PaginaPrepararPartida />;
      break;
    case 'duelo':
    case 'duelo-invitacion':
      contenido = <PaginaMultijugador key="duelo" modo="duelo" />;
      break;
    case 'equipos':
    case 'multijugador':
      contenido = <PaginaMultijugador key="equipos" modo="equipos" />;
      break;
    case 'sala':
      contenido = /^[A-Z0-9]{6}$/.test(parametro || '') ? (
        <PaginaSalaEspera key={parametro} codigo={parametro} />
      ) : (
        <NoEncontrado />
      );
      break;
    case 'partida':
      contenido = /^[a-f0-9-]{36}$/.test(parametro || '') ? (
        <PaginaPartida key={parametro} id={parametro} />
      ) : (
        <NoEncontrado />
      );
      break;
    case 'resultados':
      contenido = /^[a-f0-9-]{36}$/.test(parametro || '') ? (
        <PaginaResultados key={parametro} id={parametro} />
      ) : (
        <NoEncontrado />
      );
      break;
    case 'amigos':
      contenido = <PaginaAmigos />;
      break;
    case 'opciones':
      contenido = <PaginaOpciones pestana={parametro} />;
      break;
    default:
      contenido = <NoEncontrado />;
  }
  return (
    <ContextoAplicacion.Provider
      value={{
        usuario,
        estadisticas,
        preferencias,
        fijarPreferencias,
        actualizar,
        notificar,
        cerrarSesion,
      }}
    >
      <ProveedorSocial key={usuario.id}>
        <div className="application">
          <Ambiente />
          <header className="topbar">
            <Marca />
            <nav className="main-nav" aria-label="Navegación principal">
              {[
                { rutaDestino: 'inicio', etiqueta: 'Inicio', icono: 'home' },
                { rutaDestino: 'un-jugador', etiqueta: 'Un jugador', icono: 'headphones' },
                {
                  rutaDestino: 'equipos',
                  activo: 'multijugador',
                  etiqueta: 'Multijugador',
                  icono: 'users',
                },
                { rutaDestino: 'amigos', etiqueta: 'Amigos', icono: 'users' },
                { rutaDestino: 'opciones', etiqueta: 'Opciones', icono: 'settings' },
              ].map((elemento) => {
                const seleccionado = activo === (elemento.activo || elemento.rutaDestino);
                return (
                  <a
                    key={elemento.rutaDestino}
                    href={`#/${elemento.rutaDestino}`}
                    className={seleccionado ? 'active' : ''}
                    aria-current={seleccionado ? 'page' : undefined}
                  >
                    <Icono nombre={seleccionado ? `${elemento.icono}Active` : elemento.icono} />
                    <span>{elemento.etiqueta}</span>
                    {elemento.rutaDestino === 'amigos' && <InsigniaAmigosNavegacion />}
                  </a>
                );
              })}
            </nav>
            <a className="profile" href="#/opciones/cuenta">
              <Avatar nombre={usuario.nombre} purple />
              <strong>{usuario.nombre}</strong>
            </a>
          </header>
          <main className="page-content" key={pagina === 'sala' ? ruta : undefined}>
            {contenido}
          </main>
          {aviso && (
            <div className="toast" role="status">
              <Icono nombre="info" />
              <span>{aviso}</span>
              <button aria-label="Cerrar notificación" onClick={() => fijarAviso('')}>
                ×
              </button>
            </div>
          )}
        </div>
      </ProveedorSocial>
    </ContextoAplicacion.Provider>
  );
}

/** Ofrece una salida clara ante enlaces inexistentes o parámetros de ruta inválidos. */
function NoEncontrado(): ReactNode {
  return (
    <div className="empty-state">
      <h1>ESTE ESCENARIO NO EXISTE</h1>
      <p>El enlace puede estar incompleto. Vuelve al inicio y elige cómo quieres jugar.</p>
      <Boton onClick={() => navegar('inicio')}>Volver al inicio</Boton>
    </div>
  );
}
