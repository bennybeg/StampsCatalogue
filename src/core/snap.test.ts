import { describe, it, expect } from 'vitest';
import { snapBoxAt } from './snap';
import type { Box } from './image';
import { blankImage, drawStamp, PAGE_BG, type Rgb } from './testing/synthetic';

const GRID: Box[] = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) GRID.push({ x: 150 + c * 330, y: 200 + r * 420, w: 240, h: 300 });
const near = (a: Box | null, b: Box, tol = 6) => {
  expect(a).not.toBeNull();
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(a![k] - b[k])).toBeLessThanOrEqual(tol);
};
const page = (bg: Rgb = PAGE_BG) => { const p = blankImage(1200, 1600, bg); GRID.forEach((b) => drawStamp(p, b)); return p; };

describe('snapBoxAt', () => {
  it('snaps to the tapped stamp', async () => {
    near(await snapBoxAt(page(), GRID[1].x + 100, GRID[1].y + 150), GRID[1]);
  });
  it('returns null on bare page', async () => {
    expect(await snapBoxAt(page(), 60, 1500)).toBeNull();
  });
  it('takes only the tapped one of two stamps 3 px apart', async () => {
    const p = blankImage(1200, 1600, PAGE_BG);
    drawStamp(p, { x: 300, y: 400, w: 240, h: 300 });
    drawStamp(p, { x: 543, y: 400, w: 240, h: 300 });
    near(await snapBoxAt(p, 660, 550), { x: 543, y: 400, w: 240, h: 300 });
  });
  it('works on a cream album page', async () => {
    near(await snapBoxAt(page([225, 215, 190]), GRID[4].x + 120, GRID[4].y + 150), GRID[4]);
  });
});
