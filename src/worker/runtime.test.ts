import { describe, it, expect } from 'vitest';
import { configureRuntime } from './runtime';

describe('configureRuntime', () => {
  it('points the ONNX runtime at the bundled wasm instead of the CDN', () => {
    const env = { allowLocalModels: true, useBrowserCache: false, backends: { onnx: { wasm: {} as Record<string, unknown> } } };
    configureRuntime(env, '/assets/ort.wasm');
    expect(env.backends.onnx.wasm.wasmPaths).toEqual({ wasm: '/assets/ort.wasm' });
    expect(env.allowLocalModels).toBe(false);
    expect(env.useBrowserCache).toBe(true);
  });
});
