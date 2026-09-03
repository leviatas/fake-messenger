import {
  ADMIN_TOKEN_HEADER,
  type AdminGamesResponse,
  type AdminLoginResponse,
  type CreateGameResponse,
  type JoinResponse,
  type SessionResponse,
} from '@rol/shared';

async function request<T>(method: string, url: string, body?: unknown, adminToken?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (adminToken) headers[ADMIN_TOKEN_HEADER] = adminToken;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo contactar con el servidor.');
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Error inesperado del servidor.');
  return data as T;
}

const post = <T>(url: string, body: unknown): Promise<T> => request<T>('POST', url, body);

export const api = {
  createGame: (name: string, password: string) =>
    post<CreateGameResponse>('/api/games', { name, password }),
  join: (code: string, name: string) => post<JoinResponse>('/api/join', { code, name }),
  session: (token: string) => post<SessionResponse>('/api/session', { token }),

  // ------------------------------------------------ panel de administracion
  adminLogin: (password: string) => post<AdminLoginResponse>('/api/admin/login', { password }),
  adminLogout: (token: string) => request<{ ok: true }>('POST', '/api/admin/logout', {}, token),
  adminGames: (token: string) => request<AdminGamesResponse>('GET', '/api/admin/games', undefined, token),
  adminDeleteGame: (token: string, gameId: string) =>
    request<{ ok: true }>('DELETE', `/api/admin/games/${encodeURIComponent(gameId)}`, undefined, token),
};
