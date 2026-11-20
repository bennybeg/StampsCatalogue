import type { Handlers, Reply, Request } from './handlers';

export type Recognizer = Handlers;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Port = { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null; onerror?: any; onmessageerror?: any };

/** Generous: the first warm-up downloads ~24 MB; detection on a big photo takes seconds on a phone. */
export const CALL_TIMEOUT_MS = 5 * 60_000;

/**
 * RPC over a worker port. If the worker fails to load or crashes, every pending call is rejected and
 * `onDead` fires (so the caller can start a fresh worker); a call that never answers times out.
 */
export function createRecognizer(port: Port, opts: { onDead?(): void; timeoutMs?: number } = {}): Recognizer {
  const timeoutMs = opts.timeoutMs ?? CALL_TIMEOUT_MS;
  let next = 1;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const settle = (id: number) => { const p = pending.get(id); if (p) { clearTimeout(p.timer); pending.delete(id); } return p; };
  port.onmessage = (e: MessageEvent) => {
    const r = e.data as Reply;
    const p = settle(r.id);
    if (!p) return;
    if (r.ok) p.resolve(r.value); else p.reject(new Error(r.error));
  };
  const die = () => {
    for (const id of [...pending.keys()]) settle(id)!.reject(new Error('recognizer stopped'));
    opts.onDead?.();
  };
  port.onerror = die;
  port.onmessageerror = die;
  const call = (method: keyof Handlers) => (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => { if (settle(id)) reject(new Error('timeout')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      port.postMessage({ id, method, args } satisfies Request);
    });
  return {
    detect: call('detect'),
    snap: call('snap'),
    describe: call('describe'),
    warmUp: call('warmUp'),
  } as Recognizer;
}

let shared: { worker: Worker; rec: Recognizer } | null = null;

/** The app-wide recognizer in a Web Worker; replaced by a fresh worker after a crash. */
export function getRecognizer(): Recognizer {
  if (!shared) {
    const worker = new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' });
    const rec = createRecognizer(worker as unknown as Port, {
      onDead: () => { worker.terminate(); if (shared?.worker === worker) shared = null; },
    });
    shared = { worker, rec };
  }
  return shared.rec;
}
