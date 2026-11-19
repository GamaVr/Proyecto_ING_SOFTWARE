/** Reúne los controles visuales y utilidades comunes de las pantallas. */
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { io } from 'socket.io-client';

const icons: Record<string, string> = {
  logo: 'c8e83',
  home: '0ce20',
  homeActive: '0ca5d',
  headphones: '15f59',
  headphonesActive: '757bc',
  users: 'e9525',
  usersActive: '8b9d1',
  settings: '89084',
  settingsActive: '96138',
  solo: '4138c',
  duel: '93cb3',
  teams: 'e5a1b',
  arrow: 'fa537',
  arrowCyan: '2be70',
  arrowPurple: '00b01',
  arrowPink: '53327',
  gamepad: '4d546',
  zap: '5f232',
  sparkles: 'bc82e',
  radio: '9e193',
  mail: 'a1d15',
  lock: 'f5505',
  check: '33f7f',
  disc: '53d47',
  list: '54ec5',
  timer: '6fc3d',
  text: '0a797',
  clock: 'c85bc',
  play: 'a7ae2',
  trophy: '49814',
  pause: '86780',
  volume: 'b048d',
  send: '4fe1d',
  search: '9a581',
  correct: '1ed94',
  logout: '6873a',
  save: '6741e',
  monitor: '7710a',
  user: '0132f',
  flame: '0a548',
  crown: 'ef232',
  swap: '80963',
  plus: '39269',
  info: '59d1f',
  rotate: '73670',
  chat: 'd343c',
};

/** Muestra un recurso SVG original de Figma a sus dimensiones intrínsecas. */
export function Icon({ name }: { name: string }): ReactNode {
  return (
    <span className="icon" aria-hidden="true">
      <img src={`/assets/figma/${icons[name] || icons.disc}.svg`} alt="" />
    </span>
  );
}

/** Renderiza la identidad visual reutilizada en acceso y navegación. */
export function Brand(): ReactNode {
  return (
    <a className="brand" href="#/inicio" aria-label="Guess The Beat, inicio">
      <span className="brand-mark">
        <Icon name="logo" />
      </span>
      <span>GUESS THE BEAT</span>
    </a>
  );
}

/** Dibuja las luces ambientales con los archivos originales exportados desde Figma. */
export function Ambient({ auth = false }: { auth?: boolean }): ReactNode {
  return (
    <div className={`ambient ${auth ? 'ambient-auth' : ''}`} aria-hidden="true">
      <img className="glow-one" src={`/assets/figma/${auth ? '90c35' : 'f2f21'}.svg`} alt="" />
      <img className="glow-two" src={`/assets/figma/${auth ? 'a8693' : '0903b'}.svg`} alt="" />
    </div>
  );
}

/** Presenta una etiqueta compacta de estado sin depender exclusivamente del color. */
export function Badge({
  children,
  tone = 'cyan',
  icon,
}: {
  children: ReactNode;
  tone?: string;
  icon?: string;
}): ReactNode {
  return (
    <span className={`badge ${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

/** Crea un botón accesible con variante, icono y bloqueo durante operaciones pendientes. */
export function Button({
  children,
  onClick,
  tone = 'primary',
  icon,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: string;
  icon?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}): ReactNode {
  return (
    <button
      type={type}
      className={`button ${tone} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** Agrupa contenido en una tarjeta con borde y superficie de los tokens del diseño. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return <section className={`card ${className}`}>{children}</section>;
}

/** Organiza la introducción de cada pantalla y una acción opcional a la derecha. */
export function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

const heights = [
  13, 24, 17, 32, 22, 40, 27, 45, 30, 19, 37, 49, 32, 22, 42, 27, 47, 35, 20, 36, 52, 27, 40, 23,
  33, 46, 27, 16, 36, 24, 43, 30, 17, 35, 20, 48, 29, 40, 22, 32,
];

/** Representa la onda del diseño y anima sus barras solo mientras hay reproducción real. */
export function Waveform({
  playing = false,
  progress = 0.62,
}: {
  playing?: boolean;
  progress?: number;
}): ReactNode {
  return (
    <div className={`waveform ${playing ? 'playing' : ''}`} aria-hidden="true">
      {heights.map((height, i) => (
        <span
          key={i}
          className={i / heights.length < progress ? 'lit' : ''}
          style={{ height, animationDelay: `${i * -0.07}s` }}
        />
      ))}
    </div>
  );
}

/** Construye una barra segmentada y etiqueta el avance para lectores de pantalla. */
export function Progress({
  value,
  total = 10,
  label,
}: {
  value: number;
  total?: number;
  label?: string;
}): ReactNode {
  return (
    <div className="progress">
      <div className="progress-label">
        <span>{label}</span>
        <small>{Math.round((value / total) * 100)}%</small>
      </div>
      <div
        className="segments"
        role="progressbar"
        aria-label={label || 'Progreso'}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
      >
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < value ? 'complete' : ''} />
        ))}
      </div>
    </div>
  );
}

/** Muestra un valor estadístico real con su etiqueta e icono opcional. */
export function Metric({
  label,
  value,
  icon,
  cyan = false,
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  cyan?: boolean;
}): ReactNode {
  return (
    <div className={`metric ${cyan ? 'cyan-text' : ''}`}>
      {icon && <Icon name={icon} />}
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

/** Presenta una inicial derivada del nombre real del usuario o jugador. */
export function Avatar({
  name,
  purple = false,
  large = false,
}: {
  name: string;
  purple?: boolean;
  large?: boolean;
}): ReactNode {
  return (
    <span className={`avatar ${purple ? 'purple' : ''} ${large ? 'large' : ''}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Muestra un interruptor con semántica ARIA y etiqueta accesible. */
export function Toggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: () => void;
}): ReactNode {
  return (
    <div className="toggle-row">
      <div>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <button
        className={`toggle ${value ? 'on' : ''}`}
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}

/** Sincroniza un recurso mediante Socket.IO con sondeo de respaldo y libera suscripciones al salir. */
export function useLive<T>(
  channel: string,
  fetcher: () => Promise<T>,
): { data: T | null; setData: (data: T) => void; error: string } {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState('');
  const latest = useRef(fetcher);
  latest.current = fetcher;
  useEffect(() => {
    let disposed = false,
      running = false;
    /** Actualiza el recurso sin solapar solicitudes de sondeo y notificaciones. */
    async function refresh(): Promise<void> {
      if (running) return;
      running = true;
      try {
        const value = await latest.current();
        if (!disposed) {
          setData(value);
          setError('');
        }
      } catch (failure) {
        if (!disposed) setError((failure as Error).message);
      } finally {
        running = false;
      }
    }
    const socket = io({ autoConnect: true });
    socket.on('connect', () => socket.emit('subscribe', channel));
    socket.on('refresh', refresh);
    void refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      socket.disconnect();
    };
  }, [channel]);
  return { data, setData, error };
}

/** Evita dobles envíos y centraliza los mensajes de operaciones asíncronas del usuario. */
export function useAction(notify: (message: string) => void): {
  busy: boolean;
  run: (operation: () => Promise<void>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  /** Ejecuta una operación exclusiva y vuelve a habilitar controles tanto en éxito como en error. */
  async function run(operation: () => Promise<void>): Promise<void> {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Formatea puntuaciones de forma coherente con la presentación en español del diseño. */
export function points(value: number): string {
  return value.toLocaleString('es-ES');
}
