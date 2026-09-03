import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La version sale del package.json de la raiz: es la unica fuente para
// cliente y servidor, y se incrusta en el bundle al compilar.
const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

// En desarrollo el cliente vive en 5173 y habla con el backend por proxy,
// asi que el codigo siempre usa rutas relativas (/api, /ws).
const target = process.env.VITE_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
