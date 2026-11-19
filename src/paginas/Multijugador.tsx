/** Permite crear salas, unirse y preparar duelos o equipos. */
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import {
  Heading,
  Card,
  Badge,
  Button,
  Icon,
  Avatar,
  useAction,
  useLive,
} from '../componentes/comunes';
import { useApp, navigate } from '../estado/contexto';
import { FriendInvitePanel } from '../paginas/Amigos';
import { useMusicOptions } from '../servicios/musica';
import { DEFAULT_CONFIG, type GameConfig, type RoomSnapshot } from '../../compartido/tipos';

/** Crea salas privadas de duelo o equipos y dirige a las invitaciones entre amigos. */
export function MultiplayerPage({ mode }: { mode: 'duel' | 'teams' }): ReactNode {
  const { options, error, loading } = useMusicOptions();
  const { notify } = useApp(),
    { busy, run } = useAction(notify);
  const [name, setName] = useState(''),
    [rounds, setRounds] = useState(mode === 'duel' ? 8 : 10),
    [seconds, setSeconds] = useState(20),
    [genre, setGenre] = useState('Todas'),
    [answerMode, setAnswerMode] = useState<GameConfig['answerMode']>(DEFAULT_CONFIG.answerMode);
  /** Crea una sala privada con los filtros y la capacidad correspondientes al modo. */
  async function create(): Promise<void> {
    const room = await api<RoomSnapshot>('/rooms', 'POST', {
      name: name.trim(),
      mode,
      config: { ...DEFAULT_CONFIG, rounds, seconds, genre, answerMode },
    });
    navigate(`sala/${room.code}`);
  }
  return (
    <>
      <Heading
        eyebrow={mode === 'duel' ? 'Crea una sala · Invita a un amigo' : 'Juega en buena compañía'}
        title={mode === 'duel' ? 'DUELO 1 VS 1' : 'EQUIPOS 2 VS 2'}
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="subtle-note catalog-status">
        {loading
          ? 'Conectando con las canciones oficiales…'
          : `${options.total} canciones oficiales · ${options.artists} artistas · ${options.genres.length} géneros`}
      </p>
      <div className="multiplayer-grid">
        <Card className="create-room">
          <div className="row between">
            <Badge icon="radio">Anfitrión</Badge>
            <span className="mode-icon">
              <Icon name={mode === 'duel' ? 'duel' : 'teams'} />
            </span>
          </div>
          <h2>CREAR UNA SALA</h2>
          <p>
            {mode === 'duel'
              ? 'Invita a un amigo y desafía a otro oído musical.'
              : 'Invita a tus amigos para reunir a los cuatro jugadores.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(create);
            }}
          >
            <label className="field">
              NOMBRE DE LA SALA
              <div className="input-shell">
                <Icon name="text" />
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Escribe el nombre de tu sala"
                  minLength={2}
                  maxLength={60}
                  required
                />
              </div>
            </label>
            <div className="config-grid room-config">
              <label className="select-field">
                <Icon name="disc" />
                <span>
                  <small>GÉNERO</small>
                  <select
                    aria-label="Género de sala"
                    disabled={loading || !!error}
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                  >
                    <option value="Todas">Todos los géneros</option>
                    {options.genres.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} ({item.count})
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icon name="list" />
                <span>
                  <small>RONDAS</small>
                  <select
                    value={rounds}
                    onChange={(event) => setRounds(Number(event.target.value))}
                  >
                    {[5, 8, 10].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icon name="timer" />
                <span>
                  <small>TIEMPO</small>
                  <select
                    value={seconds}
                    onChange={(event) => setSeconds(Number(event.target.value))}
                  >
                    {[20, 30].map((value) => (
                      <option key={value} value={value}>
                        {value} s
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icon name="text" />
                <span>
                  <small>TIPO DE RESPUESTA</small>
                  <select
                    aria-label="Tipo de respuesta"
                    value={answerMode}
                    onChange={(event) =>
                      setAnswerMode(event.target.value as GameConfig['answerMode'])
                    }
                  >
                    <option value="both">Canción o artista</option>
                    <option value="title">Solo canción</option>
                  </select>
                </span>
              </label>
            </div>
            <div className="row gap room-info">
              <Icon name="lock" />
              <small>Privada · Invita a tus amigos desde la sala</small>
            </div>
            <Button
              type="submit"
              icon="plus"
              disabled={busy || loading || !!error || name.trim().length < 2}
            >
              {busy ? 'Preparando…' : 'Crear sala'}
            </Button>
          </form>
        </Card>
        <div className="stack">
          <Card>
            <Badge tone="purple">Invitado</Badge>
            <h2 className="section-title">INVITACIONES DE AMIGOS</h2>
            <p>Acepta las invitaciones de tus amigos para entrar a sus salas.</p>
            <Button tone="secondary" icon="users" onClick={() => navigate('amigos')}>
              Ver mis invitaciones
            </Button>
          </Card>
          <Card>
            <h2>EL RITMO SE COMPARTE</h2>
            <p>
              {mode === 'duel'
                ? 'Dos jugadores escuchan el mismo fragmento. Ambos confirman y el anfitrión inicia la partida.'
                : 'Cuatro jugadores, dos equipos. Confirma que estás listo antes de empezar.'}
            </p>
            <small>
              Cada jugador debe entrar con su cuenta y aceptar la invitación desde Amigos.
            </small>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Sincroniza la sala, confirma jugadores, administra equipos y muestra el chat persistido. */
export function LobbyPage({ code }: { code: string }): ReactNode {
  const { user, notify } = useApp(),
    { busy, run } = useAction(notify);
  const [text, setText] = useState(''),
    [joined, setJoined] = useState(false),
    [joinError, setJoinError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void api<RoomSnapshot>('/rooms/join', 'POST', { code })
      .then(() => {
        if (!cancelled) setJoined(true);
      })
      .catch((error) => {
        if (!cancelled) setJoinError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);
  // El estado se solicita después de confirmar la membresía, también para enlaces de invitación.
  if (!joined)
    return (
      <Card>
        <h2>{joinError ? 'NO SE PUDO ENTRAR' : 'ENTRANDO A LA SALA…'}</h2>
        {joinError && (
          <>
            <p className="form-error">{joinError}</p>
            <Button onClick={() => navigate('equipos')}>Volver a salas</Button>
          </>
        )}
      </Card>
    );
  return (
    <LobbyContent
      code={code}
      userId={user.id}
      busy={busy}
      run={run}
      text={text}
      setText={setText}
    />
  );
}

/** Renderiza el estado vivo de una sala una vez que su membresía fue autorizada. */
function LobbyContent({
  code,
  userId,
  busy,
  run,
  text,
  setText,
}: {
  code: string;
  userId: string;
  busy: boolean;
  run: (operation: () => Promise<void>) => Promise<void>;
  text: string;
  setText: (text: string) => void;
}): ReactNode {
  const {
    data: room,
    error,
    setData,
  } = useLive<RoomSnapshot>(`room:${code}`, () => api(`/rooms/${code}`));
  useEffect(() => {
    if (room?.gameId) navigate(`partida/${room.gameId}`);
  }, [room?.gameId]);
  /** Cambia confirmación o equipo y recibe el estado persistido actualizado. */
  async function update(action: 'ready' | 'team', ready?: boolean): Promise<void> {
    setData(await api<RoomSnapshot>(`/rooms/${code}/player`, 'PATCH', { action, ready }));
  }
  /** Guarda el mensaje del chat y limpia el campo solo después de enviarlo. */
  async function chat(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!text.trim()) return;
    await run(async () => {
      await api(`/rooms/${code}/messages`, 'POST', { text });
      setText('');
      setData(await api(`/rooms/${code}`));
    });
  }
  if (!room) return <div className="loading">{error || 'Cargando sala…'}</div>;
  const capacity = room.mode === 'duel' ? 2 : 4,
    me = room.players.find((player) => player.id === userId),
    everyoneReady =
      room.players.length === capacity && room.players.every((player) => player.ready);
  return (
    <>
      <Heading
        eyebrow={room.mode === 'duel' ? 'Sala de duelo' : 'Sala de equipos'}
        title={`SALA “${room.name.toUpperCase()}”`}
      />
      <div className="split-layout">
        <div className="stack">
          <div className="teams-result">
            {[0, 1].map((team) => (
              <Card className={`team-card ${team ? 'purple' : ''}`} key={team}>
                <div className="row between card-heading">
                  <h2>
                    {room.mode === 'teams'
                      ? `EQUIPO ${team + 1}`
                      : team
                        ? 'JUGADOR 2'
                        : 'JUGADOR 1'}
                  </h2>
                  <Badge tone={team ? 'purple' : 'cyan'}>
                    {room.mode === 'duel'
                      ? team === me?.team
                        ? 'Tú'
                        : 'Oponente'
                      : team === me?.team
                        ? 'Tu equipo'
                        : 'Rivales'}
                  </Badge>
                </div>
                {room.players
                  .filter((player) => player.team === team)
                  .map((player) => (
                    <div className="player" key={player.id}>
                      <Avatar name={player.name} purple={team === 1} />
                      <div>
                        <strong>{player.name}</strong>
                        <small>
                          {room.hostId === player.id ? 'Anfitrión · ' : ''}
                          {player.ready ? 'Listo' : 'En la sala'}
                        </small>
                      </div>
                      <span className={`status-dot ${player.ready ? 'ready' : ''}`} />
                    </div>
                  ))}
                {Array.from(
                  { length: capacity / 2 - room.players.filter((p) => p.team === team).length },
                  (_, i) => (
                    <div className="empty-player" key={i}>
                      <Icon name="users" />
                      <span>Esperando jugador…</span>
                    </div>
                  ),
                )}
                {room.mode === 'teams' && team === me?.team && (
                  <Button
                    tone="ghost"
                    icon="swap"
                    disabled={busy}
                    onClick={() => void run(() => update('team'))}
                  >
                    Cambiar de equipo
                  </Button>
                )}
              </Card>
            ))}
          </div>
          <Card className="room-summary">
            <span>
              <Icon name="disc" />
              <small>
                Categoría
                <strong>
                  {room.config.genre === 'Todas' ? 'Todos los géneros' : room.config.genre}
                </strong>
              </small>
            </span>
            <span>
              <Icon name="list" />
              <small>
                Rondas<strong>{room.config.rounds}</strong>
              </small>
            </span>
            <span>
              <Icon name="timer" />
              <small>
                Tiempo<strong>{room.config.seconds} s</strong>
              </small>
            </span>
          </Card>
          <div className="lobby-actions">
            <span className="green-text">
              {room.players.filter((player) => player.ready).length} de {capacity} jugadores listos
            </span>
            <div className="row gap">
              <Button
                tone="secondary"
                disabled={busy}
                onClick={() => void run(() => update('ready', !me?.ready))}
              >
                {me?.ready ? 'Todavía no estoy listo' : 'Estoy listo'}
              </Button>
              {room.hostId === userId && (
                <Button
                  icon="play"
                  disabled={busy || !everyoneReady}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<{ gameId: string }>(`/rooms/${code}/start`, 'POST');
                      navigate(`partida/${result.gameId}`);
                    })
                  }
                >
                  Empezar partida
                </Button>
              )}
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <aside className="stack">
          <FriendInvitePanel room={room} />
          <Card className="chat-card">
            <h2>CHAT DE SALA</h2>
            <div className="chat-messages" role="log" aria-label="Mensajes de la sala">
              {room.messages.length ? (
                room.messages.map((message) => (
                  <div key={message.id}>
                    <strong className="cyan-text">{message.name}</strong>
                    <p>{message.text}</p>
                  </div>
                ))
              ) : (
                <p className="muted">Saluda a los jugadores. Aquí empieza el ritmo.</p>
              )}
            </div>
            <form onSubmit={(event) => void chat(event)} className="chat-form">
              <input
                aria-label="Mensaje de chat"
                placeholder="Escribe un mensaje…"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={300}
              />
              <button type="submit" aria-label="Enviar mensaje" disabled={busy || !text.trim()}>
                <Icon name="chat" />
              </button>
            </form>
          </Card>
          <Button
            tone="danger"
            icon="logout"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/rooms/${code}/leave`, 'POST');
                navigate(room.mode === 'duel' ? 'duelo' : 'equipos');
              })
            }
          >
            Abandonar sala
          </Button>
        </aside>
      </div>
    </>
  );
}
