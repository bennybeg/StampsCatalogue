import { getCv, type CV } from './cv';
import { resizeTo, type Box, type RgbaImage } from './image';

export type ItemKind = 'single' | 'block' | 'cover';
export type Detected = { box: Box; kind: ItemKind; inner: Box[] };

/** Smallest item, as a fraction of the page area (at working resolution). */
const MIN_AREA_FRACTION = 0.002;
/** A contour must fill this much of its minimum-area rectangle to count as rectangular. */
const MIN_FILL = 0.7;
/** Pixels must differ from the page background by at least this much (0–255). */
const MIN_CONTRAST = 25;
/** A box this much inside another box is a duplicate and is dropped. */
const CONTAINED = 0.9;

/**
 * Find stamps, blocks and covers on a photo of an album page.
 * Boxes are in the coordinates of `img`, sorted top-to-bottom then left-to-right.
 */
export async function detectItems(img: RgbaImage, opts: { workingMaxSide?: number } = {}): Promise<Detected[]> {
  const cv = await getCv();
  const { image: work, scale } = resizeTo(img, opts.workingMaxSide ?? 1600);
  const boxes = findRectangles(cv, work, MIN_AREA_FRACTION).map((b) => toOriginal(b, scale, img));
  const kept = dropContained(boxes);
  return sortReadingOrder(classify(kept));
}

/** Axis-aligned boxes of rectangular regions that stand out from the background. */
export function findRectangles(cv: CV, img: RgbaImage, minAreaFraction: number): Box[] {
  const bg = backgroundColour(img);
  const src = cv.matFromImageData(img);
  const diff = new cv.Mat(img.height, img.width, cv.CV_8UC1);
  const d = diff.data as Uint8Array;
  for (let p = 0, i = 0; p < d.length; p++, i += 4) {
    d[p] = Math.max(
      Math.abs(img.data[i] - bg[0]),
      Math.abs(img.data[i + 1] - bg[1]),
      Math.abs(img.data[i + 2] - bg[2]),
    );
  }
  src.delete();

  cv.GaussianBlur(diff, diff, new cv.Size(5, 5), 0);
  const mask = new cv.Mat();
  const otsu = cv.threshold(diff, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  if (otsu < MIN_CONTRAST) cv.threshold(diff, mask, MIN_CONTRAST, 255, cv.THRESH_BINARY);
  diff.delete();

  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
  kernel.delete();

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  mask.delete();
  hierarchy.delete();

  const minArea = minAreaFraction * img.width * img.height;
  const out: Box[] = [];
  for (let k = 0; k < contours.size(); k++) {
    const c = contours.get(k);
    const rr = cv.minAreaRect(c);
    const rrArea = rr.size.width * rr.size.height;
    if (rrArea >= minArea && cv.contourArea(c) / rrArea >= MIN_FILL) {
      const r = cv.boundingRect(c);
      out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
    }
    c.delete();
  }
  contours.delete();
  return out;
}

/** Median colour of a thin frame around the image — the album page behind the stamps. */
function backgroundColour(img: RgbaImage): [number, number, number] {
  const t = Math.max(2, Math.round(Math.min(img.width, img.height) * 0.02));
  const ch: number[][] = [[], [], []];
  const step = Math.max(1, Math.floor((img.width + img.height) / 2000));
  const push = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    ch[0].push(img.data[i]); ch[1].push(img.data[i + 1]); ch[2].push(img.data[i + 2]);
  };
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step)
      if (x < t || y < t || x >= img.width - t || y >= img.height - t) push(x, y);
  return ch.map((v) => { v.sort((a, b) => a - b); return v[v.length >> 1]; }) as [number, number, number];
}

function toOriginal(b: Box, scale: number, img: RgbaImage): Box {
  const x0 = Math.max(0, Math.floor(b.x / scale));
  const y0 = Math.max(0, Math.floor(b.y / scale));
  const x1 = Math.min(img.width, Math.ceil((b.x + b.w) / scale));
  const y1 = Math.min(img.height, Math.ceil((b.y + b.h) / scale));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function dropContained(boxes: Box[]): Box[] {
  return boxes.filter((a, i) =>
    !boxes.some((b, j) => {
      if (i === j || b.w * b.h < a.w * a.h) return false;
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return (ix * iy) / (a.w * a.h) >= CONTAINED && (b.w * b.h > a.w * a.h || j < i);
    }),
  );
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function classify(boxes: Box[]): Detected[] {
  if (boxes.length === 0) return [];
  const ref = median(boxes.map((b) => Math.max(b.w, b.h)));
  return boxes.map((box) => {
    const longer = Math.max(box.w, box.h), aspect = longer / Math.min(box.w, box.h);
    const kind: ItemKind = longer >= 3 * ref && aspect >= 1.3 && aspect <= 2.6 ? 'cover' : 'single';
    return { box, kind, inner: [] };
  });
}

function sortReadingOrder(items: Detected[]): Detected[] {
  if (items.length === 0) return items;
  const tol = 0.25 * median(items.map((d) => d.box.h));
  const byTop = [...items].sort((a, b) => a.box.y - b.box.y);
  const rows: Detected[][] = [];
  for (const d of byTop) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(d.box.y - row[0].box.y) <= tol) row.push(d);
    else rows.push([d]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.box.x - b.box.x));
}
