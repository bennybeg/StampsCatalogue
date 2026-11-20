import { describe, it, expect } from 'vitest';
import { colorSignature, colorSimilarity } from './color';
import type { RgbaImage } from './image';

function solid(w: number, h: number, [r, g, b]: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { width: w, height: h, data };
}

function withBlob(img: RgbaImage, fraction: number): RgbaImage {
  const out = { ...img, data: new Uint8ClampedArray(img.data) };
  const side = Math.round(Math.sqrt(fraction) * img.width);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = (y * img.width + x) * 4;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = 10;
    }
  return out;
}

describe('colorSignature', () => {
  it('has 72 bins summing to 1', () => {
    const s = colorSignature(solid(50, 60, [200, 40, 40]));
    expect(s.length).toBe(72);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
});

describe('colorSimilarity', () => {
  it('is ~1 for identical colours', () => {
    const red = colorSignature(solid(50, 60, [200, 30, 30]));
    expect(colorSimilarity(red, colorSignature(solid(50, 60, [200, 30, 30])))).toBeGreaterThan(0.99);
  });
  it('is low for red vs blue', () => {
    const red = colorSignature(solid(50, 60, [200, 30, 30]));
    const blue = colorSignature(solid(50, 60, [30, 30, 200]));
    expect(colorSimilarity(red, blue)).toBeLessThan(0.1);
  });
  it('tolerates a dark corner postmark covering 30% of the stamp', () => {
    const red = solid(100, 100, [200, 30, 30]);
    expect(colorSimilarity(colorSignature(red), colorSignature(withBlob(red, 0.3)))).toBeGreaterThan(0.7);
  });
});
