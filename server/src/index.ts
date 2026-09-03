import * as store from './store.js';
import { createServer } from './server.js';
import { APP_VERSION } from './version.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

store.loadFromDisk();

const { httpServer, close, password, adminPassword } = createServer();

httpServer.listen(PORT, HOST, () => {
  console.log(`fake-messenger v${APP_VERSION} escuchando en http://localhost:${PORT}`);
  console.log(`Contrasena para crear partidas: ${password}`);
  console.log(
    adminPassword === password
      ? 'Panel de administracion: la misma contrasena (define ADMIN_PASSWORD para separarlas).'
      : 'Panel de administracion: la contrasena de ADMIN_PASSWORD.',
  );
});

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    store.persistNow();
    void close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
