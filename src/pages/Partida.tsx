/** Muestra las rondas, reproduce los fragmentos y presenta los resultados. */
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { api } from '../api';
import {
  Heading,
  Card,
  Badge,
  Button,
  Icon,
  Metric,
  Progress,
  Waveform,
  Avatar,
  useLive,
  useAction,
  points,
} from '../componentes';
import { useApp, navigate } from '../contexto';
import type { GameSnapshot } from '../../shared/tipos';
import { remainingRoundSeconds } from '../../shared/reloj-partida';
import { countdownBeep } from '../audio';

interface MusicSearchTrack {
  id: string;
  title: string;
  artist: string;
}

/** Ejecuta una partida con reloj del servidor, audio real y envío único por ronda. */
export function GamePage({ id }: { id: string }): ReactNode {
  const { user, notify, settings } = useApp(),
    { busy, run } = useAction(notify);
  const {
    data: game,
    setData,
    error,
  } = useLive<GameSnapshot>(`game:${id}`, () => api(`/games/${id}`));
  const [answer, setAnswer] = useState(''),
    [now, setNow] = useState(Date.now()),
    [playing, setPlaying] = useState(false),
    [audioTime, setAudioTime] = useState(0),
    [suggestions, setSuggestions] = useState<MusicSearchTrack[]>([]),
    [searchOpen, setSearchOpen] = useState(false),
    [searchLoading, setSearchLoading] = useState(false),
    [previewTrackId, setPreviewTrackId] = useState<string | null>(null),
    [previewPlaying, setPreviewPlaying] = useState(false),
    [blocked, setBlocked] = useState(false),
    [audioError, setAudioError] = useState(false),
    [confirmLeave, setConfirmLeave] = useState(false),
    [ended, setEnded] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    previewAudio = useRef<HTMLAudioElement>(null),
    input = useRef<HTMLInputElement>(null),
    offset = useRef(0),
    submittedTimeout = useRef(-1);
  useEffect(() => {
    if (game) offset.current = game.serverNow - Date.now();
  }, [game?.serverNow]);
  const round = game?.round,
    startedAt = game?.startedAt;
  useEffect(() => {
    if (!startedAt || game?.answered || game?.status !== 'playing') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [id, round, startedAt, game?.answered, game?.status]);
  useEffect(() => {
    if (!game) return;
    if (game.status === 'finished') {
      navigate(`resultados/${id}`);
      return;
    }
    if (game.status === 'abandoned') {
      notify('La partida fue abandonada.');
      navigate('inicio');
    }
  }, [game?.status, id, notify]);
  useEffect(() => {
    setAnswer('');
    setSuggestions([]);
    setSearchOpen(false);
    previewAudio.current?.pause();
    setPreviewTrackId(null);
    setPreviewPlaying(false);
    setAudioTime(0);
    setPlaying(false);
    setEnded(false);
    setBlocked(false);
    setAudioError(false);
    submittedTimeout.current = -1;
    if (!startedAt) return;
    const timer = window.setTimeout(
      () => {
        input.current?.focus();
        if (settings.autoplay) void audio.current?.play().catch(() => setBlocked(true));
      },
      Math.max(0, startedAt - (Date.now() + offset.current)),
    );
    return () => {
      window.clearTimeout(timer);
      audio.current?.pause();
    };
  }, [id, round, startedAt, settings.autoplay]);
  useEffect(() => {
    if (audio.current) {
      audio.current.volume = ((settings.volume / 100) * settings.music) / 100;
      audio.current.playbackRate = 1;
    }
    if (previewAudio.current)
      previewAudio.current.volume = ((settings.volume / 100) * settings.music) / 100;
  }, [settings.volume, settings.music, round]);
  const remaining = game ? remainingRoundSeconds(game, user.id, now + offset.current) : 0;
  const waiting = game ? now + offset.current < game.startedAt : true;
  useEffect(() => {
    const term = answer.trim();
    if (!searchOpen || term.length < 2 || !game || waiting || game.answered) {
      setSuggestions([]);
      setSearchLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void api<{ tracks: MusicSearchTrack[] }>(`/music/search?q=${encodeURIComponent(term)}`)
        .then((result) => {
          if (active) setSuggestions(result.tracks);
        })
        .catch(() => {
          if (active) setSuggestions([]);
        })
        .finally(() => {
          if (active) setSearchLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [answer, searchOpen, game?.answered, game?.status, waiting]);
  const lastBeep = useRef('');
  useEffect(() => {
    const second = Math.ceil(remaining),
      key = `${round}:${second}`;
    if (
      settings.countdown &&
      !waiting &&
      !game?.answered &&
      second > 0 &&
      second <= 3 &&
      key !== lastBeep.current
    ) {
      lastBeep.current = key;
      countdownBeep(((settings.volume / 100) * settings.effects) / 100);
    }
  }, [remaining, waiting, game?.answered, round, settings]);
  useEffect(() => {
    if (
      !game ||
      game.status !== 'playing' ||
      waiting ||
      remaining > 0 ||
      game.answered ||
      busy ||
      submittedTimeout.current === game.round
    )
      return;
    submittedTimeout.current = game.round;
    void run(async () => {
      audio.current?.pause();
      previewAudio.current?.pause();
      setSearchOpen(false);
      setData(
        await api<GameSnapshot>(`/games/${id}/answer`, 'POST', { answer: '', round: game.round }),
      );
    });
  }, [game, remaining, waiting, busy, id, run, setData]);

  /** Envía una respuesta o un pase y detiene el audio hasta la siguiente ronda. */
  async function submit(event?: FormEvent, skip = false): Promise<void> {
    event?.preventDefault();
    if (!game || game.answered) return;
    setSearchOpen(false);
    previewAudio.current?.pause();
    await run(async () => {
      const next = await api<GameSnapshot>(`/games/${id}/answer`, 'POST', {
        answer: skip ? '' : answer,
        round: game.round,
      });
      audio.current?.pause();
      setData(next);
    });
  }
  /** Reproduce una muestra de una coincidencia, respetando la sesión de audio del juego. */
  async function toggleSearchPreview(track: MusicSearchTrack): Promise<void> {
    const element = previewAudio.current;
    if (!element) return;
    audio.current?.pause();
    if (previewTrackId === track.id && previewPlaying) {
      element.pause();
      return;
    }
    element.pause();
    element.src = `/api/music/search/${encodeURIComponent(track.id)}/audio`;
    element.currentTime = 0;
    setPreviewTrackId(track.id);
    try {
      await element.play();
    } catch {
      notify('No se pudo reproducir la muestra de esta canción.');
    }
  }
  /** Alterna pausa y reproducción y respeta la restricción de no repetir el fragmento. */
  async function toggleAudio(): Promise<void> {
    if (!audio.current || !game) return;
    if (playing) audio.current.pause();
    else {
      if (ended) {
        audio.current.currentTime = game.audioStart;
        setEnded(false);
      }
      try {
        await audio.current.play();
        setBlocked(false);
      } catch {
        setAudioError(true);
      }
    }
  }
  /** Confirma el abandono en el servidor y devuelve al menú. */
  async function leave(): Promise<void> {
    await api(`/games/${id}/abandon`, 'POST');
    sessionStorage.removeItem('beat-game');
    navigate('inicio');
  }
  if (!game)
    return (
      <div className="loading" role="status">
        {error || 'Preparando el escenario…'}
      </div>
    );
  const me = game.players.find((player) => player.id === user.id)!,
    mine = game.results.filter((result) => result.userId === user.id),
    result = mine.find((item) => item.round === game.round),
    correct = mine.filter((item) => item.correct).length;
  const solo = game.mode === 'solo';
  const score0 = game.players.filter((p) => p.team === 0).reduce((sum, p) => sum + p.score, 0),
    score1 = game.players.filter((p) => p.team === 1).reduce((sum, p) => sum + p.score, 0);
  return (
    <>
      <Heading
        eyebrow={
          solo
            ? 'Partida en curso'
            : `Ronda ${game.round + 1} de ${game.total} · ${game.mode === 'teams' ? 'Equipos 2 vs 2' : 'Duelo 1 vs 1'}`
        }
        title={
          solo
            ? `${game.config.genre === 'Todas' ? 'MIX DE MELODÍAS' : game.config.genre.toUpperCase()}`
            : game.mode === 'teams'
              ? 'BATALLA DE EQUIPOS'
              : 'DUELO EN DIRECTO'
        }
      />
      {!solo && (
        <div className="scoreboard">
          <div className="team-score">
            <span>
              <strong>
                {game.mode === 'teams' ? 'EQUIPO 1' : game.players.find((p) => p.team === 0)?.name}
              </strong>
              <small>
                {game.players
                  .filter((p) => p.team === 0)
                  .map((p) => p.name)
                  .join(' + ')}
              </small>
            </span>
            <strong>{points(score0)}</strong>
          </div>
          <div className="timer-box">
            <small>TIEMPO</small>
            <strong>{waiting ? '…' : remaining.toFixed(1).padStart(4, '0')}</strong>
          </div>
          <div className="team-score purple">
            <strong>{points(score1)}</strong>
            <span>
              <strong>
                {game.mode === 'teams' ? 'EQUIPO 2' : game.players.find((p) => p.team === 1)?.name}
              </strong>
              <small>
                {game.players
                  .filter((p) => p.team === 1)
                  .map((p) => p.name)
                  .join(' + ')}
              </small>
            </span>
          </div>
        </div>
      )}
      <div className="split-layout">
        <div className="stack">
          <div className="round-top">
            <Progress
              label={`Ronda ${game.round + 1} de ${game.total}`}
              value={game.round + 1}
              total={game.total}
            />
            {solo && (
              <div className={`timer-box ${remaining < 5 && !waiting ? 'urgent' : ''}`}>
                <Icon name="timer" />
                <strong>{waiting ? '…' : remaining.toFixed(1).padStart(4, '0')}</strong>
              </div>
            )}
          </div>
          <Card className={`audio-card ${playing ? 'active' : ''}`}>
            <div className="row between">
              <div className="row gap">
                <button
                  className="audio-toggle"
                  onClick={() => void toggleAudio()}
                  disabled={waiting || game.answered}
                  aria-label={playing ? 'Pausar fragmento' : 'Reproducir fragmento'}
                >
                  <Icon name={playing ? 'pause' : 'play'} />
                </button>
                <div>
                  <h2>
                    FRAGMENTO {solo ? `#${String(game.round + 1).padStart(2, '0')}` : 'MISTERIOSO'}
                  </h2>
                  <small>
                    {waiting ? 'Prepárate, la ronda está por comenzar…' : 'Escucha con atención…'}
                  </small>
                </div>
              </div>
              <small>
                {Math.floor(audioTime).toString().padStart(2, '0')} / 00:
                {String(game.audioDuration).padStart(2, '0')}
              </small>
            </div>
            <Waveform playing={playing} progress={audioTime / game.audioDuration} />
            <div className="row between audio-footer">
              <small className="cyan-text">
                ●{' '}
                {game.answered
                  ? 'RESPUESTA ENVIADA'
                  : waiting
                    ? 'PREPARANDO'
                    : playing
                      ? 'REPRODUCIENDO'
                      : ended
                        ? 'FRAGMENTO FINALIZADO'
                        : 'EN PAUSA'}
              </small>
              <div className="row gap">
                <Icon name="volume" />
                <small>{settings.volume}%</small>
              </div>
            </div>
            <audio
              ref={audio}
              src={`/api/games/${id}/audio?r=${game.round}`}
              preload="auto"
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = game.audioStart;
              }}
              onPlay={() => {
                setPlaying(true);
              }}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setEnded(true);
              }}
              onTimeUpdate={() => {
                const element = audio.current;
                if (!element) return;
                setAudioTime(Math.max(0, element.currentTime - game.audioStart));
                if (element.currentTime >= game.audioStart + game.audioDuration) {
                  element.pause();
                  setEnded(true);
                }
              }}
              onError={() => setAudioError(true)}
            />
            {game.audioSource === 'deezer' && (
              <small className="subtle-note">
                Grabación oficial · Muestra de Deezer · Créditos al revelar la canción.
              </small>
            )}
            {blocked && !game.answered && (
              <button className="text-button audio-notice" onClick={() => void toggleAudio()}>
                Pulsa reproducir para activar el audio
              </button>
            )}
            {audioError && (
              <p className="form-error">El audio no está disponible. Puedes pasar esta ronda.</p>
            )}
          </Card>
          <Card>
            <form onSubmit={(event) => void submit(event)}>
              <h2 className="answer-title">¿QUÉ CANCIÓN ESTÁ SONANDO?</h2>
              <div className="answer-search">
                <div className="answer-row">
                  <div className="input-shell">
                    <Icon name="search" />
                    <input
                      ref={input}
                      aria-label="Tu respuesta"
                      aria-autocomplete="list"
                      aria-expanded={searchOpen && suggestions.length > 0}
                      aria-controls="music-search-results"
                      placeholder={
                        game.config.answerMode === 'both'
                          ? 'Escribe canción o artista…'
                          : 'Escribe el nombre de la canción…'
                      }
                      value={answer}
                      onChange={(event) => {
                        setAnswer(event.target.value);
                        setSearchOpen(true);
                      }}
                      maxLength={200}
                      autoComplete="off"
                      disabled={busy || waiting || game.answered || remaining <= 0}
                    />
                  </div>
                  <Button
                    type="submit"
                    icon="send"
                    disabled={busy || waiting || game.answered || !answer.trim() || remaining <= 0}
                  >
                    {busy ? 'Enviando…' : 'Enviar respuesta'}
                  </Button>
                </div>
                {searchOpen && answer.trim().length >= 2 && !waiting && !game.answered && (
                  <div
                    className="answer-suggestions"
                    id="music-search-results"
                    aria-label="Coincidencias musicales"
                  >
                    {searchLoading ? (
                      <p className="answer-search-message">Buscando canciones…</p>
                    ) : suggestions.length > 0 ? (
                      suggestions.map((track) => (
                        <div className="answer-suggestion" key={track.id}>
                          <button
                            type="button"
                            className="answer-suggestion-select"
                            onClick={() => {
                              setAnswer(track.title);
                              setSearchOpen(false);
                              setSuggestions([]);
                            }}
                          >
                            <strong>{track.title}</strong>
                            <small>{track.artist}</small>
                          </button>
                          <button
                            type="button"
                            className="answer-suggestion-preview"
                            aria-label={`${previewTrackId === track.id && previewPlaying ? 'Pausar' : 'Previsualizar'} ${track.title} de ${track.artist}`}
                            title={
                              previewTrackId === track.id && previewPlaying
                                ? 'Pausar muestra'
                                : 'Previsualizar muestra'
                            }
                            onClick={() => void toggleSearchPreview(track)}
                          >
                            <Icon
                              name={
                                previewTrackId === track.id && previewPlaying ? 'pause' : 'play'
                              }
                            />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="answer-search-message">
                        No encontramos canciones con ese nombre.
                      </p>
                    )}
                  </div>
                )}
                <audio
                  ref={previewAudio}
                  className="search-preview-audio"
                  preload="none"
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                  onEnded={() => setPreviewPlaying(false)}
                  onError={() => {
                    setPreviewPlaying(false);
                    notify('La muestra de esta canción no está disponible.');
                  }}
                />
              </div>
              <div className="row between answer-footer">
                <small>Pulsa Enter para responder</small>
                {!game.answered && (
                  <button
                    type="button"
                    className="text-button muted"
                    disabled={busy || waiting}
                    onClick={() => void submit(undefined, true)}
                  >
                    Pasar ronda →
                  </button>
                )}
              </div>
            </form>
          </Card>
          {result && (
            <div className={`notice ${result.correct ? 'success' : 'error'}`} role="status">
              <strong>
                {result.correct
                  ? '¡Respuesta correcta!'
                  : result.answer
                    ? 'Esta vez no fue…'
                    : 'Ronda finalizada'}
              </strong>
              <span>
                {result.title} · {result.artist}
              </span>
              {result.sourceUrl && (
                <small>
                  <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                    Artista y canción en Deezer ↗
                  </a>{' '}
                  ·{' '}
                  <a href={result.licenseUrl!} target="_blank" rel="noreferrer">
                    Condiciones del proveedor ↗
                  </a>
                </small>
              )}
              <small>
                {result.correct
                  ? `+${points(result.points)} puntos · ${(result.elapsed / 1000).toFixed(1)} s`
                  : '+0 puntos · ¡A por la siguiente!'}
              </small>
            </div>
          )}
          {game.answered &&
            (solo ? (
              <Button
                icon="arrow"
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    setData(
                      await api<GameSnapshot>(`/games/${id}/next`, 'POST', { round: game.round }),
                    ),
                  )
                }
              >
                {game.round === game.total - 1 ? 'Ver resultados' : 'Siguiente canción'}
              </Button>
            ) : (
              <p className="subtle-note">
                Esperando a los demás. La siguiente ronda comienza automáticamente.
              </p>
            ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className="stack">
          <Card>
            <small className="eyebrow muted">{solo ? 'PUNTUACIÓN' : 'TUS PUNTOS'}</small>
            <strong className="big-score cyan-text">{points(me.score)}</strong>
            <div className="row between">
              <small>Precisión</small>
              <small className="green-text">
                {correct}/{mine.length} ·{' '}
                {mine.length ? Math.round((correct / mine.length) * 100) : 0}%
              </small>
            </div>
          </Card>
          {!solo && (
            <Card>
              <h2 className="card-heading">JUGADORES</h2>
              {game.players.map((player) => (
                <div className="player compact" key={player.id}>
                  <Avatar name={player.name} purple={player.team === 1} />
                  <span>
                    {player.name}
                    {player.id === user.id ? ' · Tú' : ''}
                  </span>
                  <strong className={player.team === 1 ? 'purple-text' : 'cyan-text'}>
                    {points(player.score)}
                  </strong>
                </div>
              ))}
            </Card>
          )}
          <Button tone="ghost" icon="logout" onClick={() => setConfirmLeave(true)}>
            Abandonar partida
          </Button>
        </aside>
      </div>
      {confirmLeave && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
          >
            <h2 id="leave-title">¿Abandonar la partida?</h2>
            <p>
              La sesión terminará{!solo ? ' para todos los participantes' : ''} y no contará como
              completada.
            </p>
            <div className="row gap">
              <Button tone="ghost" onClick={() => setConfirmLeave(false)}>
                Seguir jugando
              </Button>
              <Button tone="danger" disabled={busy} onClick={() => void run(leave)}>
                Abandonar
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/** Presenta los resultados definitivos del servidor, con estadísticas y tabla de respuestas reales. */
export function ResultsPage({ id }: { id: string }): ReactNode {
  const { user, refresh } = useApp();
  const { data: game, error } = useLive<GameSnapshot>(`game:${id}`, () => api(`/games/${id}`));
  useEffect(() => {
    void refresh().catch(() => {});
    sessionStorage.removeItem('beat-game');
  }, [id, refresh]);
  if (!game) return <div className="loading">{error || 'Cargando resultados…'}</div>;
  if (game.status !== 'finished')
    return (
      <Card>
        <h2>ESTA PARTIDA NO ESTÁ COMPLETADA</h2>
        <p>Vuelve a la partida para continuar.</p>
        <Button onClick={() => navigate(`partida/${id}`)}>Continuar</Button>
      </Card>
    );
  const mine = game.results.filter((item) => item.userId === user.id),
    correct = mine.filter((item) => item.correct),
    me = game.players.find((player) => player.id === user.id)!;
  const total0 = game.players.filter((p) => p.team === 0).reduce((sum, p) => sum + p.score, 0),
    total1 = game.players.filter((p) => p.team === 1).reduce((sum, p) => sum + p.score, 0),
    tie = total0 === total1;
  const win = me.team === 0 ? total0 >= total1 : total1 >= total0,
    solo = game.mode === 'solo';
  let streak = 0,
    best = 0;
  for (const result of mine) {
    streak = result.correct ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  return (
    <>
      <Heading
        eyebrow={`Resultados · ${solo ? 'Un jugador' : game.mode === 'duel' ? 'Duelo 1 vs 1' : 'Equipos 2 vs 2'}`}
        title={solo ? 'SESIÓN COMPLETADA' : tie ? '¡EMPATE!' : win ? '¡VICTORIA!' : 'BIEN JUGADO'}
      />
      <div className="split-layout">
        <div className="stack">
          <Card className="result-hero">
            <div className="result-trophy">
              <Icon name={solo ? 'trophy' : 'crown'} />
            </div>
            <div>
              <Badge tone="green">
                {solo ? 'Nuevo ritmo personal' : win ? 'Gran partida' : 'Sigue practicando'}
              </Badge>
              <h2>
                {solo
                  ? '¡BUEN OÍDO!'
                  : game.mode === 'teams'
                    ? `EQUIPO ${total0 >= total1 ? '1' : '2'}`
                    : game.players.slice().sort((a, b) => b.score - a.score)[0].name}
              </h2>
              <p>
                {solo
                  ? 'Tu siguiente récord está a unas notas.'
                  : 'Cada segundo y cada respuesta cuentan.'}
              </p>
            </div>
            <div className="result-score">
              <small>PUNTUACIÓN {solo ? 'FINAL' : 'PERSONAL'}</small>
              <strong>{points(me.score)}</strong>
            </div>
          </Card>
          <div className="metrics three">
            <Metric icon="correct" label="Precisión" value={`${correct.length}/${mine.length}`} />
            <Metric
              icon="clock"
              label="Respuesta media"
              value={`${mine.length ? (mine.reduce((sum, item) => sum + item.elapsed, 0) / mine.length / 1000).toFixed(1) : '0'} s`}
            />
            <Metric icon="flame" label="Mejor racha" value={best} />
          </div>
          {!solo && (
            <div className="teams-result">
              {[0, 1].map((team) => (
                <Card key={team}>
                  <h2 className={team ? 'purple-text' : 'cyan-text'}>
                    {game.mode === 'teams' ? `EQUIPO ${team + 1}` : 'JUGADOR'} ·{' '}
                    {points(team ? total1 : total0)} pts
                  </h2>
                  {game.players
                    .filter((p) => p.team === team)
                    .map((player) => (
                      <div className="player" key={player.id}>
                        <Avatar name={player.name} purple={team === 1} />
                        <span>{player.name}</span>
                        <strong>{points(player.score)}</strong>
                      </div>
                    ))}
                </Card>
              ))}
            </div>
          )}
          <Card className="results-table">
            <div className="row between card-heading">
              <h2>RESUMEN DE RONDAS</h2>
              <small>Tu respuesta en cada fragmento</small>
            </div>
            {mine.map((item) => (
              <div className="result-row" key={item.round}>
                <span className="round-number">{String(item.round + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.artist}</small>
                  {item.sourceUrl && (
                    <small>
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        Créditos de artista y canción ↗
                      </a>{' '}
                      ·{' '}
                      <a href={item.licenseUrl!} target="_blank" rel="noreferrer">
                        Condiciones del proveedor ↗
                      </a>
                    </small>
                  )}
                  <small className="answer-detail">
                    Tu respuesta: {item.answer || 'Sin respuesta'}
                  </small>
                </div>
                <Badge tone={item.correct ? 'green' : 'pink'}>
                  {item.correct ? 'CORRECTA' : 'INCORRECTA'}
                </Badge>
                <strong className={item.correct ? 'green-text' : 'muted'}>
                  +{points(item.points)}
                </strong>
              </div>
            ))}
          </Card>
        </div>
        <aside className="stack">
          <Card>
            <Badge tone="purple">Resumen personal</Badge>
            <h2 className="level-title">TU SESIÓN</h2>
            <p>Escucha, practica y descubre más melodías en tu próxima sesión.</p>
            <Progress
              label="Canciones reconocidas"
              value={correct.length}
              total={mine.length || 1}
            />
          </Card>
          <Button
            icon="rotate"
            onClick={() =>
              navigate(solo ? 'un-jugador' : game.mode === 'duel' ? 'duelo' : 'equipos')
            }
          >
            Jugar otra vez
          </Button>
          {!solo && (
            <Button
              tone="secondary"
              icon="users"
              onClick={() => navigate(game.mode === 'duel' ? 'duelo' : 'equipos')}
            >
              Nueva sala
            </Button>
          )}
          <Button tone="secondary" icon="home" onClick={() => navigate('inicio')}>
            Volver al inicio
          </Button>
        </aside>
      </div>
    </>
  );
}
