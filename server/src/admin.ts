import { createHash, timingSafeEqual } from 'node:crypto';
import { makeToken } from './ids.js';
import { AppError } from './types.js';

/** Cuanto dura abierto el panel antes de pedir la contrasena otra vez. */
const SESSION_TTL = 60 * 60 * 1000;
/** Ventana y tope de intentos fallidos por origen, para frenar la fuerza bruta. */
const ATTEMPT_WINDOW = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** token de panel -> momento en que caduca */
const sessions = new Map<string, number>();
/** origen -> intentos fallidos dentro de la ventana */
const failures = new Map<string, { count: number; since: number }>();

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Compara en tiempo constante. Pasamos por sha256 para que los dos buffers
 * midan siempre lo mismo y la longitud de la contrasena no se filtre.
 */
export function samePassword(given: unknown, expected: string): boolean {
  return timingSafeEqual(digest(String(given ?? '')), digest(expected));
}

function prune(now: number): void {
  for (const [token, expires] of sessions) if (expires <= now) sessions.delete(token);
  for (const [origin, entry] of failures) {
    if (now - entry.since > ATTEMPT_WINDOW) failures.delete(origin);
  }
}

/** Lanza si ese origen ya ha gastado sus intentos. */
export function checkAttempts(origin: string): void {
  const now = Date.now();
  prune(now);
  const entry = failures.get(origin);
  if (entry && entry.count >= MAX_ATTEMPTS) {
    const left = Math.ceil((ATTEMPT_WINDOW - (now - entry.since)) / 1000);
    throw new AppError(`Demasiados intentos. Prueba otra vez en ${left} s.`, 429);
  }
}

export function registerFailure(origin: string): void {
  const now = Date.now();
  const entry = failures.get(origin);
  if (!entry || now - entry.since > ATTEMPT_WINDOW) {
    failures.set(origin, { count: 1, since: now });
    return;
  }
  entry.count += 1;
}

export function openSession(origin: string): string {
  failures.delete(origin);
  const token = makeToken();
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

/** Comprueba el token del panel y renueva su caducidad. */
export function requireSession(rawToken: unknown): string {
  const token = String(rawToken ?? '');
  const now = Date.now();
  prune(now);
  const expires = sessions.get(token);
  if (!expires) throw new AppError('Sesion de administrador caducada.', 401);
  sessions.set(token, now + SESSION_TTL);
  return token;
}

export function closeSession(rawToken: unknown): void {
  sessions.delete(String(rawToken ?? ''));
}

/** Solo para tests. */
export function reset(): void {
  sessions.clear();
  failures.clear();
}
