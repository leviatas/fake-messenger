import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ClientCommand, GameState, PublicMessage, ServerEvent } from '@rol/shared';

export type Connection = 'connecting' | 'online' | 'offline';

const TYPING_TTL = 4000;

interface TypingEntry {
  name: string;
  at: number;
}

export interface ChatState {
  game: GameState | null;
  activeChannelId: string | null;
  unread: Record<string, number>;
  typing: Record<string, Record<string, TypingEntry>>;
  connection: Connection;
  kicked: boolean;
  error: string | null;
  /** En movil solo cabe un panel: la lista o la conversacion. */
  mobilePane: 'list' | 'chat';
}

type Action =
  | { kind: 'connection'; value: Connection }
  | { kind: 'event'; event: ServerEvent }
  | { kind: 'select'; channelId: string }
  | { kind: 'back' }
  | { kind: 'error'; message: string | null }
  | { kind: 'tick'; now: number };

const initialState: ChatState = {
  game: null,
  activeChannelId: null,
  unread: {},
  typing: {},
  connection: 'connecting',
  kicked: false,
  error: null,
  mobilePane: 'list',
};

function upsertMessage(game: GameState, message: PublicMessage): GameState {
  const list = game.messages[message.channelId] ?? [];
  const index = list.findIndex((m) => m.id === message.id);
  const next = index >= 0 ? list.map((m) => (m.id === message.id ? message : m)) : [...list, message];
  return { ...game, messages: { ...game.messages, [message.channelId]: next } };
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.kind) {
    case 'connection':
      return { ...state, connection: action.value };

    case 'select':
      return {
        ...state,
        activeChannelId: action.channelId,
        mobilePane: 'chat',
        unread: { ...state.unread, [action.channelId]: 0 },
      };

    case 'back':
      return { ...state, mobilePane: 'list' };

    case 'error':
      return { ...state, error: action.message };

    case 'tick': {
      let changed = false;
      const typing: ChatState['typing'] = {};
      for (const [channelId, byMember] of Object.entries(state.typing)) {
        const alive = Object.entries(byMember).filter(([, e]) => action.now - e.at < TYPING_TTL);
        if (alive.length !== Object.keys(byMember).length) changed = true;
        if (alive.length) typing[channelId] = Object.fromEntries(alive);
      }
      return changed ? { ...state, typing } : state;
    }

    case 'event': {
      const event = action.event;
      switch (event.type) {
        case 'state': {
          const { type: _ignored, ...game } = event;
          const stillThere = game.channels.some((c) => c.id === state.activeChannelId);
          return {
            ...state,
            game,
            connection: 'online',
            activeChannelId: stillThere ? state.activeChannelId : game.game.generalChannelId,
          };
        }

        case 'message': {
          if (!state.game) return state;
          const isActive = event.message.channelId === state.activeChannelId;
          return {
            ...state,
            game: upsertMessage(state.game, event.message),
            unread: isActive
              ? state.unread
              : {
                  ...state.unread,
                  [event.message.channelId]: (state.unread[event.message.channelId] ?? 0) + 1,
                },
          };
        }

        case 'message:update':
          return state.game ? { ...state, game: upsertMessage(state.game, event.message) } : state;

        case 'channel:open':
          return {
            ...state,
            activeChannelId: event.channelId,
            mobilePane: 'chat',
            unread: { ...state.unread, [event.channelId]: 0 },
          };

        case 'typing': {
          const channel = { ...(state.typing[event.channelId] ?? {}) };
          if (event.on) channel[event.memberId] = { name: event.name, at: Date.now() };
          else delete channel[event.memberId];
          return { ...state, typing: { ...state.typing, [event.channelId]: channel } };
        }

        case 'kicked':
          return { ...state, kicked: true, connection: 'offline' };

        case 'error':
          return { ...state, error: event.message };

        default:
          return state;
      }
    }

    default:
      return state;
  }
}

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function useGame(token: string | null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const kickedRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    let closed = false;
    let retryTimer: number | undefined;

    const connect = (): void => {
      if (closed) return;
      dispatch({ kind: 'connection', value: 'connecting' });
      const socket = new WebSocket(socketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        retryRef.current = 0;
        socket.send(JSON.stringify({ type: 'auth', token } satisfies ClientCommand));
      });

      socket.addEventListener('message', (raw) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(String(raw.data)) as ServerEvent;
        } catch {
          return;
        }
        if (event.type === 'kicked') kickedRef.current = true;
        dispatch({ kind: 'event', event });
      });

      socket.addEventListener('close', () => {
        socketRef.current = null;
        if (closed || kickedRef.current) return;
        dispatch({ kind: 'connection', value: 'offline' });
        const delay = Math.min(1000 * 2 ** retryRef.current++, 10_000);
        retryTimer = window.setTimeout(connect, delay);
      });
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [token]);

  // Los avisos de "esta escribiendo" caducan solos.
  useEffect(() => {
    const timer = window.setInterval(() => dispatch({ kind: 'tick', now: Date.now() }), 1500);
    return () => window.clearInterval(timer);
  }, []);

  const send = useCallback((command: ClientCommand): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(command));
    return true;
  }, []);

  const selectChannel = useCallback((channelId: string) => dispatch({ kind: 'select', channelId }), []);
  const goBack = useCallback(() => dispatch({ kind: 'back' }), []);
  const setError = useCallback((message: string | null) => dispatch({ kind: 'error', message }), []);

  return { state, send, selectChannel, goBack, setError };
}
