import { describe, it, expect } from 'vitest';
import { cachedPrepare, imageKey } from './samCache';

const img = (v: number) => ({ width: 50, height: 40, data: new Uint8ClampedArray(8000).fill(v) });

describe('cachedPrepare', () => {
  it('computes one embedding for concurrent taps on the same photo, a new one for a new photo', async () => {
    let calls = 0;
    const prepare = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return { id: calls }; };
    const [a, b] = await Promise.all([cachedPrepare(img(1), prepare), cachedPrepare(img(1), prepare)]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    await cachedPrepare(img(2), prepare);
    expect(calls).toBe(2);
  });
  it('tells photos apart', () => expect(imageKey(img(1))).not.toBe(imageKey(img(2))));
});
