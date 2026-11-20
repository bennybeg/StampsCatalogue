import { getCv, type CV } from './cv';
import { crop, resizeTo, type Box, type RgbaImage } from './image';

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
  const items = classify(dropContained(boxes));
  for (const item of items) {
    const { image: sub, scale: s } = resizeTo(crop(img, item.box), 800);
    item.inner = (await detectInner(sub, item.kind)).map((b) => toOriginal(b, s, { width: item.box.w, height: item.box.h }));
    if (item.kind === 'single' && item.inner.length >= 2) item.kind = 'block';
  }
  return sortReadingOrder(items);
}

/** Paper colour difference (0–255) above which a pixel counts as part of a stamp design. */
const DESIGN_CONTRAST = 40;
/** A column/row is a gutter candidate when less than this fraction of it is design. */
const GUTTER_MAX_DESIGN = 0.15;
/** On covers, stamps' white margins blend into the envelope; grow found designs by this × shorter side. */
const COVER_MARGIN = 0.1;

/**
 * Stamps inside one item, in coordinates relative to the item.
 * Blocks/singles: split along perforation gutters (≥ 2 boxes for a block, [] for a single).
 * Covers: rectangles that stand out from the envelope, upper-right ones first.
 */
export async function detectInner(item: RgbaImage, kind: ItemKind = 'single'): Promise<Box[]> {
  if (kind === 'cover') {
    const cv = await getCv();
    const found = findRectangles(cv, item, 0.005)
      .filter((b) => b.w * b.h < 0.8 * item.width * item.height)
      .map((b) => {
        const m = Math.round(COVER_MARGIN * Math.min(b.w, b.h));
        const x0 = Math.max(0, b.x - m), y0 = Math.max(0, b.y - m);
        return { x: x0, y: y0, w: Math.min(item.width, b.x + b.w + m) - x0, h: Math.min(item.height, b.y + b.h + m) - y0 };
      });
    const upperRight = (b: Box) => b.x + b.w / 2 >= item.width / 2 && b.y + b.h / 2 <= item.height / 2;
    return found.sort((a, b) => Number(upperRight(b)) - Number(upperRight(a)) || b.w * b.h - a.w * a.h);
  }
  return gridSplit(item);
}

function gridSplit(img: RgbaImage): Box[] {
  const paper = backgroundColour(img);
  const { width: w, height: h } = img;
  const colDesign = new Float32Array(w), rowDesign = new Float32Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.max(Math.abs(img.data[i] - paper[0]), Math.abs(img.data[i + 1] - paper[1]), Math.abs(img.data[i + 2] - paper[2]));
      if (d > DESIGN_CONTRAST) { colDesign[x]++; rowDesign[y]++; }
    }
  for (let x = 0; x < w; x++) colDesign[x] /= h;
  for (let y = 0; y < h; y++) rowDesign[y] /= w;
  const xs = [0, ...gutterCentres(colDesign), w];
  const ys = [0, ...gutterCentres(rowDesign), h];
  if (xs.length === 2 && ys.length === 2) return [];
  const cells: Box[] = [];
  for (let r = 0; r < ys.length - 1; r++)
    for (let c = 0; c < xs.length - 1; c++) cells.push({ x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] });
  return cells;
}

/** Centres of interior low-design runs (gutters), merging runs split by ≤ 3 perforation-hole columns. */
function gutterCentres(profile: Float32Array): number[] {
  const n = profile.length;
  const runs: [number, number][] = [];
  for (let i = 0; i < n; ) {
    if (profile[i] >= GUTTER_MAX_DESIGN) { i++; continue; }
    let j = i;
    while (j < n && profile[j] < GUTTER_MAX_DESIGN) j++;
    const last = runs[runs.length - 1];
    if (last && i - last[1] <= 3) last[1] = j; else runs.push([i, j]);
    i = j;
  }
  const minCell = 0.15 * n, minRun = Math.max(2, 0.01 * n);
  const centres: number[] = [];
  for (const [a, b] of runs) {
    if (a === 0 || b === n || b - a < minRun) continue;
    const c = Math.round((a + b) / 2);
    if (c - (centres[centres.length - 1] ?? 0) >= minCell && n - c >= minCell) centres.push(c);
  }
  return centres;
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

function toOriginal(b: Box, scale: number, img: { width: number; height: number }): Box {
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
