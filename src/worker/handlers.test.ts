import { describe, it, expect } from 'vitest';
import { makeHandlers } from './handlers';

const img = { width: 100, height: 100, data: new Uint8ClampedArray(40000).fill(200) }; // light, not empty strip
const classical = [{ box: { x: 0, y: 0, w: 30, h: 40 }, kind: 'single' as const, inner: [] }];
const deps = (sam: Partial<Parameters<typeof makeHandlers>[0]>) => makeHandlers({
  detectItems: async () => classical,
  snapBoxAt: async () => ({ x: 1, y: 1, w: 5, h: 5 }),
  samFindStamps: async () => [],
  samBoxAt: async () => null,
  warmSam: async () => {},
  warmCore: async () => {},
  describe: async () => ({ embedding: new Float32Array(1), color: new Float32Array(1) }),
  ...sam,
});

describe('worker handlers', () => {
  it('falls back to the classical detector when SlimSAM fails', async () => {
    const h = deps({ samFindStamps: async () => { throw new Error('no model'); } });
    expect(await h.detect(img)).toEqual(classical);
  });
  it('adds stamps only SlimSAM found', async () => {
    const h = deps({ samFindStamps: async () => [{ x: 50, y: 50, w: 30, h: 40 }] });
    expect(await h.detect(img)).toHaveLength(2);
  });
  it('taps with SlimSAM first, classical when SlimSAM finds nothing', async () => {
    expect(await deps({ samBoxAt: async () => ({ x: 9, y: 9, w: 9, h: 9 }) }).snap(img, 1, 1)).toEqual({ x: 9, y: 9, w: 9, h: 9 });
    expect(await deps({}).snap(img, 1, 1)).toEqual({ x: 1, y: 1, w: 5, h: 5 });
    expect(await deps({ samBoxAt: async () => { throw new Error('x'); } }).snap(img, 1, 1)).toEqual({ x: 1, y: 1, w: 5, h: 5 });
  });
  it('warms up even when SlimSAM cannot load', async () => {
    await expect(deps({ warmSam: async () => { throw new Error('offline'); } }).warmUp()).resolves.toBeUndefined();
  });

  it('drops boxes on empty dark album strip, whichever method found them', async () => {
    const dark = { width: 100, height: 100, data: new Uint8ClampedArray(40000).map((_, i) => (i % 4 === 3 ? 255 : 50)) };
    const h = deps({ samFindStamps: async () => [{ x: 50, y: 50, w: 30, h: 40 }] });
    expect(await h.detect(dark)).toEqual([]);
  });

  it('stops an older page search when a newer one starts', async () => {
    const stops: boolean[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    const h = deps({
      samFindStamps: async (_i, _p, shouldStop) => {
        if (++n === 1) { await gate; stops.push(shouldStop!()); } else stops.push(shouldStop!());
        return [];
      },
    });
    const first = h.detect(img);
    const second = h.detect(img);
    await second;
    release();
    await first;
    expect(stops).toEqual([false, true]);
  });

  it('filters empty album strip in the quick club detector too', async () => {
    const dark = { width: 100, height: 100, data: new Uint8ClampedArray(40000).map((_, i) => (i % 4 === 3 ? 255 : 50)) };
    expect(await deps({}).quickDetect(dark)).toEqual([]);
  });

  it('on an engine crash still hands back the classical stamps, flags it fatal, and stops using SlimSAM', async () => {
    let samCalls = 0;
    const h = deps({ samFindStamps: async () => { samCalls++; throw new RangeError('Array buffer allocation failed'); } });
    const err = await h.detect(img).then(() => null, (e) => e);
    expect(err).toMatchObject({ fatal: true, fallback: classical });
    expect(await h.detect(img)).toEqual(classical);
    expect(samCalls).toBe(1);
  });
});
