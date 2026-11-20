import { env } from '@huggingface/transformers';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { configureRuntime } from './runtime';
import { serve } from './handlers';

configureRuntime(env as unknown as Parameters<typeof configureRuntime>[0], ortWasmUrl);
serve(self as unknown as Parameters<typeof serve>[0]);
