/** Muestra las rondas, reproduce los fragmentos y presenta los resultados. */
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import {
  Encabezado,
  Tarjeta,
  Insignia,
  Boton,
  Icono,
  Metrica,
  Progreso,
  FormaOnda,
  Avatar,
  useEnVivo,
  useAccion,
  puntos,
} from '../componentes/comunes';
import { useAplicacion, navegar } from '../estado/contexto';
import type { EstadoPartida } from '../../compartido/tipos';
import { segundosRestantesRonda } from '../../compartido/reloj-partida';
import { pitidoCuentaRegresiva } from '../servicios/audio';

interface PistaBusquedaMusica {
  id: string;
  titulo: string;
  artista: string;
}

/** Ejecuta una partida con reloj del servidor, audio real y envío único por ronda. */
export function PaginaPartida({ id }: { id: string }): ReactNode {
  const { usuario, notificar, preferencias } = useAplicacion(),
    { ocupado, ejecutar } = useAccion(notificar);
  const {
    datos: partida,
    fijarDatos,
    error,
  } = useEnVivo<EstadoPartida>(`partida:${id}`, () => api(`/partidas/${id}`));
  const [respuesta, fijarRespuesta] = useState(''),
    [ahora, fijarAhora] = useState(Date.now()),
    [reproduciendo, fijarReproduciendo] = useState(false),
    [tiempoAudio, fijarTiempoAudio] = useState(0),
    [sugerencias, fijarSugerencias] = useState<PistaBusquedaMusica[]>([]),
    [busquedaAbierta, fijarBusquedaAbierta] = useState(false),
    [buscando, fijarBuscando] = useState(false),
    [idPistaMuestra, fijarIdPistaMuestra] = useState<string | null>(null),
    [muestraReproduciendo, fijarMuestraReproduciendo] = useState(false),
    [bloqueado, fijarBloqueado] = useState(false),
    [errorAudio, fijarErrorAudio] = useState(false),
    [confirmarSalida, fijarConfirmarSalida] = useState(false),
    [terminada, fijarTerminada] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    audioMuestra = useRef<HTMLAudioElement>(null),
    entrada = useRef<HTMLInputElement>(null),
    desfase = useRef(0),
    tiempoEnvio = useRef(-1);
  useEffect(() => {
    if (partida) desfase.current = partida.ahoraServidor - Date.now();
  }, [partida?.ahoraServidor]);
  const ronda = partida?.ronda,
    iniciadaEn = partida?.iniciadaEn;
  useEffect(() => {
    if (!iniciadaEn || partida?.respondida || partida?.estado !== 'en_curso') return;
    fijarAhora(Date.now());
    const temporizador = window.setInterval(() => fijarAhora(Date.now()), 100);
    return () => window.clearInterval(temporizador);
  }, [id, ronda, iniciadaEn, partida?.respondida, partida?.estado]);
  useEffect(() => {
    if (!partida) return;
    if (partida.estado === 'terminada') {
      navegar(`resultados/${id}`);
      return;
    }
    if (partida.estado === 'abandonada') {
      notificar('La partida fue abandonada.');
      navegar('inicio');
    }
  }, [partida?.estado, id, notificar]);
  useEffect(() => {
    fijarRespuesta('');
    fijarSugerencias([]);
    fijarBusquedaAbierta(false);
    audioMuestra.current?.pause();
    fijarIdPistaMuestra(null);
    fijarMuestraReproduciendo(false);
    fijarTiempoAudio(0);
    fijarReproduciendo(false);
    fijarTerminada(false);
    fijarBloqueado(false);
    fijarErrorAudio(false);
    tiempoEnvio.current = -1;
    if (!iniciadaEn) return;
    const temporizador = window.setTimeout(
      () => {
        entrada.current?.focus();
        if (preferencias.reproduccionAutomatica)
          void audio.current?.play().catch(() => fijarBloqueado(true));
      },
      Math.max(0, iniciadaEn - (Date.now() + desfase.current)),
    );
    return () => {
      window.clearTimeout(temporizador);
      audio.current?.pause();
    };
  }, [id, ronda, iniciadaEn, preferencias.reproduccionAutomatica]);
  useEffect(() => {
    if (audio.current) {
      audio.current.volume = ((preferencias.volumen / 100) * preferencias.musica) / 100;
      audio.current.playbackRate = 1;
    }
    if (audioMuestra.current)
      audioMuestra.current.volume = ((preferencias.volumen / 100) * preferencias.musica) / 100;
  }, [preferencias.volumen, preferencias.musica, ronda]);
  const restante = partida
    ? segundosRestantesRonda(partida, usuario.id, ahora + desfase.current)
    : 0;
  const esperando = partida ? ahora + desfase.current < partida.iniciadaEn : true;
  useEffect(() => {
    const termino = respuesta.trim();
    if (!busquedaAbierta || termino.length < 2 || !partida || esperando || partida.respondida) {
      fijarSugerencias([]);
      fijarBuscando(false);
      return;
    }
    let activo = true;
    const temporizador = window.setTimeout(() => {
      fijarBuscando(true);
      void api<{ pistas: PistaBusquedaMusica[] }>(`/musica/buscar?q=${encodeURIComponent(termino)}`)
        .then((resultado) => {
          if (activo) fijarSugerencias(resultado.pistas);
        })
        .catch(() => {
          if (activo) fijarSugerencias([]);
        })
        .finally(() => {
          if (activo) fijarBuscando(false);
        });
    }, 250);
    return () => {
      activo = false;
      window.clearTimeout(temporizador);
    };
  }, [respuesta, busquedaAbierta, partida?.respondida, partida?.estado, esperando]);
  const ultimoPitido = useRef('');
  useEffect(() => {
    const segundo = Math.ceil(restante),
      clave = `${ronda}:${segundo}`;
    if (
      preferencias.cuentaRegresiva &&
      !esperando &&
      !partida?.respondida &&
      segundo > 0 &&
      segundo <= 3 &&
      clave !== ultimoPitido.current
    ) {
      ultimoPitido.current = clave;
      pitidoCuentaRegresiva(((preferencias.volumen / 100) * preferencias.efectos) / 100);
    }
  }, [restante, esperando, partida?.respondida, ronda, preferencias]);
  useEffect(() => {
    if (
      !partida ||
      partida.estado !== 'en_curso' ||
      esperando ||
      restante > 0 ||
      partida.respondida ||
      ocupado ||
      tiempoEnvio.current === partida.ronda
    )
      return;
    tiempoEnvio.current = partida.ronda;
    void ejecutar(async () => {
      audio.current?.pause();
      audioMuestra.current?.pause();
      fijarBusquedaAbierta(false);
      fijarDatos(
        await api<EstadoPartida>(`/partidas/${id}/respuesta`, 'POST', {
          respuesta: '',
          ronda: partida.ronda,
        }),
      );
    });
  }, [partida, restante, esperando, ocupado, id, ejecutar, fijarDatos]);

  /** Envía una respuesta o un pase y detiene el audio hasta la siguiente ronda. */
  async function enviarFormulario(evento?: FormEvent, omitir = false): Promise<void> {
    evento?.preventDefault();
    if (!partida || partida.respondida) return;
    fijarBusquedaAbierta(false);
    audioMuestra.current?.pause();
    await ejecutar(async () => {
      const siguiente = await api<EstadoPartida>(`/partidas/${id}/respuesta`, 'POST', {
        respuesta: omitir ? '' : respuesta,
        ronda: partida.ronda,
      });
      audio.current?.pause();
      fijarDatos(siguiente);
    });
  }
  /** Reproduce una muestra de una coincidencia, respetando la sesión de audio del juego. */
  async function alternarMuestraBusqueda(pista: PistaBusquedaMusica): Promise<void> {
    const nodo = audioMuestra.current;
    if (!nodo) return;
    audio.current?.pause();
    if (idPistaMuestra === pista.id && muestraReproduciendo) {
      nodo.pause();
      return;
    }
    nodo.pause();
    nodo.src = `/api/musica/buscar/${encodeURIComponent(pista.id)}/audio`;
    nodo.currentTime = 0;
    fijarIdPistaMuestra(pista.id);
    try {
      await nodo.play();
    } catch {
      notificar('No se pudo reproducir la muestra de esta canción.');
    }
  }
  /** Alterna pausa y reproducción y respeta la restricción de no repetir el fragmento. */
  async function alternarAudio(): Promise<void> {
    if (!audio.current || !partida) return;
    if (reproduciendo) audio.current.pause();
    else {
      if (terminada) {
        audio.current.currentTime = partida.inicioAudio;
        fijarTerminada(false);
      }
      try {
        await audio.current.play();
        fijarBloqueado(false);
      } catch {
        fijarErrorAudio(true);
      }
    }
  }
  /** Confirma el abandono en el servidor y devuelve al menú. */
  async function salir(): Promise<void> {
    await api(`/partidas/${id}/abandonar`, 'POST');
    sessionStorage.removeItem('beat-partida');
    navegar('inicio');
  }
  if (!partida)
    return (
      <div className="loading" role="status">
        {error || 'Preparando el escenario…'}
      </div>
    );
  const yo = partida.jugadores.find((jugador) => jugador.id === usuario.id)!,
    propios = partida.resultados.filter((resultado) => resultado.usuarioId === usuario.id),
    resultado = propios.find((elemento) => elemento.ronda === partida.ronda),
    correcta = propios.filter((elemento) => elemento.correcta).length;
  const individual = partida.modo === 'individual';
  const puntuacion0 = partida.jugadores
      .filter((p) => p.equipo === 0)
      .reduce((suma, p) => suma + p.puntuacion, 0),
    puntuacion1 = partida.jugadores
      .filter((p) => p.equipo === 1)
      .reduce((suma, p) => suma + p.puntuacion, 0);
  return (
    <>
      <Encabezado
        antetitulo={
          individual
            ? 'Partida en curso'
            : `Ronda ${partida.ronda + 1} de ${partida.total} · ${partida.modo === 'equipos' ? 'Equipos 2 vs 2' : 'Duelo 1 vs 1'}`
        }
        titulo={
          individual
            ? `${partida.configuracion.genero === 'Todas' ? 'MIX DE MELODÍAS' : partida.configuracion.genero.toUpperCase()}`
            : partida.modo === 'equipos'
              ? 'BATALLA DE EQUIPOS'
              : 'DUELO EN DIRECTO'
        }
      />
      {!individual && (
        <div className="scoreboard">
          <div className="team-score">
            <span>
              <strong>
                {partida.modo === 'equipos'
                  ? 'EQUIPO 1'
                  : partida.jugadores.find((p) => p.equipo === 0)?.nombre}
              </strong>
              <small>
                {partida.jugadores
                  .filter((p) => p.equipo === 0)
                  .map((p) => p.nombre)
                  .join(' + ')}
              </small>
            </span>
            <strong>{puntos(puntuacion0)}</strong>
          </div>
          <div className="timer-box">
            <small>TIEMPO</small>
            <strong>{esperando ? '…' : restante.toFixed(1).padStart(4, '0')}</strong>
          </div>
          <div className="team-score purple">
            <strong>{puntos(puntuacion1)}</strong>
            <span>
              <strong>
                {partida.modo === 'equipos'
                  ? 'EQUIPO 2'
                  : partida.jugadores.find((p) => p.equipo === 1)?.nombre}
              </strong>
              <small>
                {partida.jugadores
                  .filter((p) => p.equipo === 1)
                  .map((p) => p.nombre)
                  .join(' + ')}
              </small>
            </span>
          </div>
        </div>
      )}
      <div className="split-layout">
        <div className="stack">
          <div className="round-top">
            <Progreso
              etiqueta={`Ronda ${partida.ronda + 1} de ${partida.total}`}
              valor={partida.ronda + 1}
              total={partida.total}
            />
            {individual && (
              <div className={`timer-box ${restante < 5 && !esperando ? 'urgent' : ''}`}>
                <Icono nombre="timer" />
                <strong>{esperando ? '…' : restante.toFixed(1).padStart(4, '0')}</strong>
              </div>
            )}
          </div>
          <Tarjeta className={`audio-card ${reproduciendo ? 'active' : ''}`}>
            <div className="row between">
              <div className="row gap">
                <button
                  className="audio-toggle"
                  onClick={() => void alternarAudio()}
                  disabled={esperando || partida.respondida}
                  aria-label={reproduciendo ? 'Pausar fragmento' : 'Reproducir fragmento'}
                >
                  <Icono nombre={reproduciendo ? 'pause' : 'play'} />
                </button>
                <div>
                  <h2>
                    FRAGMENTO{' '}
                    {individual ? `#${String(partida.ronda + 1).padStart(2, '0')}` : 'MISTERIOSO'}
                  </h2>
                  <small>
                    {esperando ? 'Prepárate, la ronda está por comenzar…' : 'Escucha con atención…'}
                  </small>
                </div>
              </div>
              <small>
                {Math.floor(tiempoAudio).toString().padStart(2, '0')} / 00:
                {String(partida.duracionAudio).padStart(2, '0')}
              </small>
            </div>
            <FormaOnda
              reproduciendo={reproduciendo}
              progreso={tiempoAudio / partida.duracionAudio}
            />
            <div className="row between audio-footer">
              <small className="cyan-text">
                ●{' '}
                {partida.respondida
                  ? 'RESPUESTA ENVIADA'
                  : esperando
                    ? 'PREPARANDO'
                    : reproduciendo
                      ? 'REPRODUCIENDO'
                      : terminada
                        ? 'FRAGMENTO FINALIZADO'
                        : 'EN PAUSA'}
              </small>
              <div className="row gap">
                <Icono nombre="volume" />
                <small>{preferencias.volumen}%</small>
              </div>
            </div>
            <audio
              ref={audio}
              src={`/api/partidas/${id}/audio?r=${partida.ronda}`}
              preload="auto"
              onLoadedMetadata={(evento) => {
                evento.currentTarget.currentTime = partida.inicioAudio;
              }}
              onPlay={() => {
                fijarReproduciendo(true);
              }}
              onPause={() => fijarReproduciendo(false)}
              onEnded={() => {
                fijarReproduciendo(false);
                fijarTerminada(true);
              }}
              onTimeUpdate={() => {
                const nodo = audio.current;
                if (!nodo) return;
                fijarTiempoAudio(Math.max(0, nodo.currentTime - partida.inicioAudio));
                if (nodo.currentTime >= partida.inicioAudio + partida.duracionAudio) {
                  nodo.pause();
                  fijarTerminada(true);
                }
              }}
              onError={() => fijarErrorAudio(true)}
            />
            {bloqueado && !partida.respondida && (
              <button className="text-button audio-notice" onClick={() => void alternarAudio()}>
                Pulsa reproducir para activar el audio
              </button>
            )}
            {errorAudio && (
              <p className="form-error">El audio no está disponible. Puedes pasar esta ronda.</p>
            )}
          </Tarjeta>
          <Tarjeta>
            <form onSubmit={(evento) => void enviarFormulario(evento)}>
              <h2 className="answer-title">¿QUÉ CANCIÓN ESTÁ SONANDO?</h2>
              <div className="answer-search">
                <div className="answer-row">
                  <div className="input-shell">
                    <Icono nombre="search" />
                    <input
                      ref={entrada}
                      aria-label="Tu respuesta"
                      aria-autocomplete="list"
                      aria-expanded={busquedaAbierta && sugerencias.length > 0}
                      aria-controls="music-search-results"
                      placeholder={
                        partida.configuracion.modoRespuesta === 'ambos'
                          ? 'Escribe canción o artista…'
                          : 'Escribe el nombre de la canción…'
                      }
                      value={respuesta}
                      onChange={(evento) => {
                        fijarRespuesta(evento.target.value);
                        fijarBusquedaAbierta(true);
                      }}
                      maxLength={200}
                      autoComplete="off"
                      disabled={ocupado || esperando || partida.respondida || restante <= 0}
                    />
                  </div>
                  <Boton
                    type="submit"
                    icono="send"
                    disabled={
                      ocupado ||
                      esperando ||
                      partida.respondida ||
                      !respuesta.trim() ||
                      restante <= 0
                    }
                  >
                    {ocupado ? 'Enviando…' : 'Enviar respuesta'}
                  </Boton>
                </div>
                {busquedaAbierta &&
                  respuesta.trim().length >= 2 &&
                  !esperando &&
                  !partida.respondida && (
                    <div
                      className="answer-suggestions"
                      id="music-search-results"
                      aria-label="Coincidencias musicales"
                    >
                      {buscando ? (
                        <p className="answer-search-message">Buscando canciones…</p>
                      ) : sugerencias.length > 0 ? (
                        sugerencias.map((pista) => (
                          <div className="answer-suggestion" key={pista.id}>
                            <button
                              type="button"
                              className="answer-suggestion-select"
                              onClick={() => {
                                fijarRespuesta(pista.titulo);
                                fijarBusquedaAbierta(false);
                                fijarSugerencias([]);
                              }}
                            >
                              <strong>{pista.titulo}</strong>
                              <small>{pista.artista}</small>
                            </button>
                            <button
                              type="button"
                              className="answer-suggestion-preview"
                              aria-label={`${idPistaMuestra === pista.id && muestraReproduciendo ? 'Pausar' : 'Previsualizar'} ${pista.titulo} de ${pista.artista}`}
                              title={
                                idPistaMuestra === pista.id && muestraReproduciendo
                                  ? 'Pausar muestra'
                                  : 'Previsualizar muestra'
                              }
                              onClick={() => void alternarMuestraBusqueda(pista)}
                            >
                              <Icono
                                nombre={
                                  idPistaMuestra === pista.id && muestraReproduciendo
                                    ? 'pause'
                                    : 'play'
                                }
                              />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="answer-search-message">
                          No encontramos canciones con ese nombre.
                        </p>
                      )}
                    </div>
                  )}
                <audio
                  ref={audioMuestra}
                  className="search-preview-audio"
                  preload="none"
                  onPlay={() => fijarMuestraReproduciendo(true)}
                  onPause={() => fijarMuestraReproduciendo(false)}
                  onEnded={() => fijarMuestraReproduciendo(false)}
                  onError={() => {
                    fijarMuestraReproduciendo(false);
                    notificar('La muestra de esta canción no está disponible.');
                  }}
                />
              </div>
              <div className="row between answer-footer">
                <small>Pulsa Enter para responder</small>
                {!partida.respondida && (
                  <button
                    type="button"
                    className="boton-pasar"
                    disabled={ocupado || esperando}
                    onClick={() => void enviarFormulario(undefined, true)}
                  >
                    Pasar ronda →
                  </button>
                )}
              </div>
            </form>
          </Tarjeta>
          {resultado && (
            <div className={`notice ${resultado.correcta ? 'success' : 'error'}`} role="status">
              <strong>
                {resultado.correcta
                  ? '¡Respuesta correcta!'
                  : resultado.respuesta
                    ? 'Esta vez no fue…'
                    : 'Ronda finalizada'}
              </strong>
              <span>
                {resultado.titulo} · {resultado.artista}
              </span>
              {resultado.urlFuente && (
                <small>
                  <a href={resultado.urlFuente} target="_blank" rel="noreferrer">
                    Artista y canción en Deezer ↗
                  </a>{' '}
                  ·{' '}
                  <a href={resultado.urlLicencia!} target="_blank" rel="noreferrer">
                    Condiciones del proveedor ↗
                  </a>
                </small>
              )}
              <small>
                {resultado.correcta
                  ? `+${puntos(resultado.puntos)} puntos · ${(resultado.transcurrido / 1000).toFixed(1)} s`
                  : '+0 puntos · ¡A por la siguiente!'}
              </small>
            </div>
          )}
          {partida.respondida &&
            (individual ? (
              <Boton
                icono="arrow"
                disabled={ocupado}
                onClick={() =>
                  void ejecutar(async () =>
                    fijarDatos(
                      await api<EstadoPartida>(`/partidas/${id}/siguiente`, 'POST', {
                        ronda: partida.ronda,
                      }),
                    ),
                  )
                }
              >
                {partida.ronda === partida.total - 1 ? 'Ver resultados' : 'Siguiente canción'}
              </Boton>
            ) : (
              <p className="subtle-note">
                Esperando a los demás. La siguiente ronda comienza automáticamente.
              </p>
            ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="stack">
          <Tarjeta>
            <small className="eyebrow muted">{individual ? 'PUNTUACIÓN' : 'TUS PUNTOS'}</small>
            <strong className="big-score cyan-text">{puntos(yo.puntuacion)}</strong>
            <div className="row between">
              <small>Precisión</small>
              <small className="green-text">
                {correcta}/{propios.length} ·{' '}
                {propios.length ? Math.round((correcta / propios.length) * 100) : 0}%
              </small>
            </div>
          </Tarjeta>
          {!individual && (
            <Tarjeta>
              <h2 className="card-heading">JUGADORES</h2>
              {partida.jugadores.map((jugador) => (
                <div className="player compact" key={jugador.id}>
                  <Avatar nombre={jugador.nombre} purple={jugador.equipo === 1} />
                  <span>
                    {jugador.nombre}
                    {jugador.id === usuario.id ? ' · Tú' : ''}
                  </span>
                  <strong className={jugador.equipo === 1 ? 'purple-text' : 'cyan-text'}>
                    {puntos(jugador.puntuacion)}
                  </strong>
                </div>
              ))}
            </Tarjeta>
          )}
          <Boton tono="ghost" icono="logout" onClick={() => fijarConfirmarSalida(true)}>
            Abandonar partida
          </Boton>
        </aside>
      </div>
      {confirmarSalida && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
          >
            <h2 id="leave-title">¿Abandonar la partida?</h2>
            <p>
              La sesión terminará{!individual ? ' para todos los participantes' : ''} y no contará
              como completada.
            </p>
            <div className="row gap">
              <Boton tono="ghost" onClick={() => fijarConfirmarSalida(false)}>
                Seguir jugando
              </Boton>
              <Boton tono="danger" disabled={ocupado} onClick={() => void ejecutar(salir)}>
                Abandonar
              </Boton>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/** Presenta los resultados definitivos del servidor, con estadísticas y tabla de respuestas reales. */
export function PaginaResultados({ id }: { id: string }): ReactNode {
  const { usuario, actualizar } = useAplicacion();
  const { datos: partida, error } = useEnVivo<EstadoPartida>(`partida:${id}`, () =>
    api(`/partidas/${id}`),
  );
  useEffect(() => {
    void actualizar().catch(() => {});
    sessionStorage.removeItem('beat-partida');
  }, [id, actualizar]);
  if (!partida) return <div className="loading">{error || 'Cargando resultados…'}</div>;
  if (partida.estado !== 'terminada')
    return (
      <Tarjeta>
        <h2>ESTA PARTIDA NO ESTÁ COMPLETADA</h2>
        <p>Vuelve a la partida para continuar.</p>
        <Boton onClick={() => navegar(`partida/${id}`)}>Continuar</Boton>
      </Tarjeta>
    );
  const propios = partida.resultados.filter((elemento) => elemento.usuarioId === usuario.id),
    correcta = propios.filter((elemento) => elemento.correcta),
    yo = partida.jugadores.find((jugador) => jugador.id === usuario.id)!;
  const total0 = partida.jugadores
      .filter((p) => p.equipo === 0)
      .reduce((suma, p) => suma + p.puntuacion, 0),
    total1 = partida.jugadores
      .filter((p) => p.equipo === 1)
      .reduce((suma, p) => suma + p.puntuacion, 0),
    empate = total0 === total1;
  const victoria = yo.equipo === 0 ? total0 >= total1 : total1 >= total0,
    individual = partida.modo === 'individual';
  // Nivel según la proporción de aciertos: en 10 rondas, 0–5 "No le sabes" (en rojo),
  // 6–8 Buen oído y 9–10 GOAT.
  const proporcionAciertos = partida.total ? correcta.length / partida.total : 0,
    nivel: { insignia: string; titulo: string; texto: string; claseTitulo?: string } =
      proporcionAciertos >= 0.9
        ? { insignia: 'Nivel leyenda', titulo: '¡ERES EL GOAT!', texto: 'Casi nada se te escapa.' }
        : proporcionAciertos > 0.5
          ? {
              insignia: 'Gran sesión',
              titulo: '¡BUEN OÍDO!',
              texto: 'Tu siguiente récord está a unas notas.',
            }
          : {
              insignia: 'Sigue practicando',
              titulo: 'NO LE SABES',
              texto: 'Escucha con atención y vuelve a intentarlo.',
              claseTitulo: 'titulo-fallo',
            };
  let racha = 0,
    mejor = 0;
  for (const resultado of propios) {
    racha = resultado.correcta ? racha + 1 : 0;
    mejor = Math.max(mejor, racha);
  }
  return (
    <>
      <Encabezado
        antetitulo={`Resultados · ${individual ? 'Un jugador' : partida.modo === 'duelo' ? 'Duelo 1 vs 1' : 'Equipos 2 vs 2'}`}
        titulo={
          individual
            ? 'SESIÓN COMPLETADA'
            : empate
              ? '¡EMPATE!'
              : victoria
                ? '¡VICTORIA!'
                : 'BIEN JUGADO'
        }
      />
      <div className="split-layout">
        <div className="stack">
          <Tarjeta className="result-hero">
            <div className="result-trophy">
              <Icono nombre={individual ? 'trophy' : 'crown'} />
            </div>
            <div>
              <Insignia tono="green">
                {individual ? nivel.insignia : victoria ? 'Gran partida' : 'Sigue practicando'}
              </Insignia>
              <h2 className={individual ? nivel.claseTitulo : undefined}>
                {individual
                  ? nivel.titulo
                  : partida.modo === 'equipos'
                    ? `EQUIPO ${total0 >= total1 ? '1' : '2'}`
                    : partida.jugadores.slice().sort((a, b) => b.puntuacion - a.puntuacion)[0]
                        .nombre}
              </h2>
              <p>{individual ? nivel.texto : 'Cada segundo y cada respuesta cuentan.'}</p>
            </div>
            <div className="result-score">
              <small>PUNTUACIÓN {individual ? 'FINAL' : 'PERSONAL'}</small>
              <strong>{puntos(yo.puntuacion)}</strong>
            </div>
          </Tarjeta>
          <div className="metrics three">
            <Metrica
              icono="correct"
              etiqueta="Precisión"
              valor={`${correcta.length}/${propios.length}`}
            />
            <Metrica
              icono="clock"
              etiqueta="Respuesta media"
              valor={`${propios.length ? (propios.reduce((suma, elemento) => suma + elemento.transcurrido, 0) / propios.length / 1000).toFixed(1) : '0'} s`}
            />
            <Metrica icono="flame" etiqueta="Mejor racha" valor={mejor} />
          </div>
          {!individual && (
            <div className="teams-result">
              {[0, 1].map((equipo) => (
                <Tarjeta key={equipo}>
                  <h2 className={equipo ? 'purple-text' : 'cyan-text'}>
                    {partida.modo === 'equipos' ? `EQUIPO ${equipo + 1}` : 'JUGADOR'} ·{' '}
                    {puntos(equipo ? total1 : total0)} pts
                  </h2>
                  {partida.jugadores
                    .filter((p) => p.equipo === equipo)
                    .map((jugador) => (
                      <div className="player" key={jugador.id}>
                        <Avatar nombre={jugador.nombre} purple={equipo === 1} />
                        <span>{jugador.nombre}</span>
                        <strong>{puntos(jugador.puntuacion)}</strong>
                      </div>
                    ))}
                </Tarjeta>
              ))}
            </div>
          )}
          <Tarjeta className="results-table">
            <div className="row between card-heading">
              <h2>RESUMEN DE RONDAS</h2>
              <small>Tu respuesta en cada fragmento</small>
            </div>
            {propios.map((elemento) => (
              <div className="result-row" key={elemento.ronda}>
                <span className="round-number">{String(elemento.ronda + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{elemento.titulo}</strong>
                  <small>{elemento.artista}</small>
                  {elemento.urlFuente && (
                    <small>
                      <a href={elemento.urlFuente} target="_blank" rel="noreferrer">
                        Créditos de artista y canción ↗
                      </a>{' '}
                      ·{' '}
                      <a href={elemento.urlLicencia!} target="_blank" rel="noreferrer">
                        Condiciones del proveedor ↗
                      </a>
                    </small>
                  )}
                  <small className="answer-detail">
                    Tu respuesta: {elemento.respuesta || 'Sin respuesta'}
                  </small>
                </div>
                <Insignia tono={elemento.correcta ? 'green' : 'pink'}>
                  {elemento.correcta ? 'CORRECTA' : 'INCORRECTA'}
                </Insignia>
                <strong className={elemento.correcta ? 'green-text' : 'muted'}>
                  +{puntos(elemento.puntos)}
                </strong>
              </div>
            ))}
          </Tarjeta>
        </div>
        <aside className="stack">
          <Tarjeta>
            <Insignia tono="purple">Resumen personal</Insignia>
            <h2 className="level-title">TU SESIÓN</h2>
            <p>Escucha, practica y descubre más melodías en tu próxima sesión.</p>
            <Progreso
              etiqueta="Canciones reconocidas"
              valor={correcta.length}
              total={propios.length || 1}
            />
          </Tarjeta>
          <Boton
            icono="rotate"
            onClick={() =>
              navegar(individual ? 'un-jugador' : partida.modo === 'duelo' ? 'duelo' : 'equipos')
            }
          >
            Jugar otra vez
          </Boton>
          {!individual && (
            <Boton
              tono="secondary"
              icono="users"
              onClick={() => navegar(partida.modo === 'duelo' ? 'duelo' : 'equipos')}
            >
              Nueva sala
            </Boton>
          )}
          <Boton tono="secondary" icono="home" onClick={() => navegar('inicio')}>
            Volver al inicio
          </Boton>
        </aside>
      </div>
    </>
  );
}
