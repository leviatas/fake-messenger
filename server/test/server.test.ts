import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ClientCommand, GameState, ServerEvent } from '@rol/shared';
import { createServer } from '../src/server.js';
import * as store from '../src/store.js';

const PASSWORD = 'MeGustaElRol';

let instance: ReturnType<typeof createServer>;
let base: string;
let wsBase: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  store.reset();
  instance = createServer({ password: PASSWORD, clientDir: '/tmp/no-client-here' });
  await new Promise<void>((resolve) => instance.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = instance.httpServer.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}/ws`;
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await instance.close();
});

async function post<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

/** Cliente de test: se conecta, autentica y guarda los eventos recibidos. */
class TestClient {
  readonly events: ServerEvent[] = [];
  private constructor(readonly socket: WebSocket) {}

  static async connect(token: string): Promise<TestClient> {
    const socket = new WebSocket(wsBase);
    sockets.push(socket);
    const client = new TestClient(socket);
    socket.on('message', (raw) => client.events.push(JSON.parse(raw.toString()) as ServerEvent));
    await new Promise((resolve) => socket.once('open', resolve));
    client.send({ type: 'auth', token });
    await client.waitFor('state');
    return client;
  }

  send(command: ClientCommand): void {
    this.socket.send(JSON.stringify(command));
  }

  async waitFor<T extends ServerEvent['type']>(
    type: T,
    predicate: (event: ServerEvent) => boolean = () => true,
    timeout = 2000,
  ): Promise<Extract<ServerEvent, { type: T }>> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = [...this.events].reverse().find((e) => e.type === type && predicate(e));
      if (found) return found as Extract<ServerEvent, { type: T }>;
      if (Date.now() > deadline) throw new Error(`No llego ningun evento "${type}"`);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }

  get state(): GameState {
    const last = [...this.events].reverse().find((e) => e.type === 'state');
    if (!last) throw new Error('Sin estado');
    return last as GameState & { type: 'state' };
  }
}

async function newGame() {
  const created = await post<{ codes: { dm: string; player: string; voyeur: string } }>('/api/games', {
    name: 'La Caida de Vhalgar',
    password: PASSWORD,
  });
  return created.data.codes;
}

async function join(code: string, name: string) {
  const res = await post<{ token: string; me: { id: string; role: string } }>('/api/join', { code, name });
  expect(res.status).toBe(200);
  return res.data;
}

describe('API REST', () => {
  it('crea una partida con la contrasena correcta', async () => {
    const res = await post<{ codes: Record<string, string> }>('/api/games', {
      name: 'Partida',
      password: PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.data.codes).sort()).toEqual(['dm', 'player', 'voyeur']);
  });

  it('rechaza la contrasena incorrecta', async () => {
    const res = await post<{ error: string }>('/api/games', { name: 'Partida', password: 'nope' });
    expect(res.status).toBe(403);
    expect(res.data.error).toMatch(/contrasena/i);
  });

  it('rechaza un codigo desconocido al unirse', async () => {
    const res = await post<{ error: string }>('/api/join', { code: 'PJ-NOPE12', name: 'Nadie' });
    expect(res.status).toBe(404);
  });

  it('reanuda una sesion valida y rechaza una invalida', async () => {
    const codes = await newGame();
    const { token } = await join(codes.player, 'Kaelen');
    expect((await post('/api/session', { token })).status).toBe(200);
    expect((await post('/api/session', { token: 'basura' })).status).toBe(401);
  });
});

describe('flujo por WebSocket', () => {
  it('reparte los mensajes del general a toda la mesa', async () => {
    const codes = await newGame();
    const dm = await TestClient.connect((await join(codes.dm, 'Master')).token);
    const kaelen = await TestClient.connect((await join(codes.player, 'Kaelen')).token);
    const sombra = await TestClient.connect((await join(codes.voyeur, 'Sombra')).token);

    const generalId = kaelen.state.game.generalChannelId;
    kaelen.send({ type: 'message:send', channelId: generalId, body: 'Abro la puerta.' });

    for (const client of [dm, kaelen, sombra]) {
      const event = await client.waitFor('message', (e) => e.type === 'message' && e.message.body === 'Abro la puerta.');
      expect(event.message.authorName).toBe('Kaelen');
    }
  });

  it('no entrega los chats privados a los jugadores ajenos', async () => {
    const codes = await newGame();
    const dm = await TestClient.connect((await join(codes.dm, 'Master')).token);
    const kaelen = await TestClient.connect((await join(codes.player, 'Kaelen')).token);
    const brissa = await TestClient.connect((await join(codes.player, 'Brissa')).token);
    const tercero = await TestClient.connect((await join(codes.player, 'Tercero')).token);

    const brissaId = kaelen.state.members.find((m) => m.name === 'Brissa')!.id;
    kaelen.send({ type: 'channel:create', kind: 'direct', memberIds: [brissaId] });
    const opened = await kaelen.waitFor('channel:open');

    kaelen.send({ type: 'message:send', channelId: opened.channelId, body: 'Solo entre tu y yo.' });
    await brissa.waitFor('message', (e) => e.type === 'message' && e.message.body === 'Solo entre tu y yo.');
    await dm.waitFor('message', (e) => e.type === 'message' && e.message.body === 'Solo entre tu y yo.');

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(tercero.events.some((e) => e.type === 'message' && e.message.body === 'Solo entre tu y yo.')).toBe(false);
    expect(tercero.state.channels.some((c) => c.id === opened.channelId)).toBe(false);
    expect(dm.state.channels.find((c) => c.id === opened.channelId)?.watching).toBe(true);
  });

  it('el voyerista lo lee todo pero no puede escribir', async () => {
    const codes = await newGame();
    const kaelen = await TestClient.connect((await join(codes.player, 'Kaelen')).token);
    const brissa = await TestClient.connect((await join(codes.player, 'Brissa')).token);
    const sombra = await TestClient.connect((await join(codes.voyeur, 'Sombra')).token);

    const brissaId = kaelen.state.members.find((m) => m.name === 'Brissa')!.id;
    kaelen.send({ type: 'channel:create', kind: 'direct', memberIds: [brissaId] });
    const opened = await kaelen.waitFor('channel:open');
    kaelen.send({ type: 'message:send', channelId: opened.channelId, body: 'Susurro.' });

    await sombra.waitFor('message', (e) => e.type === 'message' && e.message.body === 'Susurro.');

    sombra.send({ type: 'message:send', channelId: opened.channelId, body: 'Hola?' });
    const error = await sombra.waitFor('error');
    expect(error.message).toMatch(/solo puedes leer/i);
    expect(sombra.state.channels.every((c) => !c.canPost)).toBe(true);
  });

  it('los jugadores no ven a los voyeristas en la lista', async () => {
    const codes = await newGame();
    const dm = await TestClient.connect((await join(codes.dm, 'Master')).token);
    const kaelen = await TestClient.connect((await join(codes.player, 'Kaelen')).token);
    await TestClient.connect((await join(codes.voyeur, 'Sombra')).token);

    await dm.waitFor('state', (e) => e.type === 'state' && e.members.length === 3);
    expect(kaelen.state.members.map((m) => m.name)).not.toContain('Sombra');
    expect(dm.state.members.map((m) => m.name)).toContain('Sombra');
  });

  it('el DM borra un mensaje ajeno y todos lo ven marcado', async () => {
    const codes = await newGame();
    const dm = await TestClient.connect((await join(codes.dm, 'Master')).token);
    const kaelen = await TestClient.connect((await join(codes.player, 'Kaelen')).token);

    const generalId = kaelen.state.game.generalChannelId;
    kaelen.send({ type: 'message:send', channelId: generalId, body: 'Metadato fuera de personaje' });
    const posted = await dm.waitFor('message', (e) => e.type === 'message' && !e.message.system);

    dm.send({ type: 'message:delete', messageId: posted.message.id });
    const updated = await kaelen.waitFor('message:update');
    expect(updated.message.deleted).toBe(true);
    expect(updated.message.deletedBy).toBe('dm');
    expect(updated.message.body).toBe('');
  });

  it('el DM expulsa a un jugador y le cierra la conexion', async () => {
    const codes = await newGame();
    const dm = await TestClient.connect((await join(codes.dm, 'Master')).token);
    const joined = await join(codes.player, 'Kaelen');
    const kaelen = await TestClient.connect(joined.token);

    dm.send({ type: 'member:kick', memberId: joined.me.id });
    await kaelen.waitFor('kicked');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(kaelen.socket.readyState).toBe(WebSocket.CLOSED);
    // La expulsion borra la sesion: el token deja de existir.
    expect((await post('/api/session', { token: joined.token })).status).toBe(401);
  });

  it('reenvia el aviso de escritura a los demas', async () => {
    const codes = await newGame();
    const kaelen = await TestClient.connect((await join(codes.player, 'Kaelen')).token);
    const brissa = await TestClient.connect((await join(codes.player, 'Brissa')).token);

    kaelen.send({ type: 'typing', channelId: kaelen.state.game.generalChannelId, on: true });
    const event = await brissa.waitFor('typing');
    expect(event.name).toBe('Kaelen');
    expect(event.on).toBe(true);
    expect(kaelen.events.some((e) => e.type === 'typing')).toBe(false);
  });

  it('exige autenticarse antes de cualquier comando', async () => {
    const socket = new WebSocket(wsBase);
    sockets.push(socket);
    await new Promise((resolve) => socket.once('open', resolve));
    const received = new Promise<ServerEvent>((resolve) =>
      socket.once('message', (raw) => resolve(JSON.parse(raw.toString()) as ServerEvent)),
    );
    socket.send(JSON.stringify({ type: 'ping' }));
    const event = await received;
    expect(event).toMatchObject({ type: 'error' });
  });
});
