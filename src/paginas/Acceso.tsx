/** Muestra los formularios de registro e inicio de sesión. */
import { useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import { Marca, Ambiente, FormaOnda, Icono, Boton } from '../componentes/comunes';
import type { Usuario } from '../../compartido/tipos';

/** Implementa inicio de sesión y registro reales conservando la composición de Figma. */
export function PaginaAcceso({
  alIniciarSesion,
  registroInicial = false,
  errorServidor,
}: {
  alIniciarSesion: (usuario: Usuario) => void;
  registroInicial?: boolean;
  errorServidor: string;
}): ReactNode {
  const [registro, fijarRegistro] = useState(registroInicial),
    [ocupado, fijarOcupado] = useState(false),
    [error, fijarError] = useState('');
  const [nombre, fijarNombre] = useState(''),
    [correo, fijarCorreo] = useState(''),
    [contrasena, fijarContrasena] = useState(''),
    [confirmacion, fijarConfirmacion] = useState(''),
    [recordar, fijarRecordar] = useState(false),
    [mostrarRecuperacion, fijarMostrarRecuperacion] = useState(false),
    [correoRecuperacion, fijarCorreoRecuperacion] = useState(''),
    [codigoRecuperacion, fijarCodigoRecuperacion] = useState(''),
    [confirmacionCodigoRecuperacion, fijarConfirmacionCodigoRecuperacion] = useState(''),
    [recuperacionEnviada, fijarRecuperacionEnviada] = useState(false),
    [contrasenaNueva, fijarContrasenaNueva] = useState(''),
    [confirmacionContrasenaNueva, fijarConfirmacionContrasenaNueva] = useState('');
  /** Valida la confirmación y envía credenciales a la API sin almacenarlas en el navegador. */
  async function enviarFormulario(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    fijarError('');
    if (registro && contrasena !== confirmacion) {
      fijarError('Las contraseñas no coinciden.');
      return;
    }
    if (registro && codigoRecuperacion !== confirmacionCodigoRecuperacion) {
      fijarError('Los códigos de recuperación no coinciden.');
      return;
    }
    fijarOcupado(true);
    try {
      const resultado = await api<{ usuario?: Usuario }>(
        `/autenticacion/${registro ? 'registro' : 'iniciar-sesion'}`,
        'POST',
        {
          correo,
          contrasena,
          ...(registro ? { nombre, codigoRecuperacion } : { recordar }),
        },
      );
      if (resultado.usuario) alIniciarSesion(resultado.usuario);
    } catch (fallo) {
      fijarError((fallo as Error).message);
    } finally {
      fijarOcupado(false);
    }
  }
  async function solicitarRecuperacion(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    fijarOcupado(true);
    fijarError('');
    try {
      if (codigoRecuperacion !== confirmacionCodigoRecuperacion) {
        fijarError('Los códigos de recuperación no coinciden.');
        return;
      }
      if (contrasenaNueva !== confirmacionContrasenaNueva) {
        fijarError('Las contraseñas no coinciden.');
        return;
      }
      await api('/autenticacion/recuperar', 'POST', {
        correo: correoRecuperacion,
        codigoRecuperacion,
        contrasena: contrasenaNueva,
      });
      fijarRecuperacionEnviada(true);
    } catch (fallo) {
      fijarError((fallo as Error).message);
    } finally {
      fijarOcupado(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Ambiente acceso />
        <Marca />
        <div className="auth-hero">
          <h1>¿RECONOCES EL TEMA ANTES DE QUE SE ACABE EL TIEMPO?</h1>
          <p>
            Escucha el fragmento, escribe la canción y compite contra el reloj o contra tus amigos.
          </p>
          <div className="auth-visualizer">
            <div className="row between">
              <small>00:07 / 00:12</small>
            </div>
            <FormaOnda />
          </div>
        </div>
        <div className="auth-story-footer" />
      </section>
      <section className={`auth-panel ${registro ? 'register' : 'login'}`}>
        <div className="auth-top">
          <span>{registro ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              fijarRegistro(!registro);
              fijarError('');
            }}
          >
            {registro ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </div>
        {mostrarRecuperacion && !registro ? (
          <form className="auth-form" onSubmit={solicitarRecuperacion}>
            <div className="form-heading">
              <h2>RECUPERA TU ACCESO</h2>
              <p>Confirma tu alias y correo, y elige una contraseña nueva.</p>
            </div>
            {recuperacionEnviada ? (
              <div className="notice">
                Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.
              </div>
            ) : (
              <>
                <label className="field">
                  EMAIL DE LA CUENTA
                  <div className="input-shell">
                    <Icono nombre="mail" />
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={correoRecuperacion}
                      onChange={(evento) => fijarCorreoRecuperacion(evento.target.value)}
                      placeholder="tu@email.com"
                    />
                  </div>
                </label>
                <label className="field">
                  CÓDIGO DE RECUPERACIÓN
                  <div className="input-shell">
                    <Icono nombre="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      minLength={4}
                      maxLength={72}
                      pattern="[0-9]{4,72}"
                      value={codigoRecuperacion}
                      onChange={(evento) =>
                        fijarCodigoRecuperacion(evento.target.value.replace(/\D/g, ''))
                      }
                    />
                  </div>
                </label>
                <label className="field">
                  CONFIRMAR CÓDIGO
                  <div className="input-shell">
                    <Icono nombre="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      minLength={4}
                      maxLength={72}
                      pattern="[0-9]{4,72}"
                      value={confirmacionCodigoRecuperacion}
                      onChange={(evento) =>
                        fijarConfirmacionCodigoRecuperacion(evento.target.value.replace(/\D/g, ''))
                      }
                    />
                  </div>
                </label>
                <label className="field">
                  CONTRASEÑA NUEVA
                  <div className="input-shell">
                    <Icono nombre="lock" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={72}
                      value={contrasenaNueva}
                      onChange={(evento) => fijarContrasenaNueva(evento.target.value)}
                    />
                  </div>
                </label>
                <label className="field">
                  CONFIRMAR CONTRASEÑA
                  <div className="input-shell">
                    <Icono nombre="lock" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={72}
                      value={confirmacionContrasenaNueva}
                      onChange={(evento) => fijarConfirmacionContrasenaNueva(evento.target.value)}
                    />
                  </div>
                </label>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {!recuperacionEnviada && (
              <Boton type="submit" icono="lock" disabled={ocupado}>
                {ocupado ? 'Guardando…' : 'Cambiar contraseña'}
              </Boton>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                fijarMostrarRecuperacion(false);
                fijarRecuperacionEnviada(false);
                fijarCorreoRecuperacion('');
                fijarCodigoRecuperacion('');
                fijarConfirmacionCodigoRecuperacion('');
                fijarContrasenaNueva('');
                fijarConfirmacionContrasenaNueva('');
                fijarError('');
              }}
            >
              Volver al inicio de sesión
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={enviarFormulario}>
            <div className="form-heading">
              <h2>{registro ? 'ÚNETE A LA PARTIDA' : 'VUELVE AL ESCENARIO'}</h2>
              <p>
                {registro
                  ? 'Crea tu perfil y empieza a descubrir lo que sabes.'
                  : 'Tus rachas y playlists te están esperando.'}
              </p>
            </div>
            {errorServidor && (
              <div className="notice error" role="alert">
                {errorServidor}
              </div>
            )}
            {registro && (
              <label className="field">
                NOMBRE DE JUGADOR
                <div className="input-shell">
                  <Icono nombre="user" />
                  <input
                    autoComplete="nickname"
                    placeholder="Tu alias"
                    value={nombre}
                    onChange={(evento) => fijarNombre(evento.target.value)}
                    minLength={2}
                    maxLength={30}
                    required
                  />
                </div>
              </label>
            )}
            {registro && (
              <>
                <label className="field">
                  CÓDIGO DE RECUPERACIÓN
                  <div className="input-shell">
                    <Icono nombre="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="Solo números (mínimo 4)"
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
                  <small>
                    Guárdalo; lo necesitarás junto con tu correo si olvidas la contraseña. Usa
                    mínimo 4 números.
                  </small>
                </label>
                <label className="field">
                  CONFIRMAR CÓDIGO
                  <div className="input-shell">
                    <Icono nombre="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="Repite tu código"
                      value={confirmacionCodigoRecuperacion}
                      onChange={(evento) =>
                        fijarConfirmacionCodigoRecuperacion(evento.target.value.replace(/\D/g, ''))
                      }
                      minLength={4}
                      maxLength={72}
                      pattern="[0-9]{4,72}"
                      required
                    />
                  </div>
                </label>
              </>
            )}
            <label className="field">
              EMAIL
              <div className="input-shell">
                <Icono nombre="mail" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  value={correo}
                  onChange={(evento) => fijarCorreo(evento.target.value)}
                  maxLength={254}
                  required
                />
                {correo.includes('@') && <Icono nombre="check" />}
              </div>
            </label>
            <label className="field">
              CONTRASEÑA
              <div className="input-shell">
                <Icono nombre="lock" />
                <input
                  type="password"
                  autoComplete={registro ? 'off' : 'current-password'}
                  placeholder="••••••••••"
                  value={contrasena}
                  onChange={(evento) => fijarContrasena(evento.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                />
              </div>
              {registro && <small>Usa al menos 8 caracteres.</small>}
            </label>
            {registro && (
              <label className="field">
                CONFIRMAR CONTRASEÑA
                <div className="input-shell">
                  <Icono nombre="lock" />
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Repite tu contraseña"
                    value={confirmacion}
                    onChange={(evento) => fijarConfirmacion(evento.target.value)}
                    required
                  />
                </div>
              </label>
            )}
            {!registro && (
              <div className="auth-options">
                <label>
                  <input
                    type="checkbox"
                    checked={recordar}
                    onChange={(evento) => fijarRecordar(evento.target.checked)}
                  />
                  Recordarme
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => fijarMostrarRecuperacion(!mostrarRecuperacion)}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Boton type="submit" icono="arrow" disabled={ocupado}>
              {ocupado ? 'Un momento…' : registro ? 'Crear mi cuenta' : 'Entrar y jugar'}
            </Boton>
          </form>
        )}
      </section>
    </main>
  );
}
