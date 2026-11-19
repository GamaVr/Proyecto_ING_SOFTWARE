/** Muestra amigos, solicitudes e invitaciones a salas. */
import { useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import { useApp, navigate } from '../estado/contexto';
import { useSocial } from '../estado/social';
import { Heading, Card, Badge, Button, Avatar, Icon, useAction } from '../componentes/comunes';
import {
  DEFAULT_CONFIG,
  type PublicUser,
  type RoomSnapshot,
  type UserSearchResult,
} from '../../compartido/tipos';

/** Busca usuarios de esta instalación y administra solicitudes e invitaciones recibidas. */
export function FriendsPage(): ReactNode {
  const { notify } = useApp(),
    { data, error, refresh } = useSocial(),
    { busy, run } = useAction(notify);
  const [term, setTerm] = useState(''),
    [results, setResults] = useState<UserSearchResult[] | null>(null);
  /** Busca perfiles por nombre o correo exacto sin publicar los correos de otras cuentas. */
  async function search(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      const result = await api<{ users: UserSearchResult[] }>(
        `/users/search?q=${encodeURIComponent(term.trim())}`,
      );
      setResults(result.users);
    });
  }
  /** Ejecuta un cambio de amistad y refresca el buzón después de confirmarlo en MySQL. */
  async function change(
    path: string,
    method: string,
    body?: unknown,
    message?: string,
  ): Promise<void> {
    await run(async () => {
      await api(path, method, body);
      await refresh();
      if (message) notify(message);
    });
  }
  /** Crea una sala del modo elegido y envía al amigo una invitación interna a esa sala. */
  async function invite(friend: PublicUser, mode: 'duel' | 'teams'): Promise<void> {
    await run(async () => {
      const room = await api<RoomSnapshot>('/rooms', 'POST', {
        name: mode === 'duel' ? `Duelo con ${friend.name}` : `Equipo con ${friend.name}`,
        mode,
        config: { ...DEFAULT_CONFIG, rounds: mode === 'duel' ? 8 : 10 },
      });
      navigate(`sala/${room.code}`);
      await api(`/rooms/${room.code}/invitations`, 'POST', { userId: friend.id });
      await refresh();
      notify(`Invitación enviada a ${friend.name}.`);
    });
  }
  /** Acepta la invitación únicamente con la cuenta destinataria y abre su sala. */
  async function respond(id: string, accept: boolean): Promise<void> {
    await run(async () => {
      const result = await api<{ code: string }>(`/invitations/${id}/respond`, 'POST', { accept });
      await refresh();
      if (accept) navigate(`sala/${result.code}`);
      else notify('Invitación rechazada.');
    });
  }
  return (
    <>
      <Heading eyebrow="La música se disfruta en compañía" title="AMIGOS E INVITACIONES" />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="friends-layout">
        <div className="stack">
          <Card>
            <h2 className="card-heading">AGREGAR USUARIOS</h2>
            <p>
              Busca por nombre de jugador o escribe su correo completo. Deben tener una cuenta en
              esta aplicación.
            </p>
            <form className="friend-search" onSubmit={(event) => void search(event)}>
              <div className="input-shell">
                <Icon name="search" />
                <input
                  aria-label="Buscar usuarios"
                  placeholder="Nombre o correo completo…"
                  value={term}
                  onChange={(event) => {
                    setTerm(event.target.value);
                    setResults(null);
                  }}
                  minLength={2}
                  maxLength={254}
                  required
                />
              </div>
              <Button icon="search" type="submit" disabled={busy || term.trim().length < 2}>
                Buscar
              </Button>
            </form>
            {results && (
              <div className="social-list" aria-live="polite">
                {results.length ? (
                  results.map((person) => {
                    const friend = data?.friends.some((item) => item.id === person.id),
                      incoming = data?.incomingRequests.some((item) => item.id === person.id),
                      outgoing = data?.outgoingRequests.some((item) => item.id === person.id);
                    return (
                      <div className="social-person" key={person.id}>
                        <Avatar name={person.name} />
                        <div>
                          <strong>{person.name}</strong>
                          <small>Usuario · {person.id.slice(0, 8)}</small>
                        </div>
                        {friend ? (
                          <Badge>Amigo</Badge>
                        ) : incoming ? (
                          <Button
                            tone="secondary"
                            disabled={busy}
                            onClick={() =>
                              void change(
                                `/friends/${person.id}/accept`,
                                'POST',
                                undefined,
                                'Amistad aceptada.',
                              )
                            }
                          >
                            Aceptar
                          </Button>
                        ) : outgoing ? (
                          <Badge tone="purple">Solicitud enviada</Badge>
                        ) : (
                          <Button
                            icon="plus"
                            disabled={busy || !data}
                            onClick={() =>
                              void change(
                                '/friends',
                                'POST',
                                { userId: person.id },
                                'Solicitud de amistad enviada.',
                              )
                            }
                          >
                            Agregar
                          </Button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="empty-social">
                    No encontramos usuarios. Prueba con su correo completo.
                  </p>
                )}
              </div>
            )}
          </Card>
          <Card>
            <div className="row between card-heading">
              <h2>TUS AMIGOS</h2>
              <Badge>{data?.friends.length || 0}</Badge>
            </div>
            {!data ? (
              <p>Cargando amigos…</p>
            ) : data.friends.length ? (
              <div className="social-list">
                {data.friends.map((friend) => (
                  <div className="friend-card" key={friend.id}>
                    <div className="social-person">
                      <Avatar name={friend.name} />
                      <div>
                        <strong>{friend.name}</strong>
                        <small>Listo para recibir invitaciones</small>
                      </div>
                      <button
                        className="text-button muted"
                        disabled={busy}
                        onClick={() =>
                          void change(
                            `/friends/${friend.id}`,
                            'DELETE',
                            undefined,
                            'Usuario retirado de tus amigos.',
                          )
                        }
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="friend-actions">
                      <Button
                        tone="secondary"
                        icon="duel"
                        disabled={busy}
                        onClick={() => void invite(friend, 'duel')}
                      >
                        Invitar a duelo 1 vs 1
                      </Button>
                      <Button
                        tone="ghost"
                        icon="users"
                        disabled={busy}
                        onClick={() => void invite(friend, 'teams')}
                      >
                        Invitar a equipos 2 vs 2
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-social">
                Agrega a tus amigos y acepta sus solicitudes para invitarlos a jugar.
              </p>
            )}
          </Card>
        </div>
        <aside className="stack">
          <Card>
            <div className="row between card-heading">
              <h2>INVITACIONES RECIBIDAS</h2>
              <Badge tone="purple">{data?.invitations.length || 0}</Badge>
            </div>
            {data?.invitations.length ? (
              <div className="social-list">
                {data.invitations.map((invitation) => (
                  <article className="invitation-card" key={invitation.id}>
                    <Badge tone={invitation.mode === 'duel' ? 'purple' : 'cyan'}>
                      {invitation.mode === 'duel' ? 'Duelo 1 vs 1' : 'Equipos 2 vs 2'}
                    </Badge>
                    <h3>{invitation.sender.name} te invita</h3>
                    <p>{invitation.roomName}</p>
                    <small>
                      Caduca en{' '}
                      {Math.max(1, Math.ceil((invitation.expiresAt - Date.now()) / 60000))} min
                    </small>
                    <div className="friend-actions">
                      <Button disabled={busy} onClick={() => void respond(invitation.id, true)}>
                        Aceptar invitación
                      </Button>
                      <Button
                        tone="ghost"
                        disabled={busy}
                        onClick={() => void respond(invitation.id, false)}
                      >
                        Rechazar
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-social">Las invitaciones de tus amigos aparecerán aquí.</p>
            )}
          </Card>
          <Card>
            <h2 className="card-heading">SOLICITUDES DE AMISTAD</h2>
            {data?.incomingRequests.length ? (
              data.incomingRequests.map((person) => (
                <div className="request-card" key={person.id}>
                  <div className="social-person">
                    <Avatar name={person.name} />
                    <strong>{person.name}</strong>
                  </div>
                  <div className="friend-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void change(
                          `/friends/${person.id}/accept`,
                          'POST',
                          undefined,
                          'Amistad aceptada.',
                        )
                      }
                    >
                      Aceptar
                    </Button>
                    <Button
                      tone="ghost"
                      disabled={busy}
                      onClick={() => void change(`/friends/${person.id}`, 'DELETE')}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-social">No tienes solicitudes pendientes.</p>
            )}
            {!!data?.outgoingRequests.length && (
              <>
                <h3 className="social-subtitle">SOLICITUDES ENVIADAS</h3>
                {data.outgoingRequests.map((person) => (
                  <div className="social-person" key={person.id}>
                    <span>{person.name}</span>
                    <button
                      className="text-button muted"
                      disabled={busy}
                      onClick={() => void change(`/friends/${person.id}`, 'DELETE')}
                    >
                      Cancelar solicitud
                    </button>
                  </div>
                ))}
              </>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

/** Invita amigos a la sala abierta e indica las invitaciones que siguen pendientes. */
export function FriendInvitePanel({ room }: { room: RoomSnapshot }): ReactNode {
  const { notify } = useApp(),
    { data, error, refresh } = useSocial(),
    { busy, run } = useAction(notify);
  const [selected, setSelected] = useState('');
  const pending =
    data?.sentInvitations.filter((invitation) => invitation.roomCode === room.code) || [];
  const available =
    data?.friends.filter(
      (friend) =>
        !room.players.some((player) => player.id === friend.id) &&
        !pending.some((invitation) => invitation.recipient.id === friend.id),
    ) || [];
  const full = room.players.length >= (room.mode === 'duel' ? 2 : 4),
    valid = available.some((friend) => friend.id === selected);
  /** Envía la invitación elegida y conserva visible su confirmación pendiente. */
  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      await api(`/rooms/${room.code}/invitations`, 'POST', { userId: selected });
      setSelected('');
      await refresh();
      notify('Invitación enviada. Tu amigo puede aceptarla desde Amigos.');
    });
  }
  return (
    <Card className="invite-friends-panel">
      <h2 className="card-heading">INVITAR AMIGOS</h2>
      {error && <p className="form-error">{error}</p>}
      {full ? (
        <p>La sala ya está completa.</p>
      ) : available.length ? (
        <form onSubmit={(event) => void send(event)}>
          <label className="field">
            ELIGE UN AMIGO
            <div className="input-shell">
              <Icon name="users" />
              <select
                aria-label="Amigo para invitar"
                value={valid ? selected : ''}
                onChange={(event) => setSelected(event.target.value)}
                required
              >
                <option value="">Selecciona un amigo</option>
                {available.map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <Button icon="send" type="submit" disabled={busy || !valid}>
            Enviar invitación
          </Button>
        </form>
      ) : (
        <p>
          {data?.friends.length
            ? 'Tus amigos ya están en la sala o tienen una invitación pendiente.'
            : 'Agrega usuarios desde Amigos para invitarlos directamente.'}
        </p>
      )}
      {pending.map((invitation) => (
        <div className="pending-invite" key={invitation.id}>
          <span>{invitation.recipient.name}</span>
          <small>Invitación pendiente</small>
        </div>
      ))}
      <a className="text-button friends-link" href="#/amigos">
        Ir a mis amigos →
      </a>
    </Card>
  );
}
