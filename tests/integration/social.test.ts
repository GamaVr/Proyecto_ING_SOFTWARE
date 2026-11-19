import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/aplicacion.js';
import { query, write, pool } from '../../server/base-datos.js';
import {
  DEFAULT_CONFIG,
  type RoomSnapshot,
  type SocialSnapshot,
  type User,
  type UserSearchResult,
} from '../../shared/tipos.js';

let server: Server,
  base = '';
const users: { user: User; cookie: string }[] = [],
  rooms: string[] = [];

/** Llama a la API de prueba con la cookie de la cuenta elegida. */
async function call<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  account = 0,
): Promise<{ status: number; data: T }> {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(users[account] ? { cookie: users[account].cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: response.status === 204 ? (undefined as T) : ((await response.json()) as T),
  };
}

/** Crea una amistad aceptada entre dos cuentas de prueba. */
async function connect(from: number, to: number): Promise<void> {
  assert.equal((await call('/friends', 'POST', { userId: users[to].user.id }, from)).status, 201);
  assert.equal(
    (await call(`/friends/${users[from].user.id}/accept`, 'POST', undefined, to)).status,
    200,
  );
}

/** Crea una sala aislada y registra su código para retirarla al terminar. */
async function room(mode: 'duel' | 'teams'): Promise<RoomSnapshot> {
  const result = await call<RoomSnapshot>('/rooms', 'POST', {
    name: 'Social QA',
    mode,
    config: { ...DEFAULT_CONFIG, rounds: 5 },
  });
  assert.equal(result.status, 201);
  rooms.push(result.data.code);
  return result.data;
}

/** Envía una invitación desde el anfitrión a un amigo y devuelve el buzón de este último. */
async function invite(code: string, recipient: number): Promise<SocialSnapshot> {
  assert.equal(
    (await call(`/rooms/${code}/invitations`, 'POST', { userId: users[recipient].user.id })).status,
    201,
  );
  return (await call<SocialSnapshot>('/social', 'GET', undefined, recipient)).data;
}

before(async () => {
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (let i = 0; i < 6; i++) {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Social QA ${i}`,
        email: `social-${randomUUID()}@example.test`,
        password: `Prueba-${randomUUID()}`,
        recoveryCode: '1234',
      }),
    });
    assert.equal(response.status, 201);
    const result = (await response.json()) as { user: User };
    users.push({ user: result.user, cookie: response.headers.get('set-cookie')!.split(';')[0] });
  }
});
after(async () => {
  for (const code of rooms) await write('DELETE FROM rooms WHERE code=?', [code]);
  for (const { user } of users) await write('DELETE FROM users WHERE id=?', [user.id]);
  await pool.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('amigos e invitaciones usan MySQL y respetan destinatarios y capacidad', async (t) => {
  await t.test('la búsqueda limita datos públicos y escapa comodines', async () => {
    const result = await call<{ users: UserSearchResult[] }>(
      `/users/search?q=${encodeURIComponent(users[1].user.email)}`,
    );
    assert.equal(result.status, 200);
    assert.equal(result.data.users[0].id, users[1].user.id);
    assert.ok(
      result.data.users.every((user) => !('email' in user) && user.id !== users[0].user.id),
    );
    assert.equal((await call('/users/search?q=x')).status, 422);
    assert.deepEqual(
      (await call<{ users: UserSearchResult[] }>('/users/search?q=__')).data.users,
      [],
    );
  });
  await t.test('una solicitud no puede aceptarse desde la cuenta que la envió', async () => {
    assert.equal((await call('/friends', 'POST', { userId: users[0].user.id })).status, 422);
    assert.equal((await call('/friends', 'POST', { userId: randomUUID() })).status, 404);
    assert.equal((await call('/friends', 'POST', { userId: users[1].user.id })).status, 201);
    assert.equal((await call('/friends', 'POST', { userId: users[1].user.id })).status, 409);
    assert.equal((await call(`/friends/${users[1].user.id}/accept`, 'POST')).status, 403);
    assert.equal(
      (await call(`/friends/${users[0].user.id}/accept`, 'POST', undefined, 5)).status,
      404,
    );
    assert.equal(
      (await call<SocialSnapshot>('/social', 'GET', undefined, 1)).data.incomingRequests[0].id,
      users[0].user.id,
    );
    assert.equal(
      (await call(`/friends/${users[0].user.id}/accept`, 'POST', undefined, 1)).status,
      200,
    );
    assert.equal((await call<SocialSnapshot>('/social')).data.friends[0].id, users[1].user.id);
    for (const i of [2, 3, 4]) await connect(0, i);
    assert.equal((await call<SocialSnapshot>('/social')).data.friends.length, 4);
  });
  await t.test(
    'solo amigos e integrantes pueden enviar invitaciones; duplicados y caducidad se validan',
    async () => {
      const created = await room('duel');
      assert.equal(
        (await call(`/rooms/${created.code}/invitations`, 'POST', { userId: users[5].user.id }))
          .status,
        403,
      );
      assert.equal(
        (await call(`/rooms/${created.code}/invitations`, 'POST', { userId: users[0].user.id }, 2))
          .status,
        403,
      );
      const received = await invite(created.code, 1),
        oldId = received.invitations[0].id;
      assert.equal(received.invitations[0].mode, 'duel');
      assert.equal(
        (await call(`/rooms/${created.code}/invitations`, 'POST', { userId: users[1].user.id }))
          .status,
        409,
      );
      assert.equal(
        (await call<SocialSnapshot>('/social', 'GET', undefined, 2)).data.invitations.length,
        0,
      );
      assert.equal(
        (await call(`/invitations/${oldId}/respond`, 'POST', { accept: true }, 2)).status,
        404,
      );
      await write('UPDATE room_invitations SET expires_at=? WHERE id=?', [Date.now() - 1, oldId]);
      assert.equal(
        (await call<SocialSnapshot>('/social', 'GET', undefined, 1)).data.invitations.length,
        0,
      );
      assert.equal(
        (await call(`/invitations/${oldId}/respond`, 'POST', { accept: true }, 1)).status,
        409,
      );
      const renewed = await invite(created.code, 1),
        id = renewed.invitations[0].id;
      assert.notEqual(id, oldId);
      assert.equal(
        (await call(`/invitations/${id}/respond`, 'POST', { accept: true }, 1)).status,
        200,
      );
      assert.equal(
        (await call(`/invitations/${id}/respond`, 'POST', { accept: true }, 1)).status,
        409,
      );
      const state = (await call<RoomSnapshot>(`/rooms/${created.code}`)).data;
      assert.equal(state.players.length, 2);
      assert.equal(state.gameId, null);
      assert.ok(state.players.every((player) => !player.ready));
      assert.equal(
        (await call(`/rooms/${created.code}/invitations`, 'POST', { userId: users[2].user.id }))
          .status,
        409,
      );
      assert.equal((await call('/rooms/join', 'POST', { code: created.code }, 2)).status, 409);
    },
  );
  await t.test('aceptaciones simultáneas no superan los cuatro lugares de equipos', async () => {
    const created = await room('teams'),
      invitations: { id: string; account: number }[] = [];
    for (const account of [1, 2, 3, 4]) {
      const inbox = await invite(created.code, account);
      invitations.push({
        id: inbox.invitations.find((item) => item.roomCode === created.code)!.id,
        account,
      });
    }
    const results = await Promise.all(
      invitations.map((item) =>
        call(`/invitations/${item.id}/respond`, 'POST', { accept: true }, item.account),
      ),
    );
    assert.equal(results.filter((result) => result.status === 200).length, 3);
    assert.equal(results.filter((result) => result.status === 409).length, 1);
    const state = (await call<RoomSnapshot>(`/rooms/${created.code}`)).data;
    assert.equal(state.players.length, 4);
    assert.equal(state.players.filter((player) => player.team === 0).length, 2);
    assert.equal(state.gameId, null);
    const loser = invitations[results.findIndex((result) => result.status === 409)];
    assert.equal(
      (await call(`/invitations/${loser.id}/respond`, 'POST', { accept: false }, loser.account))
        .status,
      200,
    );
  });
  await t.test(
    'rechazar, retirar amistad y cancelar solicitudes invalidan sus acciones pendientes',
    async () => {
      const created = await room('teams');
      let inbox = await invite(created.code, 4),
        id = inbox.invitations.find((item) => item.roomCode === created.code)!.id;
      assert.equal(
        (await call(`/invitations/${id}/respond`, 'POST', { accept: false }, 4)).status,
        200,
      );
      inbox = await invite(created.code, 4);
      id = inbox.invitations.find((item) => item.roomCode === created.code)!.id;
      await call(`/friends/${users[4].user.id}`, 'DELETE', undefined, 1);
      assert.ok(
        (await call<SocialSnapshot>('/social')).data.friends.some(
          (friend) => friend.id === users[4].user.id,
        ),
      );
      assert.equal((await call(`/friends/${users[4].user.id}`, 'DELETE')).status, 204);
      assert.ok(
        !(await call<SocialSnapshot>('/social', 'GET', undefined, 4)).data.invitations.some(
          (item) => item.id === id,
        ),
      );
      assert.equal(
        (await call(`/invitations/${id}/respond`, 'POST', { accept: true }, 4)).status,
        409,
      );
      await call('/friends', 'POST', { userId: users[1].user.id }, 5);
      assert.equal(
        (await call(`/friends/${users[5].user.id}`, 'DELETE', undefined, 1)).status,
        204,
      );
      assert.equal(
        (await call(`/friends/${users[5].user.id}/accept`, 'POST', undefined, 1)).status,
        404,
      );
      await call('/friends', 'POST', { userId: users[4].user.id }, 5);
      await call('/friends', 'POST', { userId: users[5].user.id }, 4);
      assert.ok(
        (await call<SocialSnapshot>('/social', 'GET', undefined, 5)).data.friends.some(
          (friend) => friend.id === users[4].user.id,
        ),
      );
    },
  );
  await t.test(
    'los datos retirados no forman parte de la respuesta ni del esquema activo',
    async () => {
      assert.deepEqual(
        Object.keys((await call<{ stats: unknown }>('/me')).data.stats as object).sort(),
        ['bestScore', 'bestStreak', 'played'],
      );
      const tables = await query<{ TABLE_NAME: string }>(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('player_ratings','matchmaking_queue','matchmaking_mutex')",
      );
      assert.equal(tables.length, 0);
    },
  );
});
