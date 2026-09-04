// Contrato compartido entre el servidor y el cliente React.

export const ROLES = ['dm', 'player', 'voyeur'] as const;
export type Role = (typeof ROLES)[number];

export type ChannelType = 'general' | 'group' | 'direct';

export const MAX_NAME_LENGTH = 32;
export const MAX_BODY_LENGTH = 2000;
export const MAX_MESSAGES_PER_CHANNEL = 1000;
export const MAX_AVATAR_LENGTH = 8;

/** Emojis de ejemplo para el selector de avatar; se puede escribir cualquier otro. */
export const AVATAR_PRESETS = [
  '🙂', '😎', '🥳', '🤠', '🧙', '🧛', '🧝', '🐉', '🦊', '🐺', '🦉', '🐍', '🌙', '⚔️', '🔥', '🎲',
] as const;

/** Un avatar que empieza asi es una imagen subida, no un emoji: ver isImageAvatar(). */
export const AVATAR_IMAGE_PREFIX = '/avatars/';
export const MAX_AVATAR_IMAGE_BYTES = 400 * 1024;

export function isImageAvatar(avatar: string | null | undefined): avatar is string {
  return !!avatar && avatar.startsWith(AVATAR_IMAGE_PREFIX);
}

/** Fotos enviadas en un chat: mucho mas margen que un avatar. */
export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;

export const ROLE_LABEL: Record<Role, string> = {
  dm: 'DM',
  player: 'Jugador',
  voyeur: 'Voyerista',
};

// ------------------------------------------------------------------ modelos

export interface PublicMember {
  id: string;
  name: string;
  role: Role;
  online: boolean;
  joinedAt: number;
  avatar: string | null;
}

export interface PublicChannel {
  id: string;
  type: ChannelType;
  /** Titulo ya resuelto desde el punto de vista de quien mira. */
  title: string;
  memberIds: string[];
  createdBy: string | null;
  createdAt: number;
  /** Si quien mira puede escribir aqui. */
  canPost: boolean;
  /** Chat privado que se observa sin formar parte de el (DM o voyerista). */
  watching: boolean;
}

export type DeletedBy = 'dm' | 'author' | null;

export interface PublicMessage {
  id: string;
  channelId: string;
  authorId: string | null;
  authorName: string | null;
  authorRole: Role | null;
  authorAvatar: string | null;
  body: string;
  /** URL de la imagen adjunta, si la hay; el pie de foto es el body. */
  image: string | null;
  ts: number;
  system: boolean;
  deleted: boolean;
  deletedBy: DeletedBy;
}

export interface GameCodes {
  dm: string;
  player: string;
  voyeur: string;
}

export interface GameSummary {
  id: string;
  name: string;
  createdAt: number;
  generalChannelId: string;
  /** Solo llega al DM, que es quien reparte los accesos. */
  codes?: GameCodes;
  /**
   * Codigo de jugador, para el enlace de invitacion. Llega al DM y a los
   * jugadores (que ya lo tienen: es el que usaron para entrar), nunca a los
   * voyeristas.
   */
  inviteCode?: string;
}

export interface Viewer {
  id: string;
  name: string;
  role: Role;
  canCreateChannels: boolean;
  canKick: boolean;
  avatar: string | null;
}

export interface GameState {
  game: GameSummary;
  me: Viewer;
  members: PublicMember[];
  channels: PublicChannel[];
  messages: Record<string, PublicMessage[]>;
}

// --------------------------------------------------------------------- REST

export interface CreateGameRequest {
  name: string;
  password: string;
}

export interface CreateGameResponse {
  game: { id: string; name: string };
  codes: GameCodes;
}

export interface JoinRequest {
  code: string;
  name: string;
}

export interface JoinResponse {
  token: string;
  game: { id: string; name: string };
  me: { id: string; name: string; role: Role };
}

export type SessionResponse = Omit<JoinResponse, 'token'>;

export interface ApiError {
  error: string;
}

// ---------------------------------------------------------------- WebSocket

export type ClientCommand =
  | { type: 'auth'; token: string }
  | { type: 'ping' }
  | { type: 'message:send'; channelId: string; body: string; image?: string }
  | { type: 'message:delete'; messageId: string }
  | { type: 'member:avatar'; avatar: string }
  | { type: 'member:name'; name: string }
  | { type: 'channel:create'; kind: 'direct' | 'group'; name?: string; memberIds: string[] }
  | { type: 'member:kick'; memberId: string }
  | { type: 'typing'; channelId: string; on: boolean }
  | { type: 'leave' };

export type ServerEvent =
  | ({ type: 'state' } & GameState)
  | { type: 'message'; message: PublicMessage }
  | { type: 'message:update'; message: PublicMessage }
  | { type: 'channel:open'; channelId: string; created: boolean }
  | { type: 'typing'; channelId: string; memberId: string; name: string; on: boolean }
  | { type: 'kicked' }
  | { type: 'pong' }
  | { type: 'error'; message: string };

// ----------------------------------------------------------------- admin

/** Cabecera con la que viaja el token del panel de administracion. */
export const ADMIN_TOKEN_HEADER = 'x-admin-token';

export interface AdminMember {
  id: string;
  name: string;
  role: Role;
  online: boolean;
  kicked: boolean;
  joinedAt: number;
}

/** Vista de una partida desde el panel: quien esta dentro y cuanto se ha hablado. */
export interface AdminGame {
  id: string;
  name: string;
  createdAt: number;
  codes: GameCodes;
  members: AdminMember[];
  channelCount: number;
  messageCount: number;
  /** Fecha del ultimo mensaje, o la de creacion si no hay ninguno. */
  lastActivity: number;
}

export interface AdminLoginRequest {
  password: string;
}

export interface AdminLoginResponse {
  token: string;
  /** Version del servidor, para cotejarla con la del cliente. */
  version: string;
}

export interface AdminGamesResponse {
  version: string;
  games: AdminGame[];
}

export interface HealthResponse {
  ok: true;
  version: string;
}
