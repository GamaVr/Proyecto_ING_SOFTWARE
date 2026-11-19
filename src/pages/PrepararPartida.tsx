/** Configura género, rondas y tiempo del modo individual. */
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Heading, Card, Icon, Badge, Button, Metric, useAction, points } from '../componentes';
import { useApp, navigate } from '../contexto';
import { useMusicOptions } from '../musica';
import { DEFAULT_CONFIG, type GameConfig, type GameSnapshot } from '../../shared/tipos';

/** Controla filtros y rondas y crea una partida individual persistida. */
export function SetupPage(): ReactNode {
  const { options, error, loading } = useMusicOptions();
  const { notify, stats } = useApp();
  const { busy, run } = useAction(notify);
  const [config, setConfig] = useState<GameConfig>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('beat-config') || '{}');
      delete saved.decade;
      return { ...DEFAULT_CONFIG, ...saved };
    } catch {
      return DEFAULT_CONFIG;
    }
  });
  useEffect(() => {
    if (loading || error) return;
    setConfig((current) => ({
      ...current,
      genre:
        current.genre === 'Todas' || options.genres.some((item) => item.name === current.genre)
          ? current.genre
          : 'Todas',
      seconds: [20, 30].includes(current.seconds) ? current.seconds : DEFAULT_CONFIG.seconds,
    }));
  }, [loading, error, options]);
  /** Actualiza un campo tipado y recuerda solo preferencias, nunca credenciales o puntuaciones. */
  function update<K extends keyof GameConfig>(key: K, value: GameConfig[K]): void {
    setConfig((current) => ({ ...current, [key]: value }));
  }
  /** Pide al servidor que elija canciones y prepare la primera ronda. */
  async function begin(): Promise<void> {
    localStorage.setItem('beat-config', JSON.stringify(config));
    const game = await api<GameSnapshot>('/games', 'POST', config);
    sessionStorage.setItem('beat-game', game.id);
    navigate(`partida/${game.id}`);
  }
  return (
    <>
      <Heading eyebrow="Modo un jugador" title="PREPARA TU SESIÓN" />
      <div className="split-layout">
        <div className="stack">
          <Card>
            <div className="row between card-heading">
              <div>
                <h2>CONFIGURA LA PARTIDA</h2>
                <p>Elige el terreno de juego que mejor suena contigo.</p>
              </div>
              <Badge icon="trophy">Récord: {points(stats.bestScore)}</Badge>
            </div>
            <div className="config-grid">
              <label className="select-field">
                <Icon name="disc" />
                <span>
                  <small>GÉNERO</small>
                  <select
                    value={config.genre}
                    onChange={(e) => update('genre', e.target.value as GameConfig['genre'])}
                  >
                    <option>Todas</option>
                    {options.genres.map((genre) => (
                      <option key={genre.name} value={genre.name}>
                        {genre.name} ({genre.count})
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icon name="list" />
                <span>
                  <small>NÚMERO DE RONDAS</small>
                  <select
                    value={config.rounds}
                    onChange={(e) => update('rounds', Number(e.target.value))}
                  >
                    <option value={5}>5 canciones</option>
                    <option value={8}>8 canciones</option>
                    <option value={10}>10 canciones</option>
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icon name="timer" />
                <span>
                  <small>TIEMPO POR RONDA</small>
                  <select
                    value={config.seconds}
                    onChange={(e) => update('seconds', Number(e.target.value))}
                  >
                    {[20, 30].map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds} segundos
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="select-field">
                <Icon name="text" />
                <span>
                  <small>TIPO DE RESPUESTA</small>
                  <select
                    value={config.answerMode}
                    onChange={(e) =>
                      update('answerMode', e.target.value as GameConfig['answerMode'])
                    }
                  >
                    <option value="both">Canción o artista</option>
                    <option value="title">Solo canción</option>
                  </select>
                </span>
              </label>
            </div>
          </Card>
          <p className="subtle-note">
            {error ||
              `${options.total} canciones oficiales de ${options.artists} artistas. Requiere Internet.`}
          </p>
        </div>
        <aside className="stack">
          <Card className="preview-card">
            <Badge>Vista previa</Badge>
            <div className="metrics two plain">
              <Metric
                label="Duración"
                value={`~${Math.max(1, Math.ceil((config.rounds * (config.seconds + 4)) / 60))} min`}
                cyan
              />
            </div>
            <Button
              icon="play"
              disabled={busy || loading || !!error}
              onClick={() => void run(begin)}
            >
              {busy ? 'Preparando…' : 'Comenzar partida'}
            </Button>
          </Card>
          <p className="subtle-note">Consejo: cuanto antes respondas, más puntos sumarás.</p>
        </aside>
      </div>
    </>
  );
}
