import { describe, it, expect } from 'vitest';
import { resizeBox } from './BoxEditor';

describe('resizeBox', () => {
  it('keeps inner stamps in place on the photo when the top-left corner moves', () => {
    const eb = { key: 'a', kind: 'block' as const, box: { x: 100, y: 100, w: 200, h: 200 }, inner: [{ x: 10, y: 10, w: 80, h: 80 }] };
    const r = resizeBox(eb, 'nw', { x: 80, y: 90 }, 1000, 1000);
    expect(r.box).toEqual({ x: 80, y: 90, w: 220, h: 210 });
    expect(r.inner[0]).toEqual({ x: 30, y: 20, w: 80, h: 80 }); // still at photo (110, 110)
  });
});
