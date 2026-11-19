/** Muestra los formularios de registro e inicio de sesión. */
import { useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../servicios/api';
import { Brand, Ambient, Waveform, Icon, Button } from '../componentes/comunes';
import type { User } from '../../compartido/tipos';

/** Implementa inicio de sesión y registro reales conservando la composición de Figma. */
export function AuthPage({
  onLogin,
  initialRegister = false,
  serverError,
}: {
  onLogin: (user: User) => void;
  initialRegister?: boolean;
  serverError: string;
}): ReactNode {
  const [register, setRegister] = useState(initialRegister),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [remember, setRemember] = useState(false),
    [showRecovery, setShowRecovery] = useState(false),
    [recoveryEmail, setRecoveryEmail] = useState(''),
    [recoveryCode, setRecoveryCode] = useState(''),
    [recoveryCodeConfirmation, setRecoveryCodeConfirmation] = useState(''),
    [recoverySent, setRecoverySent] = useState(false),
    [newPassword, setNewPassword] = useState(''),
    [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  /** Valida la confirmación y envía credenciales a la API sin almacenarlas en el navegador. */
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    if (register && password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (register && recoveryCode !== recoveryCodeConfirmation) {
      setError('Los códigos de recuperación no coinciden.');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user?: User }>(
        `/auth/${register ? 'register' : 'login'}`,
        'POST',
        {
          email,
          password,
          ...(register ? { name, recoveryCode } : { remember }),
        },
      );
      if (result.user) onLogin(result.user);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestRecovery(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (recoveryCode !== recoveryCodeConfirmation) {
        setError('Los códigos de recuperación no coinciden.');
        return;
      }
      if (newPassword !== newPasswordConfirmation) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      await api('/auth/recovery', 'POST', {
        email: recoveryEmail,
        recoveryCode,
        password: newPassword,
      });
      setRecoverySent(true);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Ambient auth />
        <Brand />
        <div className="auth-hero">
          <h1>¿RECONOCES EL TEMA ANTES DE QUE SE ACABE EL TIEMPO?</h1>
          <p>
            Escucha el fragmento, escribe la canción y compite contra el reloj o contra tus amigos.
          </p>
          <div className="auth-visualizer">
            <div className="row between">
              <small>00:07 / 00:12</small>
            </div>
            <Waveform />
          </div>
        </div>
        <div className="auth-story-footer" />
      </section>
      <section className={`auth-panel ${register ? 'register' : 'login'}`}>
        <div className="auth-top">
          <span>{register ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </div>
        {showRecovery && !register ? (
          <form className="auth-form" onSubmit={requestRecovery}>
            <div className="form-heading">
              <h2>RECUPERA TU ACCESO</h2>
              <p>Confirma tu alias y correo, y elige una contraseña nueva.</p>
            </div>
            {recoverySent ? (
              <div className="notice">
                Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.
              </div>
            ) : (
              <>
                <label className="field">
                  EMAIL DE LA CUENTA
                  <div className="input-shell">
                    <Icon name="mail" />
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={recoveryEmail}
                      onChange={(event) => setRecoveryEmail(event.target.value)}
                      placeholder="tu@email.com"
                    />
                  </div>
                </label>
                <label className="field">
                  CÓDIGO DE RECUPERACIÓN
                  <div className="input-shell">
                    <Icon name="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      minLength={4}
                      maxLength={72}
                      pattern="[0-9]{4,72}"
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </label>
                <label className="field">
                  CONFIRMAR CÓDIGO
                  <div className="input-shell">
                    <Icon name="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      minLength={4}
                      maxLength={72}
                      pattern="[0-9]{4,72}"
                      value={recoveryCodeConfirmation}
                      onChange={(event) =>
                        setRecoveryCodeConfirmation(event.target.value.replace(/\D/g, ''))
                      }
                    />
                  </div>
                </label>
                <label className="field">
                  CONTRASEÑA NUEVA
                  <div className="input-shell">
                    <Icon name="lock" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={72}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </div>
                </label>
                <label className="field">
                  CONFIRMAR CONTRASEÑA
                  <div className="input-shell">
                    <Icon name="lock" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={72}
                      value={newPasswordConfirmation}
                      onChange={(event) => setNewPasswordConfirmation(event.target.value)}
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
            {!recoverySent && (
              <Button type="submit" icon="lock" disabled={busy}>
                {busy ? 'Guardando…' : 'Cambiar contraseña'}
              </Button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setShowRecovery(false);
                setRecoverySent(false);
                setRecoveryEmail('');
                setRecoveryCode('');
                setRecoveryCodeConfirmation('');
                setNewPassword('');
                setNewPasswordConfirmation('');
                setError('');
              }}
            >
              Volver al inicio de sesión
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <div className="form-heading">
              <h2>{register ? 'ÚNETE A LA PARTIDA' : 'VUELVE AL ESCENARIO'}</h2>
              <p>
                {register
                  ? 'Crea tu perfil y empieza a descubrir lo que sabes.'
                  : 'Tus rachas y playlists te están esperando.'}
              </p>
            </div>
            {serverError && (
              <div className="notice error" role="alert">
                {serverError}
              </div>
            )}
            {register && (
              <label className="field">
                NOMBRE DE JUGADOR
                <div className="input-shell">
                  <Icon name="user" />
                  <input
                    autoComplete="nickname"
                    placeholder="Tu alias"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={30}
                    required
                  />
                </div>
              </label>
            )}
            {register && (
              <>
                <label className="field">
                  CÓDIGO DE RECUPERACIÓN
                  <div className="input-shell">
                    <Icon name="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="Solo números (mínimo 4)"
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, ''))}
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
                    <Icon name="lock" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="Repite tu código"
                      value={recoveryCodeConfirmation}
                      onChange={(event) =>
                        setRecoveryCodeConfirmation(event.target.value.replace(/\D/g, ''))
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
                <Icon name="mail" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                />
                {email.includes('@') && <Icon name="check" />}
              </div>
            </label>
            <label className="field">
              CONTRASEÑA
              <div className="input-shell">
                <Icon name="lock" />
                <input
                  type="password"
                  autoComplete={register ? 'off' : 'current-password'}
                  placeholder="••••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={72}
                  required
                />
              </div>
              {register && <small>Usa al menos 8 caracteres.</small>}
            </label>
            {register && (
              <label className="field">
                CONFIRMAR CONTRASEÑA
                <div className="input-shell">
                  <Icon name="lock" />
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Repite tu contraseña"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                  />
                </div>
              </label>
            )}
            {!register && (
              <div className="auth-options">
                <label>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  Recordarme
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowRecovery(!showRecovery)}
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
            <Button type="submit" icon="arrow" disabled={busy}>
              {busy ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Entrar y jugar'}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
