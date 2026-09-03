// Vite sustituye este identificador al compilar por la version del
// package.json de la raiz (ver client/vite.config.ts).
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
