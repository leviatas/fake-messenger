import * as store from './store.js';
import { createServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

store.loadFromDisk();

const { httpServer, close, password } = createServer();

httpServer.listen(PORT, HOST, () => {
  console.log(`fake-messenger escuchando en http://localhost:${PORT}`);
  console.log(`Contrasena para crear partidas: ${password}`);
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
