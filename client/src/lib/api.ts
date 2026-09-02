import type {
  CreateGameResponse,
  JoinResponse,
  SessionResponse,
} from '@rol/shared';

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo contactar con el servidor.');
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Error inesperado del servidor.');
  return data as T;
}

export const api = {
  createGame: (name: string, password: string) =>
    post<CreateGameResponse>('/api/games', { name, password }),
  join: (code: string, name: string) => post<JoinResponse>('/api/join', { code, name }),
  session: (token: string) => post<SessionResponse>('/api/session', { token }),
};
