/** Permite crear salas, unirse y preparar duelos o equipos. */
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import {
  Encabezado,
  Tarjeta,
  Insignia,
  Boton,
  Icono,
  Avatar,
  useAccion,
  useEnVivo,
} from '../componentes/comunes';
import { useAplicacion, navegar } from '../estado/contexto';
import { PanelInvitarAmigos } from '../paginas/Amigos';
import { useOpcionesMusica } from '../servicios/musica';
import {
  CONFIGURACION_PREDETERMINADA,
  type ConfiguracionPartida,
  type EstadoSala,
} from '../../compartido/tipos';

/** Crea salas privadas de duelo o equipos y dirige a las invitaciones entre amigos. */
export function PaginaMultijugador({ modo }: { modo: 'duelo' | 'equipos' }): ReactNode {
  const { opciones, error, cargando } = useOpcionesMusica();
  const { notificar } = useAplicacion(),
    { ocupado, ejecutar } = useAccion(notificar);
  const [nombre, fijarNombre] = useState(''),
    [rondas, fijarRondas] = useState(modo === 'duelo' ? 8 : 10),
    [segundos, fijarSegundos] = useState(20),
    [genero, fijarGenero] = useState('Todas'),
    [modoRespuesta, fijarModoRespuesta] = useState<ConfiguracionPartida['modoRespuesta']>(
      CONFIGURACION_PREDETERMINADA.modoRespuesta,
    );
  /** Crea una sala privada con los filtros y la capacidad correspondientes al modo. */
  async function crear(): Promise<void> {
    const sala = await api<EstadoSala>('/salas', 'POST', {
      nombre: nombre.trim(),
      modo,
      configuracion: { ...CONFIGURACION_PREDETERMINADA, rondas, segundos, genero, modoRespuesta },
    });
    navegar(`sala/${sala.codigo}`);
  }
  return (
    <>
      <Encabezado
        antetitulo={
          modo === 'duelo' ? 'Crea una sala · Invita a un amigo' : 'Juega en buena compañía'
        }
        titulo={modo === 'duelo' ? 'DUELO 1 VS 1' : 'EQUIPOS 2 VS 2'}
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="multiplayer-grid">
        <Tarjeta className="create-room">
          <div className="row between">
            <Insignia icono="radio">Anfitrión</Insignia>
            <span className="mode-icon">
              <Icono nombre={modo === 'duelo' ? 'duel' : 'teams'} />
            </span>
          </div>
          <h2>CREAR UNA SALA</h2>
          <p>
            {modo === 'duelo'
              ? 'Invita a un amigo y desafía a otro oído musical.'
              : 'Invita a tus amigos para reunir a los cuatro jugadores.'}
          </p>
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              void ejecutar(crear);
            }}
          >
            <label className="field">
              NOMBRE DE LA SALA
              <div className="input-shell">
                <Icono nombre="text" />
                <input
                  value={nombre}
                  onChange={(evento) => fijarNombre(evento.target.value)}
                  placeholder="Escribe el nombre de tu sala"
                  minLength={2}
                  maxLength={60}
                  required
                />
              </div>
            </label>
            <div className="config-grid room-config">
              <label className="select-field">
                <Icono nombre="disc" />
                <span>
                  <small>GÉNERO</small>
                  <select
                    aria-label="Género de sala"
                    disabled={cargando || !!error}
                    value={genero}
                    onChange={(evento) => fijarGenero(evento.target.value)}
                  >
                    <option value="Todas">Todos los géneros</option>
                    {opciones.generos.map((elemento) => (
                      <option key={elemento.nombre} value={elemento.nombre}>
                        {elemento.nombre} ({elemento.cantidad})
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icono nombre="list" />
                <span>
                  <small>RONDAS</small>
                  <select
                    value={rondas}
                    onChange={(evento) => fijarRondas(Number(evento.target.value))}
                  >
                    {[5, 8, 10].map((valor) => (
                      <option key={valor}>{valor}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icono nombre="timer" />
                <span>
                  <small>TIEMPO</small>
                  <select
                    value={segundos}
                    onChange={(evento) => fijarSegundos(Number(evento.target.value))}
                  >
                    {[20, 30].map((valor) => (
                      <option key={valor} value={valor}>
                        {valor} s
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
                    aria-label="Tipo de respuesta"
                    value={modoRespuesta}
                    onChange={(evento) =>
                      fijarModoRespuesta(
                        evento.target.value as ConfiguracionPartida['modoRespuesta'],
                      )
                    }
                  >
                    <option value="ambos">Canción o artista</option>
                    <option value="titulo">Solo canción</option>
                  </select>
                </span>
              </label>
            </div>
            <div className="row gap room-info">
              <Icono nombre="lock" />
              <small>Privada · Invita a tus amigos desde la sala</small>
            </div>
            <Boton
              type="submit"
              icono="plus"
              disabled={ocupado || cargando || !!error || nombre.trim().length < 2}
            >
              {ocupado ? 'Preparando…' : 'Crear sala'}
            </Boton>
          </form>
        </Tarjeta>
        <div className="stack">
          <Tarjeta>
            <h2 className="section-title">INVITACIONES DE AMIGOS</h2>
            <p>Acepta las invitaciones de tus amigos para entrar a sus salas.</p>
            <Boton tono="secondary" icono="users" onClick={() => navegar('amigos')}>
              Ver mis invitaciones
            </Boton>
          </Tarjeta>
          <Tarjeta>
            <h2>INSTRUCCIONES</h2>
            <p>
              {modo === 'duelo'
                ? 'Dos jugadores escuchan el mismo fragmento. Ambos confirman y el anfitrión inicia la partida.'
                : 'Cuatro jugadores, dos equipos. Confirma que estás listo antes de empezar.'}
            </p>
            <small>
              Cada jugador debe entrar con su cuenta y aceptar la invitación desde Amigos.
            </small>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

/** Sincroniza la sala, confirma jugadores, administra equipos y muestra el chat persistido. */
export function PaginaSalaEspera({ codigo }: { codigo: string }): ReactNode {
  const { usuario, notificar } = useAplicacion(),
    { ocupado, ejecutar } = useAccion(notificar);
  const [texto, fijarTexto] = useState(''),
    [unido, fijarUnido] = useState(false),
    [errorUnion, fijarErrorUnion] = useState('');
  useEffect(() => {
    let cancelado = false;
    void api<EstadoSala>('/salas/unirse', 'POST', { codigo })
      .then(() => {
        if (!cancelado) fijarUnido(true);
      })
      .catch((error) => {
        if (!cancelado) fijarErrorUnion(error.message);
      });
    return () => {
      cancelado = true;
    };
  }, [codigo]);
  // El estado se solicita después de confirmar la membresía, también para enlaces de invitación.
  if (!unido)
    return (
      <Tarjeta>
        <h2>{errorUnion ? 'NO SE PUDO ENTRAR' : 'ENTRANDO A LA SALA…'}</h2>
        {errorUnion && (
          <>
            <p className="form-error">{errorUnion}</p>
            <Boton onClick={() => navegar('equipos')}>Volver a salas</Boton>
          </>
        )}
      </Tarjeta>
    );
  return (
    <ContenidoSalaEspera
      codigo={codigo}
      usuarioId={usuario.id}
      ocupado={ocupado}
      ejecutar={ejecutar}
      texto={texto}
      fijarTexto={fijarTexto}
    />
  );
}

/** Renderiza el estado vivo de una sala una vez que su membresía fue autorizada. */
function ContenidoSalaEspera({
  codigo,
  usuarioId,
  ocupado,
  ejecutar,
  texto,
  fijarTexto,
}: {
  codigo: string;
  usuarioId: string;
  ocupado: boolean;
  ejecutar: (operacion: () => Promise<void>) => Promise<void>;
  texto: string;
  fijarTexto: (texto: string) => void;
}): ReactNode {
  const {
    datos: sala,
    error,
    fijarDatos,
  } = useEnVivo<EstadoSala>(`sala:${codigo}`, () => api(`/salas/${codigo}`));
  useEffect(() => {
    if (sala?.partidaId) navegar(`partida/${sala.partidaId}`);
  }, [sala?.partidaId]);
  /** Cambia confirmación o equipo y recibe el estado persistido actualizado. */
  async function modificar(accion: 'listo' | 'equipo', listo?: boolean): Promise<void> {
    fijarDatos(await api<EstadoSala>(`/salas/${codigo}/jugador`, 'PATCH', { accion, listo }));
  }
  /** Guarda el mensaje del chat y limpia el campo solo después de enviarlo. */
  async function chat(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    if (!texto.trim()) return;
    await ejecutar(async () => {
      await api(`/salas/${codigo}/mensajes`, 'POST', { texto });
      fijarTexto('');
      fijarDatos(await api(`/salas/${codigo}`));
    });
  }
  if (!sala) return <div className="loading">{error || 'Cargando sala…'}</div>;
  const capacidad = sala.modo === 'duelo' ? 2 : 4,
    yo = sala.jugadores.find((jugador) => jugador.id === usuarioId),
    todosListos =
      sala.jugadores.length === capacidad && sala.jugadores.every((jugador) => jugador.listo);
  return (
    <>
      <Encabezado
        antetitulo={sala.modo === 'duelo' ? 'Sala de duelo' : 'Sala de equipos'}
        titulo={`SALA “${sala.nombre.toUpperCase()}”`}
      />
      <div className="split-layout">
        <div className="stack">
          <div className="teams-result">
            {[0, 1].map((equipo) => (
              <Tarjeta className={`team-card ${equipo ? 'purple' : ''}`} key={equipo}>
                <div className="row between card-heading">
                  <h2>
                    {sala.modo === 'equipos'
                      ? `EQUIPO ${equipo + 1}`
                      : equipo
                        ? 'JUGADOR 2'
                        : 'JUGADOR 1'}
                  </h2>
                  <Insignia tono={equipo ? 'purple' : 'cyan'}>
                    {sala.modo === 'duelo'
                      ? equipo === yo?.equipo
                        ? 'Tú'
                        : 'Oponente'
                      : equipo === yo?.equipo
                        ? 'Tu equipo'
                        : 'Rivales'}
                  </Insignia>
                </div>
                {sala.jugadores
                  .filter((jugador) => jugador.equipo === equipo)
                  .map((jugador) => (
                    <div className="player" key={jugador.id}>
                      <Avatar nombre={jugador.nombre} purple={equipo === 1} />
                      <div>
                        <strong>{jugador.nombre}</strong>
                        <small>
                          {sala.anfitrionId === jugador.id ? 'Anfitrión · ' : ''}
                          {jugador.listo ? 'Listo' : 'En la sala'}
                        </small>
                      </div>
                      <span className={`status-dot ${jugador.listo ? 'ready' : ''}`} />
                    </div>
                  ))}
                {Array.from(
                  {
                    length:
                      capacidad / 2 - sala.jugadores.filter((p) => p.equipo === equipo).length,
                  },
                  (_, i) => (
                    <div className="empty-player" key={i}>
                      <Icono nombre="users" />
                      <span>Esperando jugador…</span>
                    </div>
                  ),
                )}
                {sala.modo === 'equipos' && equipo === yo?.equipo && (
                  <Boton
                    tono="ghost"
                    icono="swap"
                    disabled={ocupado}
                    onClick={() => void ejecutar(() => modificar('equipo'))}
                  >
                    Cambiar de equipo
                  </Boton>
                )}
              </Tarjeta>
            ))}
          </div>
          <Tarjeta className="room-summary">
            <span>
              <Icono nombre="disc" />
              <small>
                Categoría
                <strong>
                  {sala.configuracion.genero === 'Todas'
                    ? 'Todos los géneros'
                    : sala.configuracion.genero}
                </strong>
              </small>
            </span>
            <span>
              <Icono nombre="list" />
              <small>
                Rondas<strong>{sala.configuracion.rondas}</strong>
              </small>
            </span>
            <span>
              <Icono nombre="timer" />
              <small>
                Tiempo<strong>{sala.configuracion.segundos} s</strong>
              </small>
            </span>
          </Tarjeta>
          <div className="lobby-actions">
            <span className="green-text">
              {sala.jugadores.filter((jugador) => jugador.listo).length} de {capacidad} jugadores
              listos
            </span>
            <div className="row gap">
              <Boton
                tono="secondary"
                disabled={ocupado}
                onClick={() => void ejecutar(() => modificar('listo', !yo?.listo))}
              >
                {yo?.listo ? 'Todavía no estoy listo' : 'Estoy listo'}
              </Boton>
              {sala.anfitrionId === usuarioId && (
                <Boton
                  icono="play"
                  disabled={ocupado || !todosListos}
                  onClick={() =>
                    void ejecutar(async () => {
                      const resultado = await api<{ partidaId: string }>(
                        `/salas/${codigo}/iniciar`,
                        'POST',
                      );
                      navegar(`partida/${resultado.partidaId}`);
                    })
                  }
                >
                  Empezar partida
                </Boton>
              )}
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <aside className="stack">
          <PanelInvitarAmigos sala={sala} />
          <Tarjeta className="chat-card">
            <h2>CHAT DE SALA</h2>
            <div className="chat-messages" role="log" aria-label="Mensajes de la sala">
              {sala.mensajes.length ? (
                sala.mensajes.map((mensaje) => (
                  <div key={mensaje.id}>
                    <strong className="cyan-text">{mensaje.nombre}</strong>
                    <p>{mensaje.texto}</p>
                  </div>
                ))
              ) : (
                <p className="muted">Saluda a los jugadores. Aquí empieza el ritmo.</p>
              )}
            </div>
            <form onSubmit={(evento) => void chat(evento)} className="chat-form">
              <input
                aria-label="Mensaje de chat"
                placeholder="Escribe un mensaje…"
                value={texto}
                onChange={(evento) => fijarTexto(evento.target.value)}
                maxLength={300}
              />
              <button type="submit" aria-label="Enviar mensaje" disabled={ocupado || !texto.trim()}>
                <Icono nombre="chat" />
              </button>
            </form>
          </Tarjeta>
          <Boton
            tono="danger"
            icono="logout"
            disabled={ocupado}
            onClick={() =>
              void ejecutar(async () => {
                await api(`/salas/${codigo}/salir`, 'POST');
                navegar(sala.modo === 'duelo' ? 'duelo' : 'equipos');
              })
            }
          >
            Abandonar sala
          </Boton>
        </aside>
      </div>
    </>
  );
}
