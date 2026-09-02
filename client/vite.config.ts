import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo el cliente vive en 5173 y habla con el backend por proxy,
// asi que el codigo siempre usa rutas relativas (/api, /ws).
const target = process.env.VITE_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
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
