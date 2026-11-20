// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileToRgba } from './imageio';

const draws: { w: number; h: number; dw: number; dh: number }[] = [];

class FakeCanvas {
  constructor(public width: number, public height: number) {}
  getContext() {
    const c = this;
    return {
      drawImage: (_b: unknown, _x: number, _y: number, dw: number, dh: number) => draws.push({ w: c.width, h: c.height, dw, dh }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    };
  }
}

afterEach(() => { vi.unstubAllGlobals(); draws.length = 0; });

describe('fileToRgba', () => {
  it('downscales a 6000x8000 photo so the longer side is 3000', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 6000, height: 8000, close() {} })));
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const img = await fileToRgba(new Blob(['x']));
    expect(draws[0]).toEqual({ w: 2250, h: 3000, dw: 2250, dh: 3000 });
    expect([img.width, img.height]).toEqual([2250, 3000]);
  });

  it('keeps a small photo at its size', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 1600, close() {} })));
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const img = await fileToRgba(new Blob(['x']));
    expect([img.width, img.height]).toEqual([1200, 1600]);
  });
});
