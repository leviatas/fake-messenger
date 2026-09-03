import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * La version de la app vive en el package.json de la raiz y es la unica
 * fuente: el cliente la incrusta al compilar y el servidor la lee aqui.
 * Tanto `server/src` como `server/dist` cuelgan de `server/`, asi que la
 * raiz esta dos niveles mas arriba en desarrollo y en produccion.
 */
function readVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(here, '../../package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { name?: string; version?: string };
    if (pkg.name === 'fake-messenger' && pkg.version) return pkg.version;
  } catch {
    /* sin package.json a mano: seguimos con la version desconocida */
  }
  return '0.0.0';
}

export const APP_VERSION = readVersion();
