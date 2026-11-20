import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.slow.test.ts'], testTimeout: 300000, hookTimeout: 300000, deps: { interopDefault: false } },
});
