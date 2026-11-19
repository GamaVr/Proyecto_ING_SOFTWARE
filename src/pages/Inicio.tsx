/** Muestra el inicio y la selección de modos de juego. */
import type { ReactNode } from 'react';
import { Heading, Badge, Icon, Metric, Card, Button, points } from '../componentes';
import { useApp } from '../contexto';
import { useSocial } from '../social';

const modes = [
  {
    route: 'un-jugador',
    tone: 'cyan',
    icon: 'solo',
    title: 'UN JUGADOR',
    tag: 'A tu ritmo',
    description: 'Afina tu oído y supera tus propios récords a tu ritmo.',
    glow: '18c42',
    arrow: 'arrowCyan',
  },
  {
    route: 'duelo',
    tone: 'purple',
    icon: 'duel',
    title: 'DUELO 1 VS 1',
    tag: 'Con un amigo',
    description: 'Crea una sala e invita a un amigo. Cada segundo cuenta.',
    glow: 'd1370',
    arrow: 'arrowPurple',
  },
  {
    route: 'equipos',
    tone: 'pink',
    icon: 'teams',
    title: 'EQUIPOS 2 VS 2',
    tag: 'Con amigos',
    description: 'Crea una sala, invita a tu crew y combinad vuestro conocimiento.',
    glow: 'ed158',
    arrow: 'arrowPink',
  },
];

/** Presenta los modos de juego y estadísticas obtenidas de las partidas guardadas en MySQL. */
export function HomePage(): ReactNode {
  const { user, stats } = useApp();
  const { data: social } = useSocial();
  return (
    <>
      <Heading eyebrow={`Bienvenido ${user.name}.`} title="ELIGE TU ESCENARIO" />
      <div className="home-grid">
        <div>
          <div className="mode-grid">
            {modes.map((mode) => (
              <a href={`#/${mode.route}`} className={`mode-card ${mode.tone}`} key={mode.route}>
                <img className="mode-glow" src={`/assets/figma/${mode.glow}.svg`} alt="" />
                <div className="row between">
                  <span className="mode-icon">
                    <Icon name={mode.icon} />
                  </span>
                  <Badge tone={mode.tone}>
                    {mode.route === 'un-jugador' && stats.bestStreak > 0
                      ? `Racha x${stats.bestStreak}`
                      : mode.tag}
                  </Badge>
                </div>
                <h2>{mode.title}</h2>
                <p>{mode.description}</p>
                <div className="mode-link">
                  <span>Jugar ahora</span>
                  <Icon name={mode.arrow} />
                </div>
              </a>
            ))}
          </div>
          <div className="metrics two">
            <Metric icon="gamepad" label="Partidas jugadas" value={points(stats.played)} />
            <Metric icon="zap" label="Mejor racha" value={stats.bestStreak} />
          </div>
        </div>
        <Card className="friends-summary">
          <Badge icon="users">Tu comunidad</Badge>
          <h2>JUEGA CON AMIGOS</h2>
          <p>Agrega usuarios e invítalos a tus salas de duelo o de equipos.</p>
          <p>
            <strong className="cyan-text">{social?.friends.length || 0}</strong> amigos agregados
          </p>
          {!!social?.invitations.length && (
            <Badge tone="purple">{social.invitations.length} invitaciones recibidas</Badge>
          )}
          <Button
            tone="secondary"
            icon="users"
            onClick={() => {
              window.location.hash = '/amigos';
            }}
          >
            Ver amigos e invitaciones
          </Button>
        </Card>
      </div>
    </>
  );
}
