import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'trial/**/*.test.ts'],
    exclude: ['**/*.slow.test.ts', 'node_modules/**'],
    testTimeout: 30000,
    deps: { interopDefault: false },
  },
});
