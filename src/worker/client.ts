import type { Handlers, Reply, Request } from './handlers';

/** quickDetect is optional so simple fakes need not implement it; callers fall back to detect. */
export type Recognizer = Omit<Handlers, 'quickDetect' | 'disableSam'> & { quickDetect?: Handlers['quickDetect']; disableSam?: Handlers['disableSam'] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Port = { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null; onerror?: any; onmessageerror?: any };

/** Generous: the first warm-up downloads ~24 MB; detection on a big photo takes seconds on a phone. */
export const CALL_TIMEOUT_MS = 5 * 60_000;

/**
 * RPC over a worker port. If the worker fails to load or crashes, every pending call is rejected and
 * `onDead` fires (so the caller can start a fresh worker); a call that never answers times out.
 */
export function createRecognizer(port: Port, opts: { onDead?(reason: 'error' | 'fatal'): void; timeoutMs?: number } = {}): Recognizer {
  const timeoutMs = opts.timeoutMs ?? CALL_TIMEOUT_MS;
  let next = 1;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout>; onProgress?: (f: number) => void }>();
  const settle = (id: number) => { const p = pending.get(id); if (p) { clearTimeout(p.timer); pending.delete(id); } return p; };
  const arm = (id: number, reject: (e: Error) => void) => setTimeout(() => { if (settle(id)) reject(new Error('timeout')); }, timeoutMs);
  port.onmessage = (e: MessageEvent) => {
    const r = e.data as Reply;
    if ('progress' in r) {
      const p = pending.get(r.id);
      if (!p) return;
      clearTimeout(p.timer); // still working: restart the clock
      p.timer = arm(r.id, p.reject);
      p.onProgress?.(r.progress);
      return;
    }
    const p = settle(r.id);
    if (!p) return;
    if (r.ok) p.resolve(r.value); else p.reject(new Error(r.error));
    if (r.fatal) die('fatal');
  };
  function die(reason: 'error' | 'fatal' = 'error') {
    for (const id of [...pending.keys()]) settle(id)!.reject(new Error('recognizer stopped'));
    opts.onDead?.(reason);
  }
  port.onerror = () => die();
  port.onmessageerror = () => die();
  // A trailing function argument is a progress callback: it stays here; the worker reports to it.
  const call = (method: keyof Handlers) => (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = next++;
      const onProgress = typeof args[args.length - 1] === 'function' ? (args.pop() as (f: number) => void) : undefined;
      const timer = arm(id, reject);
      pending.set(id, { resolve, reject, timer, onProgress });
      port.postMessage({ id, method, args, progress: !!onProgress } satisfies Request);
    });
  return {
    detect: call('detect'),
    quickDetect: call('quickDetect'),
    disableSam: call('disableSam'),
    snap: call('snap'),
    describe: call('describe'),
    warmUp: call('warmUp'),
  } as Recognizer;
}

let shared: { worker: Worker; rec: Recognizer } | null = null;
/** Set when SlimSAM crashed a worker: later workers run without it so the crash doesn't repeat. */
let samCrashed = false;

/** The app-wide recognizer in a Web Worker; replaced by a fresh worker after a crash. */
export function getRecognizer(): Recognizer {
  if (!shared) {
    const worker = new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' });
    const rec = createRecognizer(worker as unknown as Port, {
      onDead: (reason) => {
        if (reason === 'fatal') samCrashed = true;
        worker.terminate();
        if (shared?.worker === worker) shared = null;
      },
    });
    if (samCrashed) rec.disableSam?.().catch(() => {});
    shared = { worker, rec };
  }
  return shared.rec;
}
