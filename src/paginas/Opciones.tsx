/** Permite modificar audio, accesibilidad y datos de la cuenta. */
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import { Encabezado, Tarjeta, Icono, Boton, Interruptor, useAccion } from '../componentes/comunes';
import { useAplicacion } from '../estado/contexto';
import { PREFERENCIAS_PREDETERMINADAS, type Preferencias } from '../../compartido/tipos';

const pestanas = [
  { id: 'audio', etiqueta: 'Audio', icono: 'volume' },
  { id: 'interfaz', etiqueta: 'Interfaz', icono: 'monitor' },
  { id: 'cuenta', etiqueta: 'Cuenta', icono: 'user' },
];

/** Edita preferencias persistidas, opciones de accesibilidad y datos de la cuenta autenticada. */
export function PaginaOpciones({ pestana: pestana = 'audio' }: { pestana?: string }): ReactNode {
  const { usuario, preferencias, fijarPreferencias, notificar, actualizar, cerrarSesion } =
      useAplicacion(),
    { ocupado, ejecutar } = useAccion(notificar);
  const [borrador, fijarBorrador] = useState(preferencias),
    [nombre, fijarNombre] = useState(usuario.nombre),
    [contrasenaActual, fijarContrasenaActual] = useState(''),
    [contrasenaNueva, fijarContrasenaNueva] = useState(''),
    [contrasenaActualRecuperacion, fijarContrasenaActualRecuperacion] = useState(''),
    [codigoRecuperacion, fijarCodigoRecuperacion] = useState(''),
    [confirmacionCodigoRecuperacion, fijarConfirmacionCodigoRecuperacion] = useState('');
  const activo = pestanas.some((elemento) => elemento.id === pestana) ? pestana : 'audio';
  useEffect(() => fijarBorrador(preferencias), [preferencias]);
  /** Cambia una preferencia tipada de la edición actual antes de guardarla. */
  function modificar<K extends keyof Preferencias>(clave: K, valor: Preferencias[K]): void {
    fijarBorrador((actual) => ({ ...actual, [clave]: valor }));
  }
  /** Guarda preferencias en MySQL y activa la configuración global de la sesión. */
  async function guardar(): Promise<void> {
    const resultado = await api<{ preferencias: Preferencias }>('/preferencias', 'PUT', borrador);
    fijarPreferencias(resultado.preferencias);
    notificar('Cambios guardados.');
  }
  /** Actualiza el nombre público y refresca la cabecera de todas las pantallas. */
  async function guardarPerfil(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    await ejecutar(async () => {
      await api('/perfil', 'PUT', { nombre });
      await actualizar();
      notificar('Perfil actualizado.');
    });
  }
  /** Cambia la contraseña verificando la anterior y renueva la sesión desde el servidor. */
  async function cambiarContrasena(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    await ejecutar(async () => {
      await api('/perfil/contrasena', 'PUT', { contrasenaActual, contrasenaNueva });
      fijarContrasenaActual('');
      fijarContrasenaNueva('');
      notificar('Contraseña actualizada. Se cerraron las otras sesiones.');
    });
  }
  /** Define o cambia el código de recuperación tras comprobar la contraseña actual. */
  async function guardarCodigoRecuperacion(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    if (codigoRecuperacion !== confirmacionCodigoRecuperacion) {
      notificar('Los códigos de recuperación no coinciden.');
      return;
    }
    await ejecutar(async () => {
      await api('/perfil/codigo-recuperacion', 'PUT', {
        contrasenaActual: contrasenaActualRecuperacion,
        codigoRecuperacion,
      });
      fijarContrasenaActualRecuperacion('');
      fijarCodigoRecuperacion('');
      fijarConfirmacionCodigoRecuperacion('');
      notificar('Código de recuperación actualizado.');
    });
  }
  return (
    <>
      <Encabezado antetitulo="Personaliza tu experiencia" titulo="OPCIONES" />
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Secciones de opciones">
          {pestanas.map((elemento) => (
            <a
              key={elemento.id}
              href={`#/opciones/${elemento.id}`}
              className={activo === elemento.id ? 'active' : ''}
              aria-current={activo === elemento.id ? 'page' : undefined}
            >
              <Icono nombre={elemento.icono} />
              {elemento.etiqueta}
            </a>
          ))}
        </nav>
        <div className="stack">
          {activo === 'audio' && (
            <>
              <Tarjeta>
                <h2>AUDIO Y SONIDO</h2>
                <p>Equilibra música, efectos y comunicación.</p>
                {[
                  { clave: 'volumen' as const, etiqueta: 'Volumen general' },
                  { clave: 'musica' as const, etiqueta: 'Fragmentos musicales' },
                  { clave: 'efectos' as const, etiqueta: 'Efectos de interfaz' },
                ].map((elemento) => (
                  <label className="slider-field" key={elemento.clave}>
                    <span>
                      {elemento.etiqueta}
                      <strong>{borrador[elemento.clave]}%</strong>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={borrador[elemento.clave]}
                      onChange={(evento) => modificar(elemento.clave, Number(evento.target.value))}
                    />
                  </label>
                ))}
              </Tarjeta>
              <div className="settings-cards">
                <Tarjeta>
                  <h2 className="card-heading">REPRODUCCIÓN</h2>
                  <Interruptor
                    etiqueta="Cuenta atrás sonora"
                    detalle="Aviso en los últimos 3 segundos"
                    valor={borrador.cuentaRegresiva}
                    onChange={() => modificar('cuentaRegresiva', !borrador.cuentaRegresiva)}
                  />
                  <Interruptor
                    etiqueta="Reproducción automática"
                    detalle="Inicia cada fragmento sin confirmar"
                    valor={borrador.reproduccionAutomatica}
                    onChange={() =>
                      modificar('reproduccionAutomatica', !borrador.reproduccionAutomatica)
                    }
                  />
                </Tarjeta>
              </div>
            </>
          )}
          {activo === 'interfaz' && (
            <Tarjeta>
              <h2 className="card-heading">INTERFAZ Y ACCESIBILIDAD</h2>
              <Interruptor
                etiqueta="Alto contraste"
                detalle="Aumenta la visibilidad de bordes y textos secundarios"
                valor={borrador.altoContraste}
                onChange={() => modificar('altoContraste', !borrador.altoContraste)}
              />
              <Interruptor
                etiqueta="Interfaz más grande"
                detalle="Amplía textos y controles en toda la aplicación"
                valor={borrador.interfazGrande}
                onChange={() => modificar('interfazGrande', !borrador.interfazGrande)}
              />
            </Tarjeta>
          )}
          {activo === 'cuenta' && (
            <>
              <Tarjeta>
                <h2 className="card-heading">TU PERFIL</h2>
                <form onSubmit={(evento) => void guardarPerfil(evento)}>
                  <label className="field">
                    NOMBRE DE JUGADOR
                    <div className="input-shell">
                      <Icono nombre="user" />
                      <input
                        value={nombre}
                        onChange={(evento) => fijarNombre(evento.target.value)}
                        minLength={2}
                        maxLength={30}
                        required
                      />
                    </div>
                  </label>
                  <Boton type="submit" icono="save" disabled={ocupado}>
                    Actualizar perfil
                  </Boton>
                </form>
              </Tarjeta>
              <Tarjeta>
                <h2 className="card-heading">CAMBIAR CONTRASEÑA</h2>
                <form onSubmit={(evento) => void cambiarContrasena(evento)}>
                  <label className="field">
                    CONTRASEÑA ACTUAL
                    <div className="input-shell">
                      <Icono nombre="lock" />
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={contrasenaActual}
                        onChange={(evento) => fijarContrasenaActual(evento.target.value)}
                        maxLength={72}
                        required
                      />
                    </div>
                  </label>
                  <label className="field">
                    NUEVA CONTRASEÑA
                    <div className="input-shell">
                      <Icono nombre="lock" />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={contrasenaNueva}
                        onChange={(evento) => fijarContrasenaNueva(evento.target.value)}
                        minLength={8}
                        maxLength={72}
                        required
                      />
                    </div>
                  </label>
                  <Boton type="submit" disabled={ocupado}>
                    Cambiar contraseña
                  </Boton>
                </form>
              </Tarjeta>
              <Tarjeta>
                <h2 className="card-heading">CÓDIGO DE RECUPERACIÓN</h2>
                <p>
                  Guárdalo en un lugar seguro. Lo necesitarás junto con tu correo si olvidas la
                  contraseña.
                </p>
                <form onSubmit={(evento) => void guardarCodigoRecuperacion(evento)}>
                  <label className="field">
                    CONTRASEÑA ACTUAL
                    <div className="input-shell">
                      <Icono nombre="lock" />
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={contrasenaActualRecuperacion}
                        onChange={(evento) =>
                          fijarContrasenaActualRecuperacion(evento.target.value)
                        }
                        minLength={8}
                        maxLength={72}
                        required
                      />
                    </div>
                  </label>
                  <label className="field">
                    NUEVO CÓDIGO
                    <div className="input-shell">
                      <Icono nombre="lock" />
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={codigoRecuperacion}
                        onChange={(evento) =>
                          fijarCodigoRecuperacion(evento.target.value.replace(/\D/g, ''))
                        }
                        minLength={4}
                        maxLength={72}
                        pattern="[0-9]{4,72}"
                        required
                      />
                    </div>
                    <small>Usa mínimo 4 números y no repitas tu contraseña.</small>
                  </label>
                  <label className="field">
                    CONFIRMAR CÓDIGO
                    <div className="input-shell">
                      <Icono nombre="lock" />
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={confirmacionCodigoRecuperacion}
                        onChange={(evento) =>
                          fijarConfirmacionCodigoRecuperacion(
                            evento.target.value.replace(/\D/g, ''),
                          )
                        }
                        minLength={4}
                        maxLength={72}
                        pattern="[0-9]{4,72}"
                        required
                      />
                    </div>
                  </label>
                  <Boton type="submit" icono="save" disabled={ocupado}>
                    {ocupado ? 'Guardando…' : 'Guardar código'}
                  </Boton>
                </form>
              </Tarjeta>
              <Boton
                tono="danger"
                icono="logout"
                onClick={() => void ejecutar(cerrarSesion)}
                disabled={ocupado}
              >
                Cerrar sesión
              </Boton>
            </>
          )}
          {(activo === 'audio' || activo === 'interfaz') && (
            <div className="row between settings-actions">
              <Boton tono="ghost" onClick={() => fijarBorrador(PREFERENCIAS_PREDETERMINADAS)}>
                Restablecer valores
              </Boton>
              <Boton icono="save" disabled={ocupado} onClick={() => void ejecutar(guardar)}>
                {ocupado ? 'Guardando…' : 'Guardar cambios'}
              </Boton>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
