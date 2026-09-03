import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { ADMIN_TOKEN_HEADER, type ClientCommand, type ServerEvent } from '@rol/shared';
import * as admin from './admin.js';
import * as store from './store.js';
import { AppError, type Channel, type Game, type Member } from './types.js';
import { APP_VERSION } from './version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_DIR = path.resolve(here, '../../client/dist');

export interface ServerOptions {
  password?: string;
  /** Contrasena del panel de administracion. Por defecto, la de la mesa. */
  adminPassword?: string;
  clientDir?: string;
}

interface SocketContext {
  gameId: string;
  memberId: string;
  token: string;
}

type TaggedSocket = WebSocket & { ctx: SocketContext | null; isAlive: boolean };

export function createServer(options: ServerOptions = {}) {
  const password = options.password ?? process.env.ROLEPLAY_PASSWORD ?? 'MeGustaElRol';
  // Si no hay ADMIN_PASSWORD, el panel se abre con la contrasena de la mesa.
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? password;
  const clientDir = options.clientDir ?? process.env.CLIENT_DIR ?? DEFAULT_CLIENT_DIR;

  const app = express();
  app.use(express.json({ limit: '64kb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  /** gameId -> conexiones abiertas */
  const rooms = new Map<string, Set<TaggedSocket>>();

  const room = (gameId: string): Set<TaggedSocket> => {
    let set = rooms.get(gameId);
    if (!set) rooms.set(gameId, (set = new Set()));
    return set;
  };

  const send = (ws: TaggedSocket, payload: ServerEvent): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };

  const sendState = (ws: TaggedSocket, game: Game, member: Member): void => {
    send(ws, { type: 'state', ...store.projectState(game, member) });
  };

  /** Reenvia el estado completo a cada conexion, ya filtrado segun su rol. */
  function broadcastState(game: Game): void {
    for (const client of room(game.id)) {
      if (!client.ctx) continue;
      const member = game.members[client.ctx.memberId];
      if (!member || member.kicked) continue;
      sendState(client, game, member);
    }
  }

  /** Envia un evento solo a quien puede ver ese canal. */
  function broadcastToChannel(
    game: Game,
    channel: Channel,
    event: ServerEvent,
    exclude?: TaggedSocket,
  ): void {
    for (const client of room(game.id)) {
      if (!client.ctx || client === exclude) continue;
      const viewer = game.members[client.ctx.memberId];
      if (!viewer || viewer.kicked) continue;
      if (!store.canSeeChannel(viewer, channel)) continue;
      send(client, event);
    }
  }

  // ------------------------------------------------------------------- REST

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: APP_VERSION });
  });

  // Crear partida: hace falta la contrasena de la mesa y un nombre.
  app.post('/api/games', (req, res) => {
    const { password: given, name } = (req.body ?? {}) as { password?: string; name?: string };
    if (String(given ?? '') !== password) throw new AppError('Contrasena incorrecta.', 403);

    const game = store.createGame(name);
    res.status(201).json({
      game: { id: game.id, name: game.name },
      codes: { dm: game.codes.dm, player: game.codes.player, voyeur: game.codes.voyeur },
    });
  });

  // Unirse con un codigo: el codigo decide el rol.
  app.post('/api/join', (req, res) => {
    const { code, name } = (req.body ?? {}) as { code?: string; name?: string };
    const { game, member, token } = store.joinGame(code, name);
    broadcastState(game);
    res.json({
      token,
      game: { id: game.id, name: game.name },
      me: { id: member.id, name: member.name, role: member.role },
    });
  });

  // Reanudar la sesion guardada en el navegador.
  app.post('/api/session', (req, res) => {
    const { token } = (req.body ?? {}) as { token?: string };
    const { game, member } = store.resumeSession(token);
    res.json({
      game: { id: game.id, name: game.name },
      me: { id: member.id, name: member.name, role: member.role },
    });
  });

  // ------------------------------------------------ panel de administracion

  /** Echa de la partida a quien siga conectado cuando esta desaparece. */
  function closeRoom(gameId: string): void {
    for (const client of [...room(gameId)]) {
      send(client, { type: 'kicked' });
      client.ctx = null;
      client.close();
    }
    rooms.delete(gameId);
  }

  // Entrar en el panel: devuelve un token propio, corto y solo en memoria.
  app.post('/api/admin/login', (req, res) => {
    const origin = req.ip ?? 'desconocido';
    admin.checkAttempts(origin);
    const { password: given } = (req.body ?? {}) as { password?: string };
    if (!admin.samePassword(given, adminPassword)) {
      admin.registerFailure(origin);
      throw new AppError('Contrasena incorrecta.', 403);
    }
    res.json({ token: admin.openSession(origin), version: APP_VERSION });
  });

  app.post('/api/admin/logout', (req, res) => {
    admin.closeSession(req.get(ADMIN_TOKEN_HEADER));
    res.json({ ok: true });
  });

  app.get('/api/admin/games', (req, res) => {
    admin.requireSession(req.get(ADMIN_TOKEN_HEADER));
    res.json({ version: APP_VERSION, games: store.listGames().map(store.projectAdminGame) });
  });

  app.delete('/api/admin/games/:id', (req, res) => {
    admin.requireSession(req.get(ADMIN_TOKEN_HEADER));
    const game = store.deleteGame(req.params.id);
    closeRoom(game.id);
    res.json({ ok: true });
  });

  // ------------------------------------------------------- estaticos del SPA

  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get(/^\/(?!api\/|ws$).*/, (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Error inesperado en el servidor.' });
  });

  // -------------------------------------------------------------- WebSocket

  wss.on('connection', (raw) => {
    const ws = raw as TaggedSocket;
    ws.isAlive = true;
    ws.ctx = null;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      let command: ClientCommand;
      try {
        command = JSON.parse(data.toString()) as ClientCommand;
      } catch {
        return send(ws, { type: 'error', message: 'Mensaje mal formado.' });
      }

      try {
        if (!ws.ctx) {
          if (command.type !== 'auth') {
            return send(ws, { type: 'error', message: 'Autenticate primero.' });
          }
          const { game, member } = store.resumeSession(command.token);
          ws.ctx = { gameId: game.id, memberId: member.id, token: command.token };
          member.online = true;
          room(game.id).add(ws);
          broadcastState(game);
          return;
        }
        handleCommand(ws, command);
      } catch (err) {
        if (err instanceof AppError) return send(ws, { type: 'error', message: err.message });
        console.error(err);
        send(ws, { type: 'error', message: 'Error inesperado en el servidor.' });
      }
    });

    ws.on('close', () => {
      const ctx = ws.ctx;
      if (!ctx) return;
      ws.ctx = null;
      room(ctx.gameId).delete(ws);
      // La partida puede haber desaparecido ya (borrada desde el panel).
      let game: Game;
      try {
        game = store.getGame(ctx.gameId);
      } catch {
        rooms.delete(ctx.gameId);
        return;
      }
      const stillOpen = [...room(ctx.gameId)].some((c) => c.ctx?.memberId === ctx.memberId);
      const member = game.members[ctx.memberId];
      if (member && !stillOpen) member.online = false;
      broadcastState(game);
    });
  });

  function handleCommand(ws: TaggedSocket, command: ClientCommand): void {
    const ctx = ws.ctx;
    if (!ctx) return;
    const game = store.getGame(ctx.gameId);
    const member = game.members[ctx.memberId];
    if (!member || member.kicked) {
      send(ws, { type: 'kicked' });
      ws.ctx = null;
      room(ctx.gameId).delete(ws);
      ws.close();
      return;
    }

    switch (command.type) {
      case 'ping':
        return send(ws, { type: 'pong' });

      case 'message:send': {
        const { channel, message } = store.postMessage(game, member, command.channelId, command.body);
        broadcastToChannel(game, channel, { type: 'message', message: store.projectMessage(message) });
        return;
      }

      case 'message:delete': {
        const { channel, message } = store.deleteMessage(game, member, command.messageId);
        broadcastToChannel(game, channel, {
          type: 'message:update',
          message: store.projectMessage(message),
        });
        return;
      }

      case 'channel:create': {
        const { channel, created } = store.createChannel(game, member, {
          kind: command.kind,
          name: command.name,
          memberIds: command.memberIds,
        });
        broadcastState(game);
        send(ws, { type: 'channel:open', channelId: channel.id, created });
        return;
      }

      case 'member:kick': {
        const target = store.kickMember(game, member, command.memberId);
        for (const client of [...room(game.id)]) {
          if (client.ctx?.memberId !== target.id) continue;
          send(client, { type: 'kicked' });
          client.ctx = null;
          room(game.id).delete(client);
          client.close();
        }
        broadcastState(game);
        return;
      }

      case 'typing': {
        const channel = store.getChannel(game, command.channelId);
        if (!store.canPostIn(member, channel)) return;
        broadcastToChannel(
          game,
          channel,
          {
            type: 'typing',
            channelId: channel.id,
            memberId: member.id,
            name: member.name,
            on: Boolean(command.on),
          },
          ws,
        );
        return;
      }

      case 'leave': {
        store.endSession(ctx.token);
        member.online = false;
        ws.ctx = null;
        room(game.id).delete(ws);
        ws.close();
        broadcastState(game);
        return;
      }

      default:
        send(ws, { type: 'error', message: 'Comando desconocido.' });
    }
  }

  // Limpieza de conexiones muertas.
  const heartbeat = setInterval(() => {
    for (const raw of wss.clients) {
      const ws = raw as TaggedSocket;
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref?.();

  async function close(): Promise<void> {
    clearInterval(heartbeat);
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }

  return { app, httpServer, wss, close, password, adminPassword, clientDir, version: APP_VERSION };
}
