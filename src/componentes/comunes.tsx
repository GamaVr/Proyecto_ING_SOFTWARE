/** Reúne los controles visuales y utilidades comunes de las pantallas. */
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { io } from 'socket.io-client';

const iconos: Record<string, string> = {
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
export function Icono({ nombre }: { nombre: string }): ReactNode {
  return (
    <span className="icon" aria-hidden="true">
      <img src={`/assets/figma/${iconos[nombre] || iconos.disc}.svg`} alt="" />
    </span>
  );
}

/** Renderiza la identidad visual reutilizada en acceso y navegación. */
export function Marca(): ReactNode {
  return (
    <a className="brand" href="#/inicio" aria-label="Guess The Beat, inicio">
      <span className="brand-mark">
        <Icono nombre="logo" />
      </span>
      <span>GUESS THE BEAT</span>
    </a>
  );
}

/** Dibuja las luces ambientales con los archivos originales exportados desde Figma. */
export function Ambiente({ acceso: acceso = false }: { acceso?: boolean }): ReactNode {
  return (
    <div className={`ambient ${acceso ? 'ambient-auth' : ''}`} aria-hidden="true">
      <img className="glow-one" src={`/assets/figma/${acceso ? '90c35' : 'f2f21'}.svg`} alt="" />
      <img className="glow-two" src={`/assets/figma/${acceso ? 'a8693' : '0903b'}.svg`} alt="" />
    </div>
  );
}

/** Presenta una etiqueta compacta de estado sin depender exclusivamente del color. */
export function Insignia({
  children,
  tono: tono = 'cyan',
  icono,
}: {
  children: ReactNode;
  tono?: string;
  icono?: string;
}): ReactNode {
  return (
    <span className={`badge ${tono}`}>
      {icono && <Icono nombre={icono} />}
      {children}
    </span>
  );
}

/** Crea un botón accesible con variante, icono y bloqueo durante operaciones pendientes. */
export function Boton({
  children,
  onClick,
  tono: tono = 'primary',
  icono,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  tono?: string;
  icono?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}): ReactNode {
  return (
    <button
      type={type}
      className={`button ${tono} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icono && <Icono nombre={icono} />}
      {children}
    </button>
  );
}

/** Agrupa contenido en una tarjeta con borde y superficie de los tokens del diseño. */
export function Tarjeta({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return <section className={`card ${className}`}>{children}</section>;
}

/** Organiza la introducción de cada pantalla y una acción opcional a la derecha. */
export function Encabezado({
  antetitulo,
  titulo,
  children,
}: {
  antetitulo: string;
  titulo: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{antetitulo}</p>
        <h1>{titulo}</h1>
      </div>
      {children}
    </div>
  );
}

const alturas = [
  13, 24, 17, 32, 22, 40, 27, 45, 30, 19, 37, 49, 32, 22, 42, 27, 47, 35, 20, 36, 52, 27, 40, 23,
  33, 46, 27, 16, 36, 24, 43, 30, 17, 35, 20, 48, 29, 40, 22, 32,
];

/** Representa la onda del diseño y anima sus barras solo mientras hay reproducción real. */
export function FormaOnda({
  reproduciendo: reproduciendo = false,
  progreso: progreso = 0.62,
}: {
  reproduciendo?: boolean;
  progreso?: number;
}): ReactNode {
  return (
    <div className={`waveform ${reproduciendo ? 'playing' : ''}`} aria-hidden="true">
      {alturas.map((altura, i) => (
        <span
          key={i}
          className={i / alturas.length < progreso ? 'lit' : ''}
          style={{ height: altura, animationDelay: `${i * -0.07}s` }}
        />
      ))}
    </div>
  );
}

/** Construye una barra segmentada y etiqueta el avance para lectores de pantalla. */
export function Progreso({
  valor,
  total = 10,
  etiqueta,
}: {
  valor: number;
  total?: number;
  etiqueta?: string;
}): ReactNode {
  return (
    <div className="progress">
      <div className="progress-label">
        <span>{etiqueta}</span>
        <small>{Math.round((valor / total) * 100)}%</small>
      </div>
      <div
        className="segments"
        role="progressbar"
        aria-label={etiqueta || 'Progreso'}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={valor}
      >
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < valor ? 'complete' : ''} />
        ))}
      </div>
    </div>
  );
}

/** Muestra un valor estadístico real con su etiqueta e icono opcional. */
export function Metrica({
  etiqueta,
  valor,
  icono,
  cyan = false,
}: {
  etiqueta: string;
  valor: ReactNode;
  icono?: string;
  cyan?: boolean;
}): ReactNode {
  return (
    <div className={`metric ${cyan ? 'cyan-text' : ''}`}>
      {icono && <Icono nombre={icono} />}
      <div>
        <strong>{valor}</strong>
        <small>{etiqueta}</small>
      </div>
    </div>
  );
}

/** Presenta una inicial derivada del nombre real del usuario o jugador. */
export function Avatar({
  nombre,
  purple = false,
  grande: grande = false,
}: {
  nombre: string;
  purple?: boolean;
  grande?: boolean;
}): ReactNode {
  return (
    <span className={`avatar ${purple ? 'purple' : ''} ${grande ? 'large' : ''}`}>
      {nombre.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Muestra un interruptor con semántica ARIA y etiqueta accesible. */
export function Interruptor({
  etiqueta,
  detalle,
  valor,
  onChange,
}: {
  etiqueta: string;
  detalle?: string;
  valor: boolean;
  onChange: () => void;
}): ReactNode {
  return (
    <div className="toggle-row">
      <div>
        <strong>{etiqueta}</strong>
        {detalle && <small>{detalle}</small>}
      </div>
      <button
        className={`toggle ${valor ? 'on' : ''}`}
        type="button"
        role="switch"
        aria-checked={valor}
        aria-label={etiqueta}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}

/** Sincroniza un recurso mediante Socket.IO con sondeo de respaldo y libera suscripciones al salir. */
export function useEnVivo<T>(
  canal: string,
  consultarProveedor: () => Promise<T>,
): { datos: T | null; fijarDatos: (datos: T) => void; error: string } {
  const [datos, fijarDatos] = useState<T | null>(null),
    [error, fijarError] = useState('');
  const masReciente = useRef(consultarProveedor);
  masReciente.current = consultarProveedor;
  useEffect(() => {
    let descartado = false,
      enCurso = false;
    /** Actualiza el recurso sin solapar solicitudes de sondeo y notificaciones. */
    async function actualizar(): Promise<void> {
      if (enCurso) return;
      enCurso = true;
      try {
        const valor = await masReciente.current();
        if (!descartado) {
          fijarDatos(valor);
          fijarError('');
        }
      } catch (fallo) {
        if (!descartado) fijarError((fallo as Error).message);
      } finally {
        enCurso = false;
      }
    }
    const socket = io({ autoConnect: true });
    socket.on('connect', () => socket.emit('suscribir', canal));
    socket.on('actualizar', actualizar);
    void actualizar();
    const temporizador = window.setInterval(actualizar, 2000);
    return () => {
      descartado = true;
      window.clearInterval(temporizador);
      socket.disconnect();
    };
  }, [canal]);
  return { datos, fijarDatos, error };
}

/** Evita dobles envíos y centraliza los mensajes de operaciones asíncronas del usuario. */
export function useAccion(notificar: (mensaje: string) => void): {
  ocupado: boolean;
  ejecutar: (operacion: () => Promise<void>) => Promise<void>;
} {
  const [ocupado, fijarOcupado] = useState(false);
  const activo = useRef(false);
  /** Ejecuta una operación exclusiva y vuelve a habilitar controles tanto en éxito como en error. */
  async function ejecutar(operacion: () => Promise<void>): Promise<void> {
    if (activo.current) return;
    activo.current = true;
    fijarOcupado(true);
    try {
      await operacion();
    } catch (error) {
      notificar((error as Error).message);
    } finally {
      activo.current = false;
      fijarOcupado(false);
    }
  }
  return { ocupado, ejecutar };
}

/** Formatea puntuaciones de forma coherente con la presentación en español del diseño. */
export function puntos(valor: number): string {
  return valor.toLocaleString('es-ES');
}
