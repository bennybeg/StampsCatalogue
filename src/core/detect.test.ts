import { describe, it, expect } from 'vitest';
import { detectItems } from './detect';
import type { Box } from './image';
import { blankImage, drawRect, drawStamp, PAGE_BG } from './testing/synthetic';

const GRID: Box[] = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) GRID.push({ x: 150 + c * 330, y: 200 + r * 420, w: 240, h: 300 });

function near(a: Box, b: Box, tol: number) {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(tol);
}

describe('detectItems', () => {
  it('finds six separated stamps in row-major order', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    GRID.forEach((b) => drawStamp(page, b));
    const found = await detectItems(page);
    expect(found).toHaveLength(6);
    found.forEach((d, i) => near(d.box, GRID[i], 6));
    found.forEach((d) => expect(d.kind).toBe('single'));
  });

  it('keeps two stamps 4 px apart as two items', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawStamp(page, { x: 300, y: 400, w: 240, h: 300 });
    drawStamp(page, { x: 544, y: 400, w: 240, h: 300 });
    expect(await detectItems(page)).toHaveLength(2);
  });

  it('returns a box containing a stamp rotated 8 degrees', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    const corners = drawStamp(page, { x: 400, y: 500, w: 240, h: 300 }, [40, 70, 160], 8);
    const found = await detectItems(page);
    expect(found).toHaveLength(1);
    const b = found[0].box;
    for (const [x, y] of corners) {
      expect(x).toBeGreaterThanOrEqual(b.x - 1);
      expect(y).toBeGreaterThanOrEqual(b.y - 1);
      expect(x).toBeLessThanOrEqual(b.x + b.w + 1);
      expect(y).toBeLessThanOrEqual(b.y + b.h + 1);
    }
  });

  it('works on a full-resolution 6000x8000 photo and returns original coordinates', async () => {
    const s = 5;
    const page = blankImage(1200 * s, 1600 * s, PAGE_BG);
    GRID.forEach((b) => drawStamp(page, { x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s }));
    const found = await detectItems(page);
    expect(found).toHaveLength(6);
    found.forEach((d, i) => near(d.box, { x: GRID[i].x * s, y: GRID[i].y * s, w: GRID[i].w * s, h: GRID[i].h * s }, 0.02 * GRID[i].h * s));
  }, 60000);

  it('returns an empty list for a blank page', async () => {
    expect(await detectItems(blankImage(1200, 1600, PAGE_BG))).toEqual([]);
  });

  it('classifies an envelope-sized item as a cover', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawRect(page, { x: 150, y: 150, w: 900, h: 500 }, [232, 228, 218]);
    drawStamp(page, { x: 150, y: 900, w: 120, h: 150 });
    drawStamp(page, { x: 450, y: 900, w: 120, h: 150 });
    drawStamp(page, { x: 750, y: 900, w: 120, h: 150 });
    const found = await detectItems(page);
    expect(found).toHaveLength(4);
    expect(found[0].kind).toBe('cover');
    expect(found.slice(1).map((d) => d.kind)).toEqual(['single', 'single', 'single']);
  });
});
