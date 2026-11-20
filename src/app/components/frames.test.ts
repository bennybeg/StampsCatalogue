import { describe, it, expect } from 'vitest';
import { moveBox, defaultBoxAt, type EditBox } from './BoxEditor';

const eb = (x: number, y: number, w = 100, h = 120): EditBox => ({ key: 'k', kind: 'single', box: { x, y, w, h }, inner: [] });

describe('moveBox', () => {
  it('moves a frame and keeps it inside the photo', () => {
    expect(moveBox(eb(100, 100), 50, -30, 1000, 1000).box).toEqual({ x: 150, y: 70, w: 100, h: 120 });
    expect(moveBox(eb(100, 100), -500, 2000, 1000, 1000).box).toEqual({ x: 0, y: 880, w: 100, h: 120 });
  });
});

describe('defaultBoxAt', () => {
  it('uses the typical size of the frames already on the page, centred on the tap', () => {
    const b = defaultBoxAt(500, 500, [eb(0, 0, 100, 120), eb(0, 0, 120, 140), eb(0, 0, 110, 130)], 1000, 1000);
    expect(b).toEqual({ x: 445, y: 435, w: 110, h: 130 });
  });
  it('falls back to a stamp-sized frame and stays inside the photo', () => {
    const b = defaultBoxAt(990, 10, [], 1000, 800);
    expect(b.w).toBe(180);
    expect(b.h).toBe(225);
    expect(b.x + b.w).toBeLessThanOrEqual(1000);
    expect(b.y).toBe(0);
  });
});
