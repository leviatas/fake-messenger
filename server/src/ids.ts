import { randomBytes } from 'node:crypto';

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para poder dictar los codigos en voz alta.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomString(length: number, alphabet: string): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Codigo legible del tipo `DM-4K7QZP`. El prefijo indica el rol al que da acceso. */
export function makeCode(prefix: string, length = 6): string {
  return `${prefix}-${randomString(length, CODE_ALPHABET)}`;
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('hex')}`;
}

export function makeToken(): string {
  return randomBytes(24).toString('hex');
}
