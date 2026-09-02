const KEY = 'rol.session';

export interface StoredSession {
  token: string;
  gameName: string;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return parsed.token ? { token: parsed.token, gameName: parsed.gameName ?? '' } : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* modo incognito sin almacenamiento: seguimos sin recordar la sesion */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorado */
  }
}
