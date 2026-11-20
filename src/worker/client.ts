import type { Handlers, Reply, Request } from './handlers';

export type Recognizer = Handlers;
type Port = { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

export function createRecognizer(port: Port): Recognizer {
  let next = 1;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  port.onmessage = (e: MessageEvent) => {
    const r = e.data as Reply;
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    if (r.ok) p.resolve(r.value); else p.reject(new Error(r.error));
  };
  const call = (method: keyof Handlers) => (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      port.postMessage({ id, method, args } satisfies Request);
    });
  return {
    detect: call('detect'),
    snap: call('snap'),
    describe: call('describe'),
    warmUp: call('warmUp'),
  } as Recognizer;
}

let shared: Recognizer | null = null;

/** The app-wide recognizer, running OpenCV and the model in a Web Worker. */
export function getRecognizer(): Recognizer {
  if (!shared) {
    const w = new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' });
    shared = createRecognizer(w as unknown as Port);
  }
  return shared;
}
