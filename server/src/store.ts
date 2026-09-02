import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_BODY_LENGTH,
  MAX_MESSAGES_PER_CHANNEL,
  MAX_NAME_LENGTH,
  type GameState,
  type PublicChannel,
  type PublicMessage,
  type Role,
} from '@rol/shared';
import { makeCode, makeId, makeToken } from './ids.js';
import { AppError, type Channel, type Game, type Member, type Message, type Session } from './types.js';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'games.json');
const PERSIST_ENABLED = process.env.PERSIST !== '0';

const games = new Map<string, Game>();
/** codigo -> partida y rol al que da acceso */
const codeIndex = new Map<string, { gameId: string; role: Role }>();
/** token de sesion -> miembro */
const sessions = new Map<string, Session>();

// ---------------------------------------------------------------- utilidades

export function cleanName(raw: unknown, what = 'nombre'): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new AppError(`Falta el ${what}.`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new AppError(`El ${what} no puede superar ${MAX_NAME_LENGTH} caracteres.`);
  }
  return name;
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

const now = (): number => Date.now();

// ------------------------------------------------------------------ partidas

function uniqueCode(prefix: string): string {
  let code: string;
  do {
    code = makeCode(prefix);
  } while (codeIndex.has(code));
  return code;
}

export function createGame(rawName: unknown): Game {
  const name = cleanName(rawName, 'nombre de la partida');
  const id = makeId('game');
  const codes: Record<Role, string> = {
    dm: uniqueCode('DM'),
    player: uniqueCode('PJ'),
    voyeur: uniqueCode('VY'),
  };

  const general: Channel = {
    id: makeId('ch'),
    type: 'general',
    name: 'General',
    memberIds: [],
    createdBy: null,
    createdAt: now(),
  };

  const game: Game = {
    id,
    name,
    createdAt: now(),
    codes,
    generalChannelId: general.id,
    members: {},
    channels: { [general.id]: general },
    messages: { [general.id]: [] },
  };

  games.set(id, game);
  for (const role of Object.keys(codes) as Role[]) {
    codeIndex.set(codes[role], { gameId: id, role });
  }
  schedulePersist();
  return game;
}

export function getGame(gameId: string): Game {
  const game = games.get(gameId);
  if (!game) throw new AppError('La partida ya no existe.', 404);
  return game;
}

// ------------------------------------------------------------------ miembros

export function joinGame(rawCode: unknown, rawName: unknown): { game: Game; member: Member; token: string } {
  const entry = codeIndex.get(normalizeCode(rawCode));
  if (!entry) throw new AppError('El codigo no corresponde a ninguna partida.', 404);

  const game = getGame(entry.gameId);
  const name = cleanName(rawName);

  const taken = Object.values(game.members).some(
    (m) => !m.kicked && m.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new AppError('Ya hay alguien con ese nombre en la partida.', 409);

  if (entry.role === 'dm' && Object.values(game.members).some((m) => m.role === 'dm' && !m.kicked)) {
    throw new AppError('Esta partida ya tiene un DM.', 409);
  }

  const member: Member = {
    id: makeId('mb'),
    name,
    role: entry.role,
    joinedAt: now(),
    online: false,
    kicked: false,
  };
  game.members[member.id] = member;

  const token = makeToken();
  sessions.set(token, { gameId: game.id, memberId: member.id });

  systemMessage(
    game,
    game.generalChannelId,
    member.role === 'dm'
      ? `${member.name} dirige la partida como DM.`
      : member.role === 'voyeur'
        ? `${member.name} observa la partida como voyerista.`
        : `${member.name} se ha unido a la partida.`,
    member.role === 'voyeur' ? ['dm', 'voyeur'] : null,
  );

  schedulePersist();
  return { game, member, token };
}

export function resumeSession(rawToken: unknown): { game: Game; member: Member } {
  const token = String(rawToken ?? '');
  const session = sessions.get(token);
  if (!session) throw new AppError('Sesion no valida.', 401);

  const game = games.get(session.gameId);
  if (!game) {
    sessions.delete(token);
    throw new AppError('La partida ya no existe.', 404);
  }
  const member = game.members[session.memberId];
  if (!member || member.kicked) {
    sessions.delete(token);
    throw new AppError('Ya no formas parte de esta partida.', 403);
  }
  return { game, member };
}

export function endSession(token: string): void {
  sessions.delete(token);
}

export function kickMember(game: Game, actor: Member, targetId: unknown): Member {
  if (actor.role !== 'dm') throw new AppError('Solo el DM puede expulsar.', 403);
  const target = game.members[String(targetId ?? '')];
  if (!target || target.kicked) throw new AppError('Ese participante ya no esta en la partida.', 404);
  if (target.id === actor.id) throw new AppError('El DM no puede expulsarse a si mismo.');

  target.kicked = true;
  target.online = false;
  target.kickedAt = now();

  for (const [token, session] of sessions) {
    if (session.gameId === game.id && session.memberId === target.id) sessions.delete(token);
  }
  for (const channel of Object.values(game.channels)) {
    channel.memberIds = channel.memberIds.filter((id) => id !== target.id);
  }

  systemMessage(
    game,
    game.generalChannelId,
    `${target.name} ha sido expulsado por el DM.`,
    target.role === 'voyeur' ? ['dm', 'voyeur'] : null,
  );
  schedulePersist();
  return target;
}

// ------------------------------------------------------------------- canales

export function getChannel(game: Game, channelId: unknown): Channel {
  const channel = game.channels[String(channelId ?? '')];
  if (!channel) throw new AppError('Ese chat no existe.', 404);
  return channel;
}

export function canSeeChannel(viewer: Member, channel: Channel): boolean {
  if (viewer.role === 'dm') return true; // el DM lo ve todo
  if (viewer.role === 'voyeur') return true; // el voyerista lo lee todo
  return channel.type === 'general' || channel.memberIds.includes(viewer.id);
}

export function canPostIn(viewer: Member, channel: Channel): boolean {
  if (viewer.role === 'voyeur') return false; // solo lectura
  if (viewer.role === 'dm') return true;
  return channel.type === 'general' || channel.memberIds.includes(viewer.id);
}

/** Los jugadores no ven a los voyeristas; el DM y los voyeristas ven a todos. */
export function visibleMembers(game: Game, viewer: Member): Member[] {
  const active = Object.values(game.members).filter((m) => !m.kicked);
  if (viewer.role === 'player') return active.filter((m) => m.role !== 'voyeur');
  return active;
}

export function createChannel(
  game: Game,
  actor: Member,
  input: { kind?: string; name?: unknown; memberIds?: unknown },
): { channel: Channel; created: boolean } {
  if (actor.role === 'voyeur') throw new AppError('Eres voyerista: solo puedes leer.', 403);

  const type: Channel['type'] = input.kind === 'group' ? 'group' : 'direct';
  const wanted = Array.isArray(input.memberIds) ? (input.memberIds as unknown[]) : [];

  const participants: string[] = [];
  for (const raw of wanted) {
    const candidate = game.members[String(raw ?? '')];
    if (!candidate || candidate.kicked) {
      throw new AppError('Alguno de los participantes ya no esta en la partida.', 404);
    }
    if (candidate.id === actor.id) continue;
    if (candidate.role === 'voyeur') {
      // Un jugador ni siquiera deberia saber que existen.
      throw new AppError(
        actor.role === 'dm'
          ? 'Los voyeristas no participan en chats: ya pueden leerlo todo.'
          : 'Ese participante no esta disponible.',
        actor.role === 'dm' ? 400 : 404,
      );
    }
    if (!participants.includes(candidate.id)) participants.push(candidate.id);
  }

  if (participants.length === 0) throw new AppError('Elige al menos un participante.');
  if (type === 'direct' && participants.length !== 1) {
    throw new AppError('Un chat privado es entre dos personas. Crea un grupo para mas.');
  }

  const memberIds = [actor.id, ...participants];

  if (type === 'direct') {
    const existing = Object.values(game.channels).find(
      (c) =>
        c.type === 'direct' &&
        c.memberIds.length === 2 &&
        memberIds.every((id) => c.memberIds.includes(id)),
    );
    if (existing) return { channel: existing, created: false };
  }

  const channel: Channel = {
    id: makeId('ch'),
    type,
    name:
      type === 'group'
        ? cleanName(input.name, 'nombre del grupo')
        : memberIds.map((id) => game.members[id]?.name ?? '?').join(' / '),
    memberIds,
    createdBy: actor.id,
    createdAt: now(),
  };
  game.channels[channel.id] = channel;
  game.messages[channel.id] = [];

  if (type === 'group') {
    systemMessage(game, channel.id, `${actor.name} ha creado el grupo "${channel.name}".`);
  }
  schedulePersist();
  return { channel, created: true };
}

// ------------------------------------------------------------------ mensajes

function pushMessage(game: Game, channelId: string, message: Message): void {
  const list = (game.messages[channelId] ??= []);
  list.push(message);
  if (list.length > MAX_MESSAGES_PER_CHANNEL) list.splice(0, list.length - MAX_MESSAGES_PER_CHANNEL);
}

export function systemMessage(
  game: Game,
  channelId: string,
  body: string,
  audienceRoles: Role[] | null = null,
): Message {
  const message: Message = {
    id: makeId('msg'),
    channelId,
    authorId: null,
    authorName: null,
    authorRole: null,
    body,
    ts: now(),
    system: true,
    deleted: false,
    deletedBy: null,
    audienceRoles,
  };
  pushMessage(game, channelId, message);
  return message;
}

export function postMessage(
  game: Game,
  author: Member,
  channelId: unknown,
  rawBody: unknown,
): { channel: Channel; message: Message } {
  const channel = getChannel(game, channelId);
  if (!canSeeChannel(author, channel)) throw new AppError('Ese chat no existe.', 404);
  if (!canPostIn(author, channel)) {
    throw new AppError(
      author.role === 'voyeur' ? 'Eres voyerista: solo puedes leer.' : 'No puedes escribir en este chat.',
      403,
    );
  }

  const body = String(rawBody ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) throw new AppError('El mensaje esta vacio.');
  if (body.length > MAX_BODY_LENGTH) {
    throw new AppError(`El mensaje no puede superar ${MAX_BODY_LENGTH} caracteres.`);
  }

  const message: Message = {
    id: makeId('msg'),
    channelId: channel.id,
    authorId: author.id,
    authorName: author.name,
    authorRole: author.role,
    body,
    ts: now(),
    system: false,
    deleted: false,
    deletedBy: null,
    audienceRoles: null,
  };
  pushMessage(game, channel.id, message);
  schedulePersist();
  return { channel, message };
}

function findMessage(game: Game, messageId: string): Message | null {
  for (const list of Object.values(game.messages)) {
    const message = list.find((m) => m.id === messageId);
    if (message) return message;
  }
  return null;
}

export function deleteMessage(
  game: Game,
  actor: Member,
  messageId: unknown,
): { channel: Channel; message: Message } {
  const message = findMessage(game, String(messageId ?? ''));
  if (!message) throw new AppError('Ese mensaje ya no existe.', 404);
  const channel = getChannel(game, message.channelId);

  if (message.system) throw new AppError('No se pueden borrar los avisos de la partida.');
  if (actor.role === 'voyeur') throw new AppError('Eres voyerista: solo puedes leer.', 403);
  if (!canSeeChannel(actor, channel)) throw new AppError('Ese mensaje ya no existe.', 404);

  const isOwn = message.authorId === actor.id;
  if (actor.role !== 'dm' && !isOwn) throw new AppError('Solo el DM puede borrar mensajes de otros.', 403);
  if (message.deleted) return { channel, message };

  message.deleted = true;
  message.deletedBy = isOwn ? 'author' : 'dm';
  message.body = '';
  schedulePersist();
  return { channel, message };
}

// ------------------------------------------------------------ proyeccion UI

function channelTitleFor(game: Game, viewer: Member, channel: Channel): string {
  if (channel.type !== 'direct') return channel.name;
  const others = channel.memberIds.filter((id) => id !== viewer.id);
  // Si quien mira no participa (DM o voyerista) mostramos los dos lados.
  const ids = others.length === channel.memberIds.length ? channel.memberIds : others;
  return ids.map((id) => game.members[id]?.name ?? '?').join(' / ');
}

export function projectChannel(game: Game, viewer: Member, channel: Channel): PublicChannel {
  const isParticipant = channel.type === 'general' || channel.memberIds.includes(viewer.id);
  return {
    id: channel.id,
    type: channel.type,
    title: channelTitleFor(game, viewer, channel),
    memberIds:
      channel.type === 'general'
        ? visibleMembers(game, viewer).map((m) => m.id)
        : [...channel.memberIds],
    createdBy: channel.createdBy,
    createdAt: channel.createdAt,
    canPost: canPostIn(viewer, channel),
    watching: !isParticipant,
  };
}

export function projectMessage(message: Message): PublicMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    authorName: message.authorName,
    authorRole: message.authorRole,
    body: message.deleted ? '' : message.body,
    ts: message.ts,
    system: message.system,
    deleted: message.deleted,
    deletedBy: message.deletedBy,
  };
}

export function messagesFor(game: Game, viewer: Member, channelId: string): PublicMessage[] {
  return (game.messages[channelId] ?? [])
    .filter((m) => !m.audienceRoles || m.audienceRoles.includes(viewer.role))
    .map(projectMessage);
}

export function projectState(game: Game, viewer: Member): GameState {
  const channels = Object.values(game.channels)
    .filter((c) => canSeeChannel(viewer, c))
    .sort((a, b) => {
      if (a.type === 'general') return -1;
      if (b.type === 'general') return 1;
      return a.createdAt - b.createdAt;
    })
    .map((c) => projectChannel(game, viewer, c));

  const messages: Record<string, PublicMessage[]> = {};
  for (const channel of channels) messages[channel.id] = messagesFor(game, viewer, channel.id);

  return {
    game: {
      id: game.id,
      name: game.name,
      createdAt: game.createdAt,
      generalChannelId: game.generalChannelId,
      // Solo el DM recibe los codigos: es quien reparte los accesos.
      ...(viewer.role === 'dm' ? { codes: { ...game.codes } } : {}),
    },
    me: {
      id: viewer.id,
      name: viewer.name,
      role: viewer.role,
      canCreateChannels: viewer.role !== 'voyeur',
      canKick: viewer.role === 'dm',
    },
    members: visibleMembers(game, viewer).map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      online: m.online,
      joinedAt: m.joinedAt,
    })),
    channels,
    messages,
  };
}

// ---------------------------------------------------------------- disco

let persistTimer: NodeJS.Timeout | null = null;

export function schedulePersist(): void {
  if (!PERSIST_ENABLED || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, 400);
  persistTimer.unref?.();
}

export function persistNow(): void {
  if (!PERSIST_ENABLED) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const snapshot = {
      version: 1,
      games: [...games.values()],
      sessions: [...sessions.entries()].map(([token, s]) => ({ token, ...s })),
    };
    fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(snapshot));
    fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
  } catch (err) {
    console.error('[store] no se pudo guardar el estado:', (err as Error).message);
  }
}

export function loadFromDisk(): void {
  if (!PERSIST_ENABLED) return;
  let raw: string;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch {
    return;
  }
  try {
    const snapshot = JSON.parse(raw) as {
      games?: Game[];
      sessions?: (Session & { token: string })[];
    };
    for (const game of snapshot.games ?? []) {
      for (const member of Object.values(game.members)) member.online = false;
      games.set(game.id, game);
      for (const role of Object.keys(game.codes) as Role[]) {
        codeIndex.set(game.codes[role], { gameId: game.id, role });
      }
    }
    for (const s of snapshot.sessions ?? []) {
      if (games.has(s.gameId)) sessions.set(s.token, { gameId: s.gameId, memberId: s.memberId });
    }
    console.log(`[store] ${games.size} partida(s) recuperada(s) de disco`);
  } catch (err) {
    console.error('[store] estado guardado ilegible:', (err as Error).message);
  }
}

/** Solo para tests. */
export function reset(): void {
  games.clear();
  codeIndex.clear();
  sessions.clear();
}
