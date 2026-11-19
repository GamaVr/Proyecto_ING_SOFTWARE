/** Muestra el inicio y la selección de modos de juego. */
import type { ReactNode } from 'react';
import {
  Encabezado,
  Insignia,
  Icono,
  Metrica,
  Tarjeta,
  Boton,
  puntos,
} from '../componentes/comunes';
import { useAplicacion } from '../estado/contexto';
import { useSocial } from '../estado/social';

const modos = [
  {
    rutaDestino: 'un-jugador',
    tono: 'cyan',
    icono: 'solo',
    titulo: 'UN JUGADOR',
    lema: 'A tu ritmo',
    descripcion: 'Afina tu oído y supera tus propios récords a tu ritmo.',
    brillo: '18c42',
    iconoFlecha: 'arrowCyan',
  },
  {
    rutaDestino: 'duelo',
    tono: 'purple',
    icono: 'duel',
    titulo: 'DUELO 1 VS 1',
    lema: 'Con un amigo',
    descripcion: 'Crea una sala e invita a un amigo. Cada segundo cuenta.',
    brillo: 'd1370',
    iconoFlecha: 'arrowPurple',
  },
  {
    rutaDestino: 'equipos',
    tono: 'pink',
    icono: 'teams',
    titulo: 'EQUIPOS 2 VS 2',
    lema: 'Con amigos',
    descripcion: 'Crea una sala, invita a tu crew y combinad vuestro conocimiento.',
    brillo: 'ed158',
    iconoFlecha: 'arrowPink',
  },
];

/** Presenta los modos de juego y estadísticas obtenidas de las partidas guardadas en MySQL. */
export function PaginaInicio(): ReactNode {
  const { usuario, estadisticas } = useAplicacion();
  const { datos: social } = useSocial();
  return (
    <>
      <Encabezado antetitulo={`Bienvenido ${usuario.nombre}.`} titulo="ELIGE TU ESCENARIO" />
      <div className="home-grid">
        <div>
          <div className="mode-grid">
            {modos.map((modo) => (
              <a
                href={`#/${modo.rutaDestino}`}
                className={`mode-card ${modo.tono}`}
                key={modo.rutaDestino}
              >
                <img className="mode-glow" src={`/assets/figma/${modo.brillo}.svg`} alt="" />
                <div className="row between">
                  <span className="mode-icon">
                    <Icono nombre={modo.icono} />
                  </span>
                  <Insignia tono={modo.tono}>
                    {modo.rutaDestino === 'un-jugador' && estadisticas.mejorRacha > 0
                      ? `Racha x${estadisticas.mejorRacha}`
                      : modo.lema}
                  </Insignia>
                </div>
                <h2>{modo.titulo}</h2>
                <p>{modo.descripcion}</p>
                <div className="mode-link">
                  <span>Jugar ahora</span>
                  <Icono nombre={modo.iconoFlecha} />
                </div>
              </a>
            ))}
          </div>
          <div className="metrics two">
            <Metrica
              icono="gamepad"
              etiqueta="Partidas jugadas"
              valor={puntos(estadisticas.jugadas)}
            />
            <Metrica icono="zap" etiqueta="Mejor racha" valor={estadisticas.mejorRacha} />
          </div>
        </div>
        <Tarjeta className="friends-summary">
          <Insignia icono="users">Tu comunidad</Insignia>
          <h2>JUEGA CON AMIGOS</h2>
          <p>Agrega usuarios e invítalos a tus salas de duelo o de equipos.</p>
          <p>
            <strong className="cyan-text">{social?.amigos.length || 0}</strong> amigos agregados
          </p>
          {!!social?.invitaciones.length && (
            <Insignia tono="purple">{social.invitaciones.length} invitaciones recibidas</Insignia>
          )}
          <Boton
            tono="secondary"
            icono="users"
            onClick={() => {
              window.location.hash = '/amigos';
            }}
          >
            Ver amigos e invitaciones
          </Boton>
        </Tarjeta>
      </div>
    </>
  );
}
