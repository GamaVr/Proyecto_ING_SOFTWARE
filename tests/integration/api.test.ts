import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/aplicacion.js';
import { pool, query, write } from '../../server/base-datos.js';
import { advanceGame } from '../../server/partidas.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_SETTINGS,
  type GameSnapshot,
  type RoomSnapshot,
  type User,
} from '../../shared/tipos.js';

let server: Server,
  base = '';
const users: { user: User; cookie: string; password: string }[] = [],
  games: string[] = [],
  rooms: string[] = [];
/** Envía una solicitud HTTP a la API de pruebas con su conexión MySQL real. */
async function request<T>(
  route: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
): Promise<{ status: number; data: T; cookie: string }> {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: response.status === 204 ? (undefined as T) : ((await response.json()) as T),
    cookie: response.headers.get('set-cookie') || '',
  };
}
before(async () => {
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  // Solo elimina los UUID y códigos creados por esta ejecución.
  for (const code of rooms) await write('DELETE FROM rooms WHERE code=?', [code]);
  for (const id of games) await write('DELETE FROM games WHERE id=?', [id]);
  for (const item of users) await write('DELETE FROM users WHERE id=?', [item.user.id]);
  await pool.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test('API y MySQL: identidad, puntuación, aislamiento y salas de cuatro personas', async (t) => {
  await t.test('usa MySQL oficial y exige sesión', async () => {
    const health = await request<{ version: string }>('/health');
    assert.equal(health.status, 200);
    assert.match(health.data.version, /^8\./);
    assert.doesNotMatch(health.data.version, /MariaDB/);
    assert.equal((await request('/me')).status, 401);
    assert.equal(
      (await request('/auth/register', 'POST', { name: 'A', email: 'bad', password: '123' }))
        .status,
      422,
    );
    for (let i = 0; i < 4; i++) {
      const email = `qa-${randomUUID()}@example.test`,
        password = `Prueba-${randomUUID()}`;
      const result = await request<{ user: User }>('/auth/register', 'POST', {
        name: `QA ${i + 1}`,
        email,
        password,
      });
      assert.equal(result.status, 201);
      assert.match(result.cookie, /HttpOnly/);
      assert.match(result.cookie, /SameSite=Lax/);
      users.push({ user: result.data.user, cookie: result.cookie.split(';')[0], password });
    }
    assert.equal(
      (await request('/auth/register', 'POST', { ...users[0].user, password: users[0].password }))
        .status,
      409,
    );
    assert.equal(
      (await request('/auth/login', 'POST', { email: users[0].user.email, password: 'incorrecta' }))
        .status,
      401,
    );
    assert.equal(
      (
        await request('/auth/login', 'POST', {
          email: users[0].user.email,
          password: users[0].password,
          remember: true,
        })
      ).status,
      200,
    );
  });
  await t.test('guarda preferencias y rechaza orígenes externos', async () => {
    const settings = { ...DEFAULT_SETTINGS, volume: 41, largeInterface: true };
    assert.equal((await request('/settings', 'PUT', settings, users[0].cookie)).status, 200);
    assert.deepEqual(
      (await request<{ settings: unknown }>('/settings', 'GET', undefined, users[0].cookie)).data
        .settings,
      settings,
    );
    assert.equal(
      (await request('/settings', 'PUT', { ...settings, volume: 200 }, users[0].cookie)).status,
      422,
    );
    const response = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: {
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
        cookie: users[0].cookie,
      },
      body: JSON.stringify(settings),
    });
    assert.equal(response.status, 403);
  });
  await t.test(
    'mantiene respuestas privadas y evita puntuar dos veces y saltar rondas',
    async () => {
      const result = await request<GameSnapshot>(
        '/games',
        'POST',
        { ...DEFAULT_CONFIG, rounds: 5 },
        users[0].cookie,
      );
      assert.equal(result.status, 201);
      const game = result.data;
      games.push(game.id);
      assert.equal('song_ids' in game, false);
      assert.equal(game.results.length, 0);
      assert.equal(
        (await request(`/games/${game.id}`, 'GET', undefined, users[1].cookie)).status,
        403,
      );
      assert.equal(
        (await request(`/games/${game.id}/audio`, 'GET', undefined, users[1].cookie)).status,
        403,
      );
      assert.equal(
        (await request(`/games/${game.id}/next`, 'POST', { round: 0 }, users[0].cookie)).status,
        409,
      );
      for (let round = 0; round < 5; round++) {
        await write('UPDATE games SET round_started_at=? WHERE id=?', [Date.now() - 100, game.id]);
        const [song] = await query<{ title: string }>(
          'SELECT s.title FROM games g JOIN songs s ON s.id=JSON_UNQUOTE(JSON_EXTRACT(g.song_ids,?)) WHERE g.id=?',
          [`$[${round}]`, game.id],
        );
        const answer = await request<GameSnapshot>(
          `/games/${game.id}/answer`,
          'POST',
          { round, answer: song.title, points: 9999999 },
          users[0].cookie,
        );
        assert.equal(answer.status, 200);
        assert.equal(answer.data.results.at(-1)?.correct, true);
        assert.ok(answer.data.results.at(-1)!.points <= 1200);
        assert.equal(
          (
            await request(
              `/games/${game.id}/answer`,
              'POST',
              { round, answer: song.title },
              users[0].cookie,
            )
          ).status,
          409,
        );
        const advance = await request<GameSnapshot>(
          `/games/${game.id}/next`,
          'POST',
          { round },
          users[0].cookie,
        );
        assert.equal(advance.status, 200);
        if (round < 4)
          assert.equal(
            (
              await request(
                `/games/${game.id}/answer`,
                'POST',
                { round, answer: song.title },
                users[0].cookie,
              )
            ).status,
            409,
          );
        if (round === 4) assert.equal(advance.data.status, 'finished');
      }
      const me = await request<{ stats: { played: number; bestStreak: number } }>(
        '/me',
        'GET',
        undefined,
        users[0].cookie,
      );
      assert.equal(me.data.stats.played, 1);
      assert.equal(me.data.stats.bestStreak, 5);
    },
  );
  await t.test('sincroniza cuatro jugadores, chat, equipos y permisos del anfitrión', async () => {
    const created = await request<RoomSnapshot>(
      '/rooms',
      'POST',
      { name: 'Sala QA', mode: 'teams', config: { ...DEFAULT_CONFIG, rounds: 5 } },
      users[0].cookie,
    );
    assert.equal(created.status, 201);
    const code = created.data.code;
    rooms.push(code);
    for (const user of users.slice(1))
      assert.equal((await request('/rooms/join', 'POST', { code }, user.cookie)).status, 200);
    const state = await request<RoomSnapshot>(`/rooms/${code}`, 'GET', undefined, users[0].cookie);
    assert.equal(state.data.players.length, 4);
    assert.equal(state.data.players.filter((p) => p.team === 0).length, 2);
    assert.equal(
      (await request(`/rooms/${code}/start`, 'POST', undefined, users[0].cookie)).status,
      409,
    );
    assert.equal(
      (await request(`/rooms/${code}/start`, 'POST', undefined, users[1].cookie)).status,
      403,
    );
    for (const user of users)
      assert.equal(
        (
          await request(
            `/rooms/${code}/player`,
            'PATCH',
            { action: 'ready', ready: true },
            user.cookie,
          )
        ).status,
        200,
      );
    await request(
      `/rooms/${code}/messages`,
      'POST',
      { text: 'Mensaje de prueba <b>literal</b>' },
      users[0].cookie,
    );
    const chat = await request<RoomSnapshot>(`/rooms/${code}`, 'GET', undefined, users[1].cookie);
    assert.equal(chat.data.messages[0].text, 'Mensaje de prueba <b>literal</b>');
    const start = await request<{ gameId: string }>(
      `/rooms/${code}/start`,
      'POST',
      undefined,
      users[0].cookie,
    );
    assert.equal(start.status, 200);
    games.push(start.data.gameId);
    for (const user of users) {
      const game = await request<GameSnapshot>(
        `/games/${start.data.gameId}`,
        'GET',
        undefined,
        user.cookie,
      );
      assert.equal(game.data.id, start.data.gameId);
      assert.equal(game.data.players.length, 4);
    }
    for (let round = 0; round < 5; round++) {
      await write('UPDATE games SET round_started_at=? WHERE id=?', [
        Date.now() - 20000,
        start.data.gameId,
      ]);
      await advanceGame(start.data.gameId);
    }
    assert.equal(
      (
        await request<GameSnapshot>(
          `/games/${start.data.gameId}`,
          'GET',
          undefined,
          users[0].cookie,
        )
      ).data.status,
      'finished',
    );
  });
  await t.test('duelo privado exige confirmación de ambos y comienzo del anfitrión', async () => {
    const created = await request<RoomSnapshot>(
      '/rooms',
      'POST',
      { name: 'Duelo privado QA', mode: 'duel', config: { ...DEFAULT_CONFIG, rounds: 5 } },
      users[0].cookie,
    );
    assert.equal(created.status, 201);
    const code = created.data.code;
    rooms.push(code);
    const joined = await request<RoomSnapshot>('/rooms/join', 'POST', { code }, users[1].cookie);
    assert.equal(joined.status, 200);
    assert.equal(joined.data.gameId, null);
    assert.ok(joined.data.players.every((player) => !player.ready));
    assert.equal(
      (await request(`/rooms/${code}/start`, 'POST', undefined, users[0].cookie)).status,
      409,
    );
    for (const user of users.slice(0, 2))
      assert.equal(
        (
          await request(
            `/rooms/${code}/player`,
            'PATCH',
            { action: 'ready', ready: true },
            user.cookie,
          )
        ).status,
        200,
      );
    assert.equal(
      (await request(`/rooms/${code}/start`, 'POST', undefined, users[1].cookie)).status,
      403,
    );
    const started = await request<{ gameId: string }>(
      `/rooms/${code}/start`,
      'POST',
      undefined,
      users[0].cookie,
    );
    assert.equal(started.status, 200);
    games.push(started.data.gameId);
    for (let round = 0; round < 5; round++) {
      await write('UPDATE games SET round_started_at=? WHERE id=?', [
        Date.now() - 20000,
        started.data.gameId,
      ]);
      await advanceGame(started.data.gameId);
    }
    const profile = await request<{ stats: Record<string, number> }>(
      '/me',
      'GET',
      undefined,
      users[0].cookie,
    );
    assert.deepEqual(Object.keys(profile.data.stats).sort(), ['bestScore', 'bestStreak', 'played']);
  });
  await t.test('revoca la sesión al cerrar sesión', async () => {
    assert.equal((await request('/auth/logout', 'POST', undefined, users[0].cookie)).status, 204);
    assert.equal((await request('/me', 'GET', undefined, users[0].cookie)).status, 401);
  });
});
