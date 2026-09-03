import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // El store persiste en disco; en los tests trabajamos solo en memoria,
    // salvo las imagenes de avatar, que van a una carpeta temporal aparte.
    env: { PERSIST: '0', DATA_DIR: path.join(os.tmpdir(), 'fake-messenger-test-data') },
  },
});
