import { describe, it, expect } from 'vitest';
import { serve } from './handlers';
import { createRecognizer } from './client';

const img = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

function pair(h: Parameters<typeof serve>[1]) {
  const ch = new MessageChannel();
  serve(ch.port1, h);
  return { rec: createRecognizer(ch.port2), close: () => { ch.port1.close(); ch.port2.close(); } };
}

const base = {
  detect: async () => [{ box: { x: 1, y: 2, w: 3, h: 4 }, kind: 'single' as const, inner: [] }],
  snap: async () => null,
  describe: async () => ({ embedding: new Float32Array(3), color: new Float32Array(72) }),
  warmUp: async () => {},
  quickDetect: async () => [],
  disableSam: async () => {},
};

describe('recognizer RPC', () => {
  it('returns handler results', async () => {
    const { rec, close } = pair(base);
    expect(await rec.detect(img)).toEqual([{ box: { x: 1, y: 2, w: 3, h: 4 }, kind: 'single', inner: [] }]);
    close();
  });
  it('rejects with the handler error message', async () => {
    const { rec, close } = pair({ ...base, snap: async () => { throw new Error('boom'); } });
    await expect(rec.snap(img, 0, 0)).rejects.toThrow('boom');
    close();
  });
  it('keeps concurrent calls apart', async () => {
    const { rec, close } = pair({ ...base, snap: async (_i, x, y) => ({ x, y, w: 1, h: 1 }) });
    const [a, b] = await Promise.all([rec.snap(img, 1, 1), rec.snap(img, 9, 9)]);
    expect([a!.x, b!.x]).toEqual([1, 9]);
    close();
  });

  it('rejects pending calls and reports a dead worker when it errors', async () => {
    const port = { postMessage() {}, onmessage: null, onerror: null as null | ((e: unknown) => void) };
    let dead = 0;
    const rec = createRecognizer(port, { onDead: () => dead++ });
    const p = rec.detect(img);
    port.onerror!(new Event('error'));
    await expect(p).rejects.toThrow();
    expect(dead).toBe(1);
  });

  it('times out a call that never answers', async () => {
    const port = { postMessage() {}, onmessage: null };
    const rec = createRecognizer(port, { timeoutMs: 20 });
    await expect(rec.detect(img)).rejects.toThrow('timeout');
  });

  it('forwards progress reports to the caller before the result', async () => {
    const seen: number[] = [];
    const { rec, close } = pair({ ...base, detect: async (_i, onProgress) => { onProgress?.(0.25); onProgress?.(0.75); return []; } });
    expect(await rec.detect(img, (f) => seen.push(f))).toEqual([]);
    expect(seen).toEqual([0.25, 0.75]);
    close();
  });

  it('restarts the worker after a fatal engine error (e.g. out of memory)', async () => {
    let dead = 0;
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => ch.port1.postMessage({ id: e.data.id, ok: false, error: 'Aborted()', fatal: true });
    const rec = createRecognizer(ch.port2, { onDead: () => dead++ });
    await expect(rec.detect(img)).rejects.toThrow();
    expect(dead).toBe(1);
    ch.port1.close(); ch.port2.close();
  });

  it('keeps waiting while progress keeps arriving', async () => {
    const ch = new MessageChannel();
    ch.port1.onmessage = async (e) => {
      for (let i = 1; i <= 4; i++) { await new Promise((r) => setTimeout(r, 15)); ch.port1.postMessage({ id: e.data.id, progress: i / 4 }); }
      ch.port1.postMessage({ id: e.data.id, ok: true, value: [] });
    };
    const rec = createRecognizer(ch.port2, { timeoutMs: 40 });
    await expect(rec.detect(img, () => {})).resolves.toEqual([]);
    ch.port1.close(); ch.port2.close();
  });
});
