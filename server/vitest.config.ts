import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // El store persiste en disco; en los tests trabajamos solo en memoria.
    env: { PERSIST: '0' },
  },
});
