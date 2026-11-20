import { describe, it, expect } from 'vitest';
import { maskBox, isStampLike, isEmptyStrip, pickStamps, bestPointBox, mergeDetections } from './samPick';
import { blankImage, drawStamp, PAGE_BG } from './testing/synthetic';

const mask = (x: number, y: number, w: number, h: number) => {
  const m = new Float32Array(256 * 256).fill(-1);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m[j * 256 + i] = 1;
  return m;
};
const c = (x: number, y: number, w: number, h: number, score = 0.9) => ({ x, y, w, h, score });

describe('maskBox', () => {
  it('returns the scaled bounding box and fill of the mask', () => {
    expect(maskBox(mask(10, 20, 40, 50), 0, 256, 256, 4)).toEqual({ box: { x: 40, y: 80, w: 160, h: 200 }, fill: 1 });
  });
  it('ignores mask pixels outside the valid (unpadded) region', () => {
    const m = mask(10, 20, 40, 50);
    m[250 * 256 + 250] = 1;
    expect(maskBox(m, 0, 200, 200, 4)!.box).toEqual({ x: 40, y: 80, w: 160, h: 200 });
  });
});

describe('isStampLike', () => {
  const ok = { box: { x: 0, y: 0, w: 100, h: 120 }, fill: 0.95 };
  it('accepts a stamp', () => expect(isStampLike(ok, 0.9, 1000, 1000)).toBe(true));
  it('rejects low model confidence', () => expect(isStampLike(ok, 0.8, 1000, 1000)).toBe(false));
  it('rejects irregular shapes', () => expect(isStampLike({ ...ok, fill: 0.7 }, 0.9, 1000, 1000)).toBe(false));
  it('rejects specks', () => expect(isStampLike({ box: { x: 0, y: 0, w: 30, h: 30 }, fill: 1 }, 0.9, 1000, 1000)).toBe(false));
  it('rejects long slivers', () => expect(isStampLike({ box: { x: 0, y: 0, w: 400, h: 90 }, fill: 1 }, 0.9, 1000, 1000)).toBe(false));
});

describe('isEmptyStrip', () => {
  it('flags a flat dark box and not a stamp', () => {
    const img = blankImage(400, 400, PAGE_BG);
    drawStamp(img, { x: 200, y: 200, w: 150, h: 180 });
    expect(isEmptyStrip(img, { x: 10, y: 10, w: 150, h: 150 })).toBe(true);
    expect(isEmptyStrip(img, { x: 200, y: 200, w: 150, h: 180 })).toBe(false);
  });
});

describe('pickStamps', () => {
  it('merges duplicates, drops rows of stamps and parts of a stamp', () => {
    const a = c(0, 0, 100, 120, 0.95), aDup = c(3, 2, 100, 120, 0.9);
    const b = c(110, 0, 100, 120, 0.94);
    const row = c(0, 0, 210, 120, 0.97);
    const portrait = c(10, 10, 30, 30, 0.99);
    const out = pickStamps([a, aDup, b, row, portrait]);
    expect(out).toHaveLength(2);
    expect(out).toEqual(expect.arrayContaining([{ x: 0, y: 0, w: 100, h: 120 }, { x: 110, y: 0, w: 100, h: 120 }]));
  });
});

describe('bestPointBox', () => {
  it('picks the smallest stamp-like mask of the three for a tap', () => {
    const masks = [
      { box: { x: 50, y: 50, w: 20, h: 20 }, fill: 1, iou: 0.95 },   // a speck (too small)
      { box: { x: 0, y: 0, w: 100, h: 120 }, fill: 0.96, iou: 0.93 }, // the stamp
      { box: { x: 0, y: 0, w: 210, h: 120 }, fill: 0.95, iou: 0.97 }, // stamp + neighbour
    ];
    expect(bestPointBox(masks, 1000, 1000)).toEqual({ x: 0, y: 0, w: 100, h: 120 });
    expect(bestPointBox([masks[0]], 1000, 1000)).toBeNull();
  });
});

describe('mergeDetections', () => {
  const block = { box: { x: 0, y: 0, w: 200, h: 200 }, kind: 'block' as const, inner: [{ x: 0, y: 0, w: 100, h: 100 }] };
  it('keeps classical items, skips SAM duplicates and boxes inside them, adds new SAM boxes', () => {
    const out = mergeDetections([block], [{ x: 5, y: 5, w: 195, h: 195 }, { x: 10, y: 10, w: 80, h: 80 }, { x: 300, y: 0, w: 100, h: 120 }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(block);
    expect(out[1]).toEqual({ box: { x: 300, y: 0, w: 100, h: 120 }, kind: 'single', inner: [] });
  });
});

describe('stamp border preference', () => {
  const design = { x: 27, y: 25, w: 169, h: 230 }, stamp = { x: 0, y: 0, w: 225, h: 276 }, pair = { x: 0, y: 0, w: 450, h: 276 };
  it('pickStamps keeps the whole stamp, not only its picture, even when the picture scores higher', () => {
    expect(pickStamps([{ ...design, score: 1 }, { ...stamp, score: 0.87 }])).toEqual([stamp]);
  });
  it('bestPointBox grows from the picture to the stamp around it, but not to a pair of stamps', () => {
    const m = (b: typeof stamp, iou: number) => ({ box: b, fill: 0.97, iou });
    expect(bestPointBox([m(pair, 0.9), m(stamp, 0.91), m(design, 1)], 1000, 1000)).toEqual(stamp);
    expect(bestPointBox([m(pair, 0.9), m(design, 1)], 1000, 1000)).toEqual(design);
  });
});
