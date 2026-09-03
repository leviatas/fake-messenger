import type { ChannelType, Role } from '@rol/shared';

export interface Member {
  id: string;
  name: string;
  role: Role;
  joinedAt: number;
  online: boolean;
  kicked: boolean;
  kickedAt?: number;
  avatar: string | null;
}

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  memberIds: string[];
  createdBy: string | null;
  createdAt: number;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string | null;
  authorName: string | null;
  authorRole: Role | null;
  /** Avatar del autor en el momento de escribir, aunque luego lo cambie. */
  authorAvatar: string | null;
  body: string;
  ts: number;
  system: boolean;
  deleted: boolean;
  deletedBy: 'dm' | 'author' | null;
  /** Si esta puesto, solo estos roles ven el mensaje (avisos sobre voyeristas). */
  audienceRoles: Role[] | null;
}

export interface Game {
  id: string;
  name: string;
  createdAt: number;
  codes: Record<Role, string>;
  generalChannelId: string;
  members: Record<string, Member>;
  channels: Record<string, Channel>;
  messages: Record<string, Message[]>;
}

export interface Session {
  gameId: string;
  memberId: string;
}

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}
