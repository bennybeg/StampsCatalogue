import { describe, it, expect } from 'vitest';
import { crop, withMargin, resizeTo, type RgbaImage } from './image';

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = (x * 7 + y * 3) % 256;
      data[i + 3] = 255;
    }
  return { width, height, data };
}

describe('crop', () => {
  it('returns the boxed region with matching pixels', () => {
    const src = gradient(10, 10);
    const out = crop(src, { x: 2, y: 3, w: 4, h: 5 });
    expect(out.width).toBe(4);
    expect(out.height).toBe(5);
    expect(Array.from(out.data.slice(0, 4))).toEqual(Array.from(src.data.slice((3 * 10 + 2) * 4, (3 * 10 + 2) * 4 + 4)));
  });
});

describe('withMargin', () => {
  it('expands by 4% of the longer side on each side', () => {
    expect(withMargin({ x: 10, y: 10, w: 100, h: 50 }, gradient(200, 200))).toEqual({ x: 6, y: 6, w: 108, h: 58 });
  });
  it('clamps to the image bounds', () => {
    expect(withMargin({ x: 0, y: 0, w: 100, h: 100 }, gradient(100, 100))).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});

describe('resizeTo', () => {
  it('downscales so the longer side equals maxSide', () => {
    const { image, scale } = resizeTo(gradient(4000, 3000), 1600);
    expect(image.width).toBe(1600);
    expect(image.height).toBe(1200);
    expect(image.data.length).toBe(1600 * 1200 * 4);
    expect(scale).toBeCloseTo(0.4);
  });
  it('returns the same image when already small enough', () => {
    const src = gradient(800, 600);
    const { image, scale } = resizeTo(src, 1600);
    expect(image).toBe(src);
    expect(scale).toBe(1);
  });
});
