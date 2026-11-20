import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'trial/**/*.test.ts'], exclude: ['**/*.slow.test.ts', 'node_modules/**'], testTimeout: 30000 },
});
