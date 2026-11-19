/** Muestra amigos, solicitudes e invitaciones a salas. */
import { useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import { useAplicacion, navegar } from '../estado/contexto';
import { useSocial } from '../estado/social';
import {
  Encabezado,
  Tarjeta,
  Insignia,
  Boton,
  Avatar,
  Icono,
  useAccion,
} from '../componentes/comunes';
import {
  CONFIGURACION_PREDETERMINADA,
  type UsuarioPublico,
  type EstadoSala,
  type ResultadoBusquedaUsuario,
} from '../../compartido/tipos';

/** Busca usuarios de esta instalación y administra solicitudes e invitaciones recibidas. */
export function PaginaAmigos(): ReactNode {
  const { notificar } = useAplicacion(),
    { datos, error, actualizar } = useSocial(),
    { ocupado, ejecutar } = useAccion(notificar);
  const [termino, fijarTermino] = useState(''),
    [resultados, fijarResultados] = useState<ResultadoBusquedaUsuario[] | null>(null);
  /** Busca perfiles por nombre o correo exacto sin publicar los correos de otras cuentas. */
  async function buscar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    await ejecutar(async () => {
      const resultado = await api<{ usuarios: ResultadoBusquedaUsuario[] }>(
        `/usuarios/buscar?q=${encodeURIComponent(termino.trim())}`,
      );
      fijarResultados(resultado.usuarios);
    });
  }
  /** Ejecuta un cambio de amistad y refresca el buzón después de confirmarlo en MySQL. */
  async function cambiar(
    ruta: string,
    metodo: string,
    cuerpo?: unknown,
    mensaje?: string,
  ): Promise<void> {
    await ejecutar(async () => {
      await api(ruta, metodo, cuerpo);
      await actualizar();
      if (mensaje) notificar(mensaje);
    });
  }
  /** Crea una sala del modo elegido y envía al amigo una invitación interna a esa sala. */
  async function invitar(amigo: UsuarioPublico, modo: 'duelo' | 'equipos'): Promise<void> {
    await ejecutar(async () => {
      const sala = await api<EstadoSala>('/salas', 'POST', {
        nombre: modo === 'duelo' ? `Duelo con ${amigo.nombre}` : `Equipo con ${amigo.nombre}`,
        modo,
        configuracion: { ...CONFIGURACION_PREDETERMINADA, rondas: modo === 'duelo' ? 8 : 10 },
      });
      navegar(`sala/${sala.codigo}`);
      await api(`/salas/${sala.codigo}/invitaciones`, 'POST', { usuarioId: amigo.id });
      await actualizar();
      notificar(`Invitación enviada a ${amigo.nombre}.`);
    });
  }
  /** Acepta la invitación únicamente con la cuenta destinataria y abre su sala. */
  async function responder(id: string, aceptar: boolean): Promise<void> {
    await ejecutar(async () => {
      const resultado = await api<{ codigo: string }>(`/invitaciones/${id}/responder`, 'POST', {
        aceptar,
      });
      await actualizar();
      if (aceptar) navegar(`sala/${resultado.codigo}`);
      else notificar('Invitación rechazada.');
    });
  }
  return (
    <>
      <Encabezado antetitulo="La música se disfruta en compañía" titulo="AMIGOS E INVITACIONES" />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="friends-layout">
        <div className="stack">
          <Tarjeta>
            <h2 className="card-heading">AGREGAR USUARIOS</h2>
            <p>
              Busca por nombre de jugador o escribe su correo completo. Deben tener una cuenta en
              esta aplicación.
            </p>
            <form className="friend-search" onSubmit={(evento) => void buscar(evento)}>
              <div className="input-shell">
                <Icono nombre="search" />
                <input
                  aria-label="Buscar usuarios"
                  placeholder="Nombre o correo completo…"
                  value={termino}
                  onChange={(evento) => {
                    fijarTermino(evento.target.value);
                    fijarResultados(null);
                  }}
                  minLength={2}
                  maxLength={254}
                  required
                />
              </div>
              <Boton icono="search" type="submit" disabled={ocupado || termino.trim().length < 2}>
                Buscar
              </Boton>
            </form>
            {resultados && (
              <div className="social-list" aria-live="polite">
                {resultados.length ? (
                  resultados.map((persona) => {
                    const amigo = datos?.amigos.some((elemento) => elemento.id === persona.id),
                      recibida = datos?.solicitudesRecibidas.some(
                        (elemento) => elemento.id === persona.id,
                      ),
                      enviada = datos?.solicitudesEnviadas.some(
                        (elemento) => elemento.id === persona.id,
                      );
                    return (
                      <div className="social-person" key={persona.id}>
                        <Avatar nombre={persona.nombre} />
                        <div>
                          <strong>{persona.nombre}</strong>
                          <small>Usuario · {persona.id.slice(0, 8)}</small>
                        </div>
                        {amigo ? (
                          <Insignia>Amigo</Insignia>
                        ) : recibida ? (
                          <Boton
                            tono="secondary"
                            disabled={ocupado}
                            onClick={() =>
                              void cambiar(
                                `/amigos/${persona.id}/aceptar`,
                                'POST',
                                undefined,
                                'Amistad aceptada.',
                              )
                            }
                          >
                            Aceptar
                          </Boton>
                        ) : enviada ? (
                          <Insignia tono="purple">Solicitud enviada</Insignia>
                        ) : (
                          <Boton
                            icono="plus"
                            disabled={ocupado || !datos}
                            onClick={() =>
                              void cambiar(
                                '/amigos',
                                'POST',
                                { usuarioId: persona.id },
                                'Solicitud de amistad enviada.',
                              )
                            }
                          >
                            Agregar
                          </Boton>
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
          </Tarjeta>
          <Tarjeta>
            <div className="row between card-heading">
              <h2>TUS AMIGOS</h2>
              <Insignia>{datos?.amigos.length || 0}</Insignia>
            </div>
            {!datos ? (
              <p>Cargando amigos…</p>
            ) : datos.amigos.length ? (
              <div className="social-list">
                {datos.amigos.map((amigo) => (
                  <div className="friend-card" key={amigo.id}>
                    <div className="social-person">
                      <Avatar nombre={amigo.nombre} />
                      <div>
                        <strong>{amigo.nombre}</strong>
                        <small>Listo para recibir invitaciones</small>
                      </div>
                      <button
                        className="text-button muted"
                        disabled={ocupado}
                        onClick={() =>
                          void cambiar(
                            `/amigos/${amigo.id}`,
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
                      <Boton
                        tono="secondary"
                        icono="duel"
                        disabled={ocupado}
                        onClick={() => void invitar(amigo, 'duelo')}
                      >
                        Invitar a duelo 1 vs 1
                      </Boton>
                      <Boton
                        tono="ghost"
                        icono="users"
                        disabled={ocupado}
                        onClick={() => void invitar(amigo, 'equipos')}
                      >
                        Invitar a equipos 2 vs 2
                      </Boton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-social">
                Agrega a tus amigos y acepta sus solicitudes para invitarlos a jugar.
              </p>
            )}
          </Tarjeta>
        </div>
        <aside className="stack">
          <Tarjeta>
            <div className="row between card-heading">
              <h2>INVITACIONES RECIBIDAS</h2>
              <Insignia tono="purple">{datos?.invitaciones.length || 0}</Insignia>
            </div>
            {datos?.invitaciones.length ? (
              <div className="social-list">
                {datos.invitaciones.map((invitacion) => (
                  <article className="invitation-card" key={invitacion.id}>
                    <Insignia tono={invitacion.modo === 'duelo' ? 'purple' : 'cyan'}>
                      {invitacion.modo === 'duelo' ? 'Duelo 1 vs 1' : 'Equipos 2 vs 2'}
                    </Insignia>
                    <h3>{invitacion.remitente.nombre} te invita</h3>
                    <p>{invitacion.nombreSala}</p>
                    <small>
                      Caduca en {Math.max(1, Math.ceil((invitacion.expiraEn - Date.now()) / 60000))}{' '}
                      min
                    </small>
                    <div className="friend-actions">
                      <Boton disabled={ocupado} onClick={() => void responder(invitacion.id, true)}>
                        Aceptar invitación
                      </Boton>
                      <Boton
                        tono="ghost"
                        disabled={ocupado}
                        onClick={() => void responder(invitacion.id, false)}
                      >
                        Rechazar
                      </Boton>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-social">Las invitaciones de tus amigos aparecerán aquí.</p>
            )}
          </Tarjeta>
          <Tarjeta>
            <h2 className="card-heading">SOLICITUDES DE AMISTAD</h2>
            {datos?.solicitudesRecibidas.length ? (
              datos.solicitudesRecibidas.map((persona) => (
                <div className="request-card" key={persona.id}>
                  <div className="social-person">
                    <Avatar nombre={persona.nombre} />
                    <strong>{persona.nombre}</strong>
                  </div>
                  <div className="friend-actions">
                    <Boton
                      disabled={ocupado}
                      onClick={() =>
                        void cambiar(
                          `/amigos/${persona.id}/aceptar`,
                          'POST',
                          undefined,
                          'Amistad aceptada.',
                        )
                      }
                    >
                      Aceptar
                    </Boton>
                    <Boton
                      tono="ghost"
                      disabled={ocupado}
                      onClick={() => void cambiar(`/amigos/${persona.id}`, 'DELETE')}
                    >
                      Rechazar
                    </Boton>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-social">No tienes solicitudes pendientes.</p>
            )}
            {!!datos?.solicitudesEnviadas.length && (
              <>
                <h3 className="social-subtitle">SOLICITUDES ENVIADAS</h3>
                {datos.solicitudesEnviadas.map((persona) => (
                  <div className="social-person" key={persona.id}>
                    <span>{persona.nombre}</span>
                    <button
                      className="text-button muted"
                      disabled={ocupado}
                      onClick={() => void cambiar(`/amigos/${persona.id}`, 'DELETE')}
                    >
                      Cancelar solicitud
                    </button>
                  </div>
                ))}
              </>
            )}
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}

/** Invita amigos a la sala abierta e indica las invitaciones que siguen pendientes. */
export function PanelInvitarAmigos({ sala }: { sala: EstadoSala }): ReactNode {
  const { notificar } = useAplicacion(),
    { datos, error, actualizar } = useSocial(),
    { ocupado, ejecutar } = useAccion(notificar);
  const [seleccionado, fijarSeleccionado] = useState('');
  const pendiente =
    datos?.invitacionesEnviadas.filter((invitacion) => invitacion.codigoSala === sala.codigo) || [];
  const disponibles =
    datos?.amigos.filter(
      (amigo) =>
        !sala.jugadores.some((jugador) => jugador.id === amigo.id) &&
        !pendiente.some((invitacion) => invitacion.destinatario.id === amigo.id),
    ) || [];
  const completo = sala.jugadores.length >= (sala.modo === 'duelo' ? 2 : 4),
    valido = disponibles.some((amigo) => amigo.id === seleccionado);
  /** Envía la invitación elegida y conserva visible su confirmación pendiente. */
  async function enviar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    await ejecutar(async () => {
      await api(`/salas/${sala.codigo}/invitaciones`, 'POST', { usuarioId: seleccionado });
      fijarSeleccionado('');
      await actualizar();
      notificar('Invitación enviada. Tu amigo puede aceptarla desde Amigos.');
    });
  }
  return (
    <Tarjeta className="invite-friends-panel">
      <h2 className="card-heading">INVITAR AMIGOS</h2>
      {error && <p className="form-error">{error}</p>}
      {completo ? (
        <p>La sala ya está completa.</p>
      ) : disponibles.length ? (
        <form onSubmit={(evento) => void enviar(evento)}>
          <label className="field">
            ELIGE UN AMIGO
            <div className="input-shell">
              <Icono nombre="users" />
              <select
                aria-label="Amigo para invitar"
                value={valido ? seleccionado : ''}
                onChange={(evento) => fijarSeleccionado(evento.target.value)}
                required
              >
                <option value="">Selecciona un amigo</option>
                {disponibles.map((amigo) => (
                  <option key={amigo.id} value={amigo.id}>
                    {amigo.nombre}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <Boton icono="send" type="submit" disabled={ocupado || !valido}>
            Enviar invitación
          </Boton>
        </form>
      ) : (
        <p>
          {datos?.amigos.length
            ? 'Tus amigos ya están en la sala o tienen una invitación pendiente.'
            : 'Agrega usuarios desde Amigos para invitarlos directamente.'}
        </p>
      )}
      {pendiente.map((invitacion) => (
        <div className="pending-invite" key={invitacion.id}>
          <span>{invitacion.destinatario.nombre}</span>
          <small>Invitación pendiente</small>
        </div>
      ))}
      <a className="text-button friends-link" href="#/amigos">
        Ir a mis amigos →
      </a>
    </Tarjeta>
  );
}
