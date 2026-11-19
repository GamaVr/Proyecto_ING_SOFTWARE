/** Permite modificar audio, accesibilidad y datos de la cuenta. */
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../api';
import { Heading, Card, Icon, Button, Toggle, useAction } from '../componentes';
import { useApp } from '../contexto';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/tipos';

const tabs = [
  { id: 'audio', label: 'Audio', icon: 'volume' },
  { id: 'interfaz', label: 'Interfaz', icon: 'monitor' },
  { id: 'cuenta', label: 'Cuenta', icon: 'user' },
];

/** Edita preferencias persistidas, opciones de accesibilidad y datos de la cuenta autenticada. */
export function SettingsPage({ tab = 'audio' }: { tab?: string }): ReactNode {
  const { user, settings, setSettings, notify, refresh, logout } = useApp(),
    { busy, run } = useAction(notify);
  const [draft, setDraft] = useState(settings),
    [name, setName] = useState(user.name),
    [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [recoveryCurrentPassword, setRecoveryCurrentPassword] = useState(''),
    [recoveryCode, setRecoveryCode] = useState(''),
    [recoveryCodeConfirmation, setRecoveryCodeConfirmation] = useState('');
  const active = tabs.some((item) => item.id === tab) ? tab : 'audio';
  useEffect(() => setDraft(settings), [settings]);
  /** Cambia una preferencia tipada de la edición actual antes de guardarla. */
  function update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  /** Guarda preferencias en MySQL y activa la configuración global de la sesión. */
  async function save(): Promise<void> {
    const result = await api<{ settings: Settings }>('/settings', 'PUT', draft);
    setSettings(result.settings);
    notify('Cambios guardados.');
  }
  /** Actualiza el nombre público y refresca la cabecera de todas las pantallas. */
  async function saveProfile(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      await api('/me', 'PUT', { name });
      await refresh();
      notify('Perfil actualizado.');
    });
  }
  /** Cambia la contraseña verificando la anterior y renueva la sesión desde el servidor. */
  async function changePassword(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      await api('/me/password', 'PUT', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      notify('Contraseña actualizada. Se cerraron las otras sesiones.');
    });
  }
  /** Define o cambia el código de recuperación tras comprobar la contraseña actual. */
  async function saveRecoveryCode(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (recoveryCode !== recoveryCodeConfirmation) {
      notify('Los códigos de recuperación no coinciden.');
      return;
    }
    await run(async () => {
      await api('/me/recovery-code', 'PUT', {
        currentPassword: recoveryCurrentPassword,
        recoveryCode,
      });
      setRecoveryCurrentPassword('');
      setRecoveryCode('');
      setRecoveryCodeConfirmation('');
      notify('Código de recuperación actualizado.');
    });
  }
  return (
    <>
      <Heading eyebrow="Personaliza tu experiencia" title="OPCIONES" />
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Secciones de opciones">
          {tabs.map((item) => (
            <a
              key={item.id}
              href={`#/opciones/${item.id}`}
              className={active === item.id ? 'active' : ''}
              aria-current={active === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="stack">
          {active === 'audio' && (
            <>
              <Card>
                <h2>AUDIO Y SONIDO</h2>
                <p>Equilibra música, efectos y comunicación.</p>
                {[
                  { key: 'volume' as const, label: 'Volumen general' },
                  { key: 'music' as const, label: 'Fragmentos musicales' },
                  { key: 'effects' as const, label: 'Efectos de interfaz' },
                ].map((item) => (
                  <label className="slider-field" key={item.key}>
                    <span>
                      {item.label}
                      <strong>{draft[item.key]}%</strong>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={draft[item.key]}
                      onChange={(event) => update(item.key, Number(event.target.value))}
                    />
                  </label>
                ))}
              </Card>
              <div className="settings-cards">
                <Card>
                  <h2 className="card-heading">REPRODUCCIÓN</h2>
                  <Toggle
                    label="Cuenta atrás sonora"
                    detail="Aviso en los últimos 3 segundos"
                    value={draft.countdown}
                    onChange={() => update('countdown', !draft.countdown)}
                  />
                  <Toggle
                    label="Reproducción automática"
                    detail="Inicia cada fragmento sin confirmar"
                    value={draft.autoplay}
                    onChange={() => update('autoplay', !draft.autoplay)}
                  />
                </Card>
              </div>
            </>
          )}
          {active === 'interfaz' && (
            <Card>
              <h2 className="card-heading">INTERFAZ Y ACCESIBILIDAD</h2>
              <Toggle
                label="Alto contraste"
                detail="Aumenta la visibilidad de bordes y textos secundarios"
                value={draft.contrast}
                onChange={() => update('contrast', !draft.contrast)}
              />
              <Toggle
                label="Interfaz más grande"
                detail="Amplía textos y controles en toda la aplicación"
                value={draft.largeInterface}
                onChange={() => update('largeInterface', !draft.largeInterface)}
              />
            </Card>
          )}
          {active === 'cuenta' && (
            <>
              <Card>
                <h2 className="card-heading">TU PERFIL</h2>
                <form onSubmit={(event) => void saveProfile(event)}>
                  <label className="field">
                    NOMBRE DE JUGADOR
                    <div className="input-shell">
                      <Icon name="user" />
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        minLength={2}
                        maxLength={30}
                        required
                      />
                    </div>
                  </label>
                  <Button type="submit" icon="save" disabled={busy}>
                    Actualizar perfil
                  </Button>
                </form>
              </Card>
              <Card>
                <h2 className="card-heading">CAMBIAR CONTRASEÑA</h2>
                <form onSubmit={(event) => void changePassword(event)}>
                  <label className="field">
                    CONTRASEÑA ACTUAL
                    <div className="input-shell">
                      <Icon name="lock" />
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        maxLength={72}
                        required
                      />
                    </div>
                  </label>
                  <label className="field">
                    NUEVA CONTRASEÑA
                    <div className="input-shell">
                      <Icon name="lock" />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        minLength={8}
                        maxLength={72}
                        required
                      />
                    </div>
                  </label>
                  <Button type="submit" disabled={busy}>
                    Cambiar contraseña
                  </Button>
                </form>
              </Card>
              <Card>
                <h2 className="card-heading">CÓDIGO DE RECUPERACIÓN</h2>
                <p>Guárdalo en un lugar seguro. Lo necesitarás junto con tu correo si olvidas la contraseña.</p>
                <form onSubmit={(event) => void saveRecoveryCode(event)}>
                  <label className="field">
                    CONTRASEÑA ACTUAL
                    <div className="input-shell">
                      <Icon name="lock" />
                      <input type="password" autoComplete="current-password" value={recoveryCurrentPassword} onChange={(event) => setRecoveryCurrentPassword(event.target.value)} minLength={8} maxLength={72} required />
                    </div>
                  </label>
                  <label className="field">
                    NUEVO CÓDIGO
                    <div className="input-shell">
                      <Icon name="lock" />
                      <input type="password" inputMode="numeric" autoComplete="new-password" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, ''))} minLength={4} maxLength={72} pattern="[0-9]{4,72}" required />
                    </div>
                    <small>Usa mínimo 4 números y no repitas tu contraseña.</small>
                  </label>
                  <label className="field">
                    CONFIRMAR CÓDIGO
                    <div className="input-shell">
                      <Icon name="lock" />
                      <input type="password" inputMode="numeric" autoComplete="new-password" value={recoveryCodeConfirmation} onChange={(event) => setRecoveryCodeConfirmation(event.target.value.replace(/\D/g, ''))} minLength={4} maxLength={72} pattern="[0-9]{4,72}" required />
                    </div>
                  </label>
                  <Button type="submit" icon="save" disabled={busy}>{busy ? 'Guardando…' : 'Guardar código'}</Button>
                </form>
              </Card>
              <Button tone="danger" icon="logout" onClick={() => void run(logout)} disabled={busy}>
                Cerrar sesión
              </Button>
            </>
          )}
          {(active === 'audio' || active === 'interfaz') && (
            <div className="row between settings-actions">
              <Button tone="ghost" onClick={() => setDraft(DEFAULT_SETTINGS)}>
                Restablecer valores
              </Button>
              <Button icon="save" disabled={busy} onClick={() => void run(save)}>
                {busy ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
