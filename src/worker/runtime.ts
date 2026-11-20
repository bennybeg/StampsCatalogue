type Env = { allowLocalModels: boolean; useBrowserCache: boolean; backends: { onnx: { wasm?: Record<string, unknown> } } };

/**
 * Run fully from the app's own files: the model comes from huggingface.co once and is kept in Cache
 * Storage; the ONNX runtime wasm is the copy bundled (and precached) with the app, not jsdelivr.
 */
export function configureRuntime(env: Env, wasmUrl: string): void {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl };
}
