import type { Detected } from './detect';
import type { Box, RgbaImage } from './image';

/** Post-processing of SlimSAM masks into stamp boxes. Pure; no model here. */

export type SamCand = Box & { score: number };
export type MaskInfo = { box: Box; fill: number };

const MASK = 256;
export const MIN_IOU = 0.85;
export const MIN_FILL = 0.85;
const MIN_AREA = 0.002, MAX_AREA = 0.3, MAX_ASPECT = 3.5;

function overlap(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}
export const iou = (a: Box, b: Box) => { const i = overlap(a, b); return i / (a.w * a.h + b.w * b.h - i); };
/** Fraction of `a` that lies inside `b`. */
export const insideOf = (a: Box, b: Box) => overlap(a, b) / (a.w * a.h);

/** Bounding box (scaled by `scale`) and fill of `mask > 0` within the valid region of one 256×256 mask. */
export function maskBox(mask: Float32Array, offset: number, validW: number, validH: number, scale: number): MaskInfo | null {
  let x0 = MASK, y0 = MASK, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < validH; y++)
    for (let x = 0; x < validW; x++)
      if (mask[offset + y * MASK + x] > 0) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  return { box: { x: x0 * scale, y: y0 * scale, w: w * scale, h: h * scale }, fill: n / (w * h) };
}

/** Confident, rectangular, stamp-sized, not a sliver. */
export function isStampLike(m: MaskInfo, iouScore: number, imgW: number, imgH: number): boolean {
  const area = (m.box.w * m.box.h) / (imgW * imgH);
  const aspect = Math.max(m.box.w, m.box.h) / Math.min(m.box.w, m.box.h);
  return iouScore >= MIN_IOU && m.fill >= MIN_FILL && area >= MIN_AREA && area <= MAX_AREA && aspect <= MAX_ASPECT;
}

/** Empty album strip: dark and flat (sampled every 3 px). */
export function isEmptyStrip(img: RgbaImage, b: Box): boolean {
  let n = 0, s = 0, s2 = 0;
  for (let y = Math.max(0, b.y); y < Math.min(img.height, b.y + b.h); y += 3)
    for (let x = Math.max(0, b.x); x < Math.min(img.width, b.x + b.w); x += 3) {
      const i = (y * img.width + x) * 4, v = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      n++; s += v; s2 += v * v;
    }
  if (!n) return true;
  const mean = s / n;
  return mean < 110 && Math.sqrt(Math.max(0, s2 / n - mean * mean)) < 18;
}

/** Non-max suppression, then drop rows/strips (boxes holding ≥ 2 stamps) and parts of a stamp. */
export function pickStamps(cands: SamCand[]): Box[] {
  const kept: SamCand[] = [];
  for (const c of [...cands].sort((a, b) => b.score - a.score)) if (!kept.some((k) => iou(k, c) > 0.6)) kept.push(c);
  const noRows = kept.filter((c) => kept.filter((o) => o !== c && insideOf(o, c) > 0.85).length < 2);
  return noRows
    .filter((c) => !noRows.some((o) => o !== c && o.w * o.h > c.w * c.h * 1.15 && insideOf(c, o) > 0.85))
    .map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/** For a tap: the smallest of SAM's (up to 3) masks that looks like a stamp. */
export function bestPointBox(masks: (MaskInfo & { iou: number })[], imgW: number, imgH: number): Box | null {
  const ok = masks.filter((m) => isStampLike(m, m.iou, imgW, imgH)).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
  return ok[0]?.box ?? null;
}

/** Classical detections stay as they are; SAM boxes not already covered by one are added as singles. */
export function mergeDetections(classical: Detected[], sam: Box[]): Detected[] {
  const out = [...classical];
  for (const b of sam) {
    if (out.some((d) => iou(d.box, b) > 0.5 || insideOf(b, d.box) > 0.85)) continue;
    out.push({ box: b, kind: 'single', inner: [] });
  }
  return out;
}
