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

  it('separates two overlapping stamps offset vertically', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawStamp(page, { x: 300, y: 400, w: 240, h: 300 }, [40, 70, 160]);
    drawStamp(page, { x: 530, y: 440, w: 240, h: 300 }, [160, 50, 40]);
    const found = await detectItems(page);
    expect(found).toHaveLength(2);
  });

  it('ignores a light page-edge strip along one side', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawRect(page, { x: 1080, y: 0, w: 120, h: 1600 }, [150, 150, 155]);
    GRID.forEach((b) => drawStamp(page, b));
    const found = await detectItems(page);
    expect(found).toHaveLength(6);
  });

  it('returns an empty list for a blank page', async () => {
    expect(await detectItems(blankImage(1200, 1600, PAGE_BG))).toEqual([]);
  });

  it('classifies an envelope- or souvenir-sheet-sized item as a sheet', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawRect(page, { x: 150, y: 150, w: 900, h: 500 }, [232, 228, 218]);
    drawStamp(page, { x: 150, y: 900, w: 120, h: 150 });
    drawStamp(page, { x: 450, y: 900, w: 120, h: 150 });
    drawStamp(page, { x: 750, y: 900, w: 120, h: 150 });
    const found = await detectItems(page);
    expect(found).toHaveLength(4);
    expect(found[0].kind).toBe('sheet');
    expect(found.slice(1).map((d) => d.kind)).toEqual(['single', 'single', 'single']);
  });
});

function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / (a.w * a.h + b.w * b.h - ix * iy);
}

/** 2×2 block of touching 120×150 stamps at (400,400) with dotted perforation lines between them. */
function blockPage() {
  const page = blankImage(1200, 1600, PAGE_BG);
  const cells: Box[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const b = { x: 400 + c * 120, y: 400 + r * 150, w: 120, h: 150 };
    drawStamp(page, b, [[40, 70, 160], [160, 50, 40], [40, 140, 60], [150, 120, 30]][r * 2 + c] as [number, number, number]);
    cells.push(b);
  }
  for (let y = 400; y < 700; y += 4) drawRect(page, { x: 519, y, w: 2, h: 2 }, PAGE_BG);
  for (let x = 400; x < 640; x += 4) drawRect(page, { x, y: 549, w: 2, h: 2 }, PAGE_BG);
  return { page, cells };
}

describe('inner stamps', () => {
  it('splits a 2x2 block into four stamps', async () => {
    const { page, cells } = blockPage();
    const found = await detectItems(page);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('block');
    const { box, inner } = found[0];
    expect(inner).toHaveLength(4);
    const abs = inner.map((b) => ({ ...b, x: b.x + box.x, y: b.y + box.y }));
    cells.forEach((c) => near(abs.reduce((best, b) => (iou(b, c) > iou(best, c) ? b : best)), c, 6));
  });

  it('leaves a single stamp single', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawStamp(page, { x: 400, y: 500, w: 240, h: 300 });
    const found = await detectItems(page);
    expect(found[0].kind).toBe('single');
    expect(found[0].inner.length).toBeLessThanOrEqual(1);
  });

  it('finds the stamp on a cover', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawRect(page, { x: 150, y: 150, w: 900, h: 500 }, [232, 228, 218]);
    const stamp = { x: 880, y: 190, w: 120, h: 150 };
    drawStamp(page, stamp, [160, 50, 40]);
    for (const b of [{ x: 150, y: 900, w: 120, h: 150 }, { x: 450, y: 900, w: 120, h: 150 }]) drawStamp(page, b);
    const found = await detectItems(page);
    const cover = found.find((d) => d.kind === 'sheet')!;
    expect(cover).toBeDefined();
    expect(cover.inner).toHaveLength(1);
    const b = cover.inner[0];
    expect(iou({ ...b, x: b.x + cover.box.x, y: b.y + cover.box.y }, stamp)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('review fixes', () => {
  it('I-1: keeps two stamps with a 10 px gap apart on a 5x photo', async () => {
    const s = 5;
    const page = blankImage(1200 * s, 1600 * s, PAGE_BG);
    drawStamp(page, { x: 300 * s, y: 400 * s, w: 240 * s, h: 300 * s });
    drawStamp(page, { x: 300 * s + 240 * s + 10, y: 400 * s, w: 240 * s, h: 300 * s });
    expect(await detectItems(page)).toHaveLength(2);
  }, 60000);

  it('I-1: keeps two stamps with a 2 px gap apart', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawStamp(page, { x: 300, y: 400, w: 240, h: 300 });
    drawStamp(page, { x: 542, y: 400, w: 240, h: 300 });
    expect(await detectItems(page)).toHaveLength(2);
  });

  it('I-2: keeps a diamond (45 degree) stamp', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawStamp(page, { x: 150, y: 200, w: 240, h: 300 });
    drawStamp(page, { x: 500, y: 600, w: 250, h: 250 }, [160, 50, 40], 45);
    drawStamp(page, { x: 800, y: 200, w: 240, h: 300 });
    expect(await detectItems(page)).toHaveLength(3);
  });

  it('I-2: reports a sprawling chain of touching stamps as one unresolved item instead of dropping it', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawStamp(page, { x: 200, y: 200, w: 240, h: 300 });
    drawStamp(page, { x: 430, y: 490, w: 240, h: 300 }, [160, 50, 40]);
    drawStamp(page, { x: 660, y: 780, w: 240, h: 300 }, [40, 140, 60]);
    const found = await detectItems(page);
    expect(found.length).toBeGreaterThanOrEqual(1);
    const covered = found.some((d) => d.box.x <= 205 && d.box.y <= 205 && d.box.x + d.box.w >= 895 && d.box.y + d.box.h >= 1075);
    const all3 = found.length >= 3;
    expect(covered ? found.find((d) => d.unresolved) : all3).toBeTruthy();
  });

  it('a huge irregular blob does not swallow the separate stamps inside its box', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawRect(page, { x: 60, y: 60, w: 1080, h: 260 }, [170, 170, 175]);
    drawRect(page, { x: 60, y: 60, w: 260, h: 1480 }, [170, 170, 175]);
    drawStamp(page, { x: 500, y: 600, w: 240, h: 300 });
    drawStamp(page, { x: 820, y: 1000, w: 240, h: 300 });
    const found = await detectItems(page);
    expect(found.filter((d) => d.box.w < 400)).toHaveLength(2);
  });

  it('I-3: finds the stamps when the table is visible around the page', async () => {
    const page = blankImage(1200, 1600, [22, 16, 12]);
    drawRect(page, { x: 100, y: 100, w: 1000, h: 1400 }, [150, 150, 152]);
    GRID.forEach((b) => drawStamp(page, b));
    const found = await detectItems(page);
    expect(found).toHaveLength(6);
    found.forEach((d, i) => near(d.box, GRID[i], 6));
  });

  it('I-4: treats a large envelope next to one stamp as a sheet and finds the stamp on it', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawRect(page, { x: 150, y: 150, w: 900, h: 500 }, [232, 228, 218]);
    drawStamp(page, { x: 880, y: 190, w: 120, h: 150 }, [160, 50, 40]);
    drawStamp(page, { x: 150, y: 900, w: 120, h: 150 });
    const found = await detectItems(page);
    const cover = found.find((d) => d.box.w > 800)!;
    expect(cover.kind).toBe('sheet');
    expect(cover.inner).toHaveLength(1);
  });

  it('I-5: does not split a single stamp with a light band across its design', async () => {
    const page = blankImage(1200, 1600, PAGE_BG);
    drawStamp(page, { x: 400, y: 500, w: 240, h: 300 });
    drawRect(page, { x: 430, y: 640, w: 180, h: 20 }, [236, 230, 214]);
    const found = await detectItems(page);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('single');
  });
});
