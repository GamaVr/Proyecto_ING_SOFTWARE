/** Configura género, rondas y tiempo del modo individual. */
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../servicios/api';
import {
  Encabezado,
  Tarjeta,
  Icono,
  Insignia,
  Boton,
  Metrica,
  useAccion,
  puntos,
} from '../componentes/comunes';
import { useAplicacion, navegar } from '../estado/contexto';
import { useOpcionesMusica } from '../servicios/musica';
import {
  CONFIGURACION_PREDETERMINADA,
  type ConfiguracionPartida,
  type EstadoPartida,
} from '../../compartido/tipos';

/** Controla filtros y rondas y crea una partida individual persistida. */
export function PaginaPrepararPartida(): ReactNode {
  const { opciones, error, cargando } = useOpcionesMusica();
  const { notificar, estadisticas } = useAplicacion();
  const { ocupado, ejecutar } = useAccion(notificar);
  const [configuracion, fijarConfiguracion] = useState<ConfiguracionPartida>(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem('beat-configuracion') || '{}');
      delete guardado.decade;
      return { ...CONFIGURACION_PREDETERMINADA, ...guardado };
    } catch {
      return CONFIGURACION_PREDETERMINADA;
    }
  });
  useEffect(() => {
    if (cargando || error) return;
    fijarConfiguracion((actual) => ({
      ...actual,
      genero:
        actual.genero === 'Todas' ||
        opciones.generos.some((elemento) => elemento.nombre === actual.genero)
          ? actual.genero
          : 'Todas',
      segundos: [20, 30].includes(actual.segundos)
        ? actual.segundos
        : CONFIGURACION_PREDETERMINADA.segundos,
    }));
  }, [cargando, error, opciones]);
  /** Actualiza un campo tipado y recuerda solo preferencias, nunca credenciales o puntuaciones. */
  function modificar<K extends keyof ConfiguracionPartida>(
    clave: K,
    valor: ConfiguracionPartida[K],
  ): void {
    fijarConfiguracion((actual) => ({ ...actual, [clave]: valor }));
  }
  /** Pide al servidor que elija canciones y prepare la primera ronda. */
  async function comenzar(): Promise<void> {
    localStorage.setItem('beat-configuracion', JSON.stringify(configuracion));
    const partida = await api<EstadoPartida>('/partidas', 'POST', configuracion);
    sessionStorage.setItem('beat-partida', partida.id);
    navegar(`partida/${partida.id}`);
  }
  return (
    <>
      <Encabezado antetitulo="Modo un jugador" titulo="PREPARA TU SESIÓN" />
      <div className="split-layout">
        <div className="stack">
          <Tarjeta>
            <div className="row between card-heading">
              <div>
                <h2>CONFIGURA LA PARTIDA</h2>
                <p>Elige el terreno de juego que mejor suena contigo.</p>
              </div>
              <Insignia icono="trophy">Récord: {puntos(estadisticas.mejorPuntuacion)}</Insignia>
            </div>
            <div className="config-grid">
              <label className="select-field">
                <Icono nombre="disc" />
                <span>
                  <small>GÉNERO</small>
                  <select
                    value={configuracion.genero}
                    onChange={(e) =>
                      modificar('genero', e.target.value as ConfiguracionPartida['genero'])
                    }
                  >
                    <option>Todas</option>
                    {opciones.generos.map((genero) => (
                      <option key={genero.nombre} value={genero.nombre}>
                        {genero.nombre}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icono nombre="list" />
                <span>
                  <small>NÚMERO DE RONDAS</small>
                  <select
                    value={configuracion.rondas}
                    onChange={(e) => modificar('rondas', Number(e.target.value))}
                  >
                    <option value={5}>5 canciones</option>
                    <option value={8}>8 canciones</option>
                    <option value={10}>10 canciones</option>
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icono nombre="timer" />
                <span>
                  <small>TIEMPO POR RONDA</small>
                  <select
                    value={configuracion.segundos}
                    onChange={(e) => modificar('segundos', Number(e.target.value))}
                  >
                    {[20, 30].map((segundos) => (
                      <option key={segundos} value={segundos}>
                        {segundos} segundos
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icono nombre="text" />
                <span>
                  <small>TIPO DE RESPUESTA</small>
                  <select
                    value={configuracion.modoRespuesta}
                    onChange={(e) =>
                      modificar(
                        'modoRespuesta',
                        e.target.value as ConfiguracionPartida['modoRespuesta'],
                      )
                    }
                  >
                    <option value="ambos">Canción o artista</option>
                    <option value="titulo">Solo canción</option>
                  </select>
                </span>
              </label>
            </div>
          </Tarjeta>
          {error && <p className="subtle-note">{error}</p>}
        </div>
        <aside className="stack">
          <Tarjeta className="preview-card">
            <Insignia>Vista previa</Insignia>
            <div className="metrics two plain">
              <Metrica
                etiqueta="Duración"
                valor={`~${Math.max(1, Math.ceil((configuracion.rondas * (configuracion.segundos + 4)) / 60))} min`}
                cyan
              />
            </div>
            <Boton
              icono="play"
              disabled={ocupado || cargando || !!error}
              onClick={() => void ejecutar(comenzar)}
            >
              {ocupado ? 'Preparando…' : 'Comenzar partida'}
            </Boton>
          </Tarjeta>
          <p className="subtle-note">Consejo: cuanto antes respondas, más puntos sumarás.</p>
        </aside>
      </div>
    </>
  );
}
