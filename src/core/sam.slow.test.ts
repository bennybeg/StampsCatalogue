import { describe, it, expect } from 'vitest';
import { samFindStamps, samBoxAt } from './sam';
import type { Box } from './image';
import { blankImage, drawRect, drawStamp, PAGE_BG } from './testing/synthetic';

// 6 stamps; (0,1) and (3,4) touch edge to edge, as in a stockbook strip.
const TRUTH: Box[] = [
  { x: 100, y: 150, w: 220, h: 280 }, { x: 320, y: 150, w: 220, h: 280 }, { x: 700, y: 150, w: 220, h: 280 },
  { x: 100, y: 650, w: 220, h: 280 }, { x: 320, y: 650, w: 220, h: 280 }, { x: 700, y: 650, w: 220, h: 280 },
];
const DESIGNS: [number, number, number][] = [[40, 70, 160], [160, 50, 40], [40, 140, 60], [150, 120, 30], [120, 40, 140], [30, 130, 140]];
// Real stamps show their edge (perforation shadow); a 2 px darker outline stands in for it.
const page = () => {
  const p = blankImage(1100, 1200, PAGE_BG);
  TRUTH.forEach((b, i) => {
    drawStamp(p, b, DESIGNS[i]);
    for (const r of [{ ...b, h: 2 }, { ...b, y: b.y + b.h - 2, h: 2 }, { ...b, w: 2 }, { ...b, x: b.x + b.w - 2, w: 2 }]) drawRect(p, r, [150, 145, 135]);
  });
  return p;
};
const close = (a: Box, b: Box, tol = 12) => (['x', 'y', 'w', 'h'] as const).every((k) => Math.abs(a[k] - b[k]) <= tol);

describe('SlimSAM', () => {
  it('finds touching stamps separately and never boxes two stamps as one', async () => {
    const boxes = await samFindStamps(page());
    const hits = TRUTH.filter((t) => boxes.some((b) => close(b, t, 16)));
    expect(hits.length).toBeGreaterThanOrEqual(4);
    for (const b of boxes) expect(b.w).toBeLessThan(300); // a pair would be ~440 wide
  });
  it('outlines just the tapped stamp of a touching pair', async () => {
    const b = await samBoxAt(page(), 430, 800);
    expect(b).not.toBeNull();
    expect(close(b!, TRUTH[4])).toBe(true);
  });
});
