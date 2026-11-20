import { getCv, type CV } from './cv';
import { crop, resizeTo, type Box, type RgbaImage } from './image';

/**
 * 'sheet' = a large item: souvenir sheet or cover (envelope). They look alike to the detector;
 * the user can relabel a sheet as 'cover'.
 */
export type ItemKind = 'single' | 'block' | 'sheet' | 'cover';
/** `unresolved`: an irregular blob (e.g. a chain of touching stamps) the detector could not cut; the user must split it. */
export type Detected = { box: Box; kind: ItemKind; inner: Box[]; unresolved?: boolean };
type Found = Box & { unresolved?: boolean };

/** Smallest item, as a fraction of the page area (at working resolution). */
const MIN_AREA_FRACTION = 0.002;
/** A piece must fill this much of its bounding box (a stamp rotated ~10° fills ~0.75). */
const MIN_FILL = 0.6;
/** A blob filling at least this much of its box is treated as one rectangle and not cut further. */
const RECT_FILL = 0.92;
/** Blobs filling less than this of their box are too irregular to cut into stamps. */
const SPLIT_MIN_FILL = 0.6;
/** Pieces longer than this × their width are page edges or strip glare, not items. */
const MAX_ASPECT = 6;
/** Pixels must differ from the page background by at least this much (0–255). */
const MIN_CONTRAST = 25;
/** A box this much inside another box is a duplicate and is dropped. */
const CONTAINED = 0.9;
/** Items at least this × the median item area (and not too elongated) are sheets/covers. */
const SHEET_AREA = 5;
/** ...or at least this fraction of the photo (a cover photographed alone or with one stamp). */
const SHEET_PAGE_FRACTION = 0.1;
/** A blob covering more than this fraction of the photo is the album page itself (table visible around it). */
const PAGE_FRACTION = 0.5;
/** An irregular blob filling at least this much of its convex hull is one non-rectangular stamp (diamond, triangle). */
const HULL_FILL = 0.9;
/** Default working resolution: high enough that a ~10 px gap in a 50 MP photo survives as ≥ 3 px. */
const WORKING_MAX_SIDE = 2400;

/**
 * Find stamps, blocks and sheets/covers on a photo of an album page.
 * Boxes are in the coordinates of `img`, sorted top-to-bottom then left-to-right.
 */
export async function detectItems(img: RgbaImage, opts: { workingMaxSide?: number } = {}): Promise<Detected[]> {
  const cv = await getCv();
  const { image: work, scale } = resizeTo(img, opts.workingMaxSide ?? WORKING_MAX_SIDE);
  let found = findRectangles(cv, work, MIN_AREA_FRACTION);
  // The table is visible around the page: the page itself became one blob. Look again inside it.
  const huge = (b: Found) => b.w * b.h > PAGE_FRACTION * work.width * work.height;
  // An unresolved blob that big is glare/strips chaining half the page: useless to the user, drop it.
  found = found.filter((b) => !(b.unresolved && huge(b)));
  const page = found.find(huge);
  if (page) {
    const inside = findRectangles(cv, crop(work, page), MIN_AREA_FRACTION * (work.width * work.height) / (page.w * page.h));
    if (inside.length) found = [...found.filter((b) => b !== page), ...inside.map((b) => ({ ...b, x: b.x + page.x, y: b.y + page.y }))];
  }
  const boxes = found.map((b) => ({ ...toOriginal(b, scale, img), unresolved: b.unresolved }));
  const items = classify(dropContained(boxes), img.width * img.height);
  for (const item of items) {
    if (item.unresolved) continue;
    const { image: sub, scale: s } = resizeTo(crop(img, item.box), 800);
    item.inner = (await detectInner(sub, item.kind)).map((b) => toOriginal(b, s, { width: item.box.w, height: item.box.h }));
    if (item.kind === 'single' && item.inner.length >= 2) item.kind = 'block';
  }
  return sortReadingOrder(items);
}

/** Axis-aligned boxes of rectangular regions that stand out from the background. */
export function findRectangles(cv: CV, img: RgbaImage, minAreaFraction: number): Found[] {
  const bg = backgroundColour(img);
  const diff = new cv.Mat(img.height, img.width, cv.CV_8UC1);
  const d = diff.data as Uint8Array;
  for (let p = 0, i = 0; p < d.length; p++, i += 4) {
    d[p] = Math.max(Math.abs(img.data[i] - bg[0]), Math.abs(img.data[i + 1] - bg[1]), Math.abs(img.data[i + 2] - bg[2]));
  }
  cv.GaussianBlur(diff, diff, new cv.Size(3, 3), 0); // 3×3: a 5×5 blur fills 2–3 px gaps between stamps
  const mask = new cv.Mat();
  const otsu = cv.threshold(diff, mask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  if (otsu < MIN_CONTRAST) cv.threshold(diff, mask, MIN_CONTRAST, 255, cv.THRESH_BINARY);
  diff.delete();

  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
  kernel.delete();

  // Fill holes (dark stamp designs inside light paper margins) by redrawing external contours filled.
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  mask.setTo(new cv.Scalar(0));
  cv.drawContours(mask, contours, -1, new cv.Scalar(255), cv.FILLED);
  contours.delete(); hierarchy.delete();

  const labels = new cv.Mat(), stats = new cv.Mat(), cents = new cv.Mat();
  const n: number = cv.connectedComponentsWithStats(mask, labels, stats, cents, 8, cv.CV_32S);
  const lab = labels.data32S as Int32Array;
  const st = stats.data32S as Int32Array;
  const minArea = minAreaFraction * img.width * img.height;
  const out: Found[] = [];
  for (let k = 1; k < n; k++) {
    const box = { x: st[k * 5], y: st[k * 5 + 1], w: st[k * 5 + 2], h: st[k * 5 + 3] };
    if (box.w * box.h < minArea) continue;
    const blob = blobMask(lab, img.width, box, k);
    for (const piece of splitBlob(blob, box, 0)) {
      const aspect = Math.max(piece.w, piece.h) / Math.min(piece.w, piece.h);
      if (piece.w * piece.h >= minArea && aspect <= MAX_ASPECT) out.push(piece);
    }
  }
  mask.delete(); labels.delete(); stats.delete(); cents.delete();
  return out;
}

/** Binary mask (1 byte per pixel) of component `k` inside `box`. */
function blobMask(lab: Int32Array, stride: number, box: Box, k: number): Uint8Array {
  const m = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) {
    const row = (box.y + y) * stride + box.x;
    for (let x = 0; x < box.w; x++) if (lab[row + x] === k) m[y * box.w + x] = 1;
  }
  return m;
}

/**
 * Cut a blob of touching/overlapping items into rectangles. Where neighbouring items sit at
 * different heights (or widths), the blob's outline steps; cut at the biggest step and recurse.
 */
function splitBlob(m: Uint8Array, box: Box, depth: number): Found[] {
  const tight = tighten(m, box);
  if (!tight) return [];
  ({ m, box } = tight);
  let count = 0;
  for (let i = 0; i < m.length; i++) count += m[i];
  const fill = count / (box.w * box.h);
  if (fill >= RECT_FILL || depth >= 8) return [box];
  if (fill < SPLIT_MIN_FILL) {
    // A diamond/triangle stamp fills its convex hull; a chain of touching stamps doesn't and is handed
    // to the user. Leftovers of a cut (depth > 0) are slivers of a neighbour and are dropped.
    if (count / hullArea(m, box.w, box.h) >= HULL_FILL) return [box];
    return depth === 0 ? [{ ...box, unresolved: true }] : [];
  }

  const cut = biggestStep(m, box.w, box.h, 'x') ?? biggestStep(m, box.w, box.h, 'y');
  if (!cut) return [box];
  const [a, b] = cut.axis === 'x' ? splitAt(m, box, cut.at, 'x') : splitAt(m, box, cut.at, 'y');
  return [...splitBlob(a.m, a.box, depth + 1), ...splitBlob(b.m, b.box, depth + 1)];
}

/** Area of the convex hull of a mask's set pixels (monotone chain over each row's end pixels). */
function hullArea(m: Uint8Array, w: number, h: number): number {
  const pts: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (m[y * w + x]) { if (l < 0) l = x; r = x; }
    if (l >= 0) pts.push([l, y], [l, y + 1], [r + 1, y], [r + 1, y + 1]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const hull: [number, number][] = [];
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  const poly = [...half(pts), ...half([...pts].reverse())];
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.max(1, Math.abs(a) / 2);
}

/** Shrink a mask to the bounding box of its set pixels. */
function tighten(m: Uint8Array, box: Box): { m: Uint8Array; box: Box } | null {
  let x0 = box.w, y0 = box.h, x1 = -1, y1 = -1;
  for (let y = 0; y < box.h; y++)
    for (let x = 0; x < box.w; x++)
      if (m[y * box.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w === box.w && h === box.h) return { m, box };
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) out.set(m.subarray((y0 + y) * box.w + x0, (y0 + y) * box.w + x0 + w), y * w);
  return { m: out, box: { x: box.x + x0, y: box.y + y0, w, h } };
}

function splitAt(m: Uint8Array, box: Box, at: number, axis: 'x' | 'y'): { m: Uint8Array; box: Box }[] {
  const part = (from: number, to: number) => {
    const w = axis === 'x' ? to - from : box.w, h = axis === 'y' ? to - from : box.h;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = axis === 'x' ? x + from : x, sy = axis === 'y' ? y + from : y;
        out[y * w + x] = m[sy * box.w + sx];
      }
    return { m: out, box: axis === 'x' ? { ...box, x: box.x + from, w } : { ...box, y: box.y + from, h } };
  };
  const len = axis === 'x' ? box.w : box.h;
  return [part(0, at), part(at, len)];
}

/**
 * Position along `axis` where the blob's outline (first/last set pixel across the other axis)
 * jumps the most, if the jump exceeds 6% of the cross extent. Compares 6-wide windows on each
 * side (dropping each window's extremes, so perforation teeth don't count).
 */
function biggestStep(m: Uint8Array, w: number, h: number, axis: 'x' | 'y'): { axis: 'x' | 'y'; at: number } | null {
  const len = axis === 'x' ? w : h, cross = axis === 'x' ? h : w;
  const first = new Float32Array(len), last = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let f = -1, l = -1;
    for (let j = 0; j < cross; j++) {
      const v = axis === 'x' ? m[j * w + i] : m[i * w + j];
      if (v) { if (f < 0) f = j; l = j; }
    }
    first[i] = f < 0 ? cross : f;
    last[i] = l < 0 ? 0 : l;
  }
  const W = 6, minPart = Math.max(8, Math.round(0.12 * len));
  // A step is flat on both sides (spread well under the jump); a tilted stamp's steep side is not.
  const stats = (arr: Float32Array, a: number, b: number) => {
    const s = Array.from(arr.subarray(a, b)).sort((p, q) => p - q);
    return { med: s[s.length >> 1], spread: s[s.length - 2] - s[1] };
  };
  const step = (arr: Float32Array, i: number) => {
    const l = stats(arr, i - W, i), r = stats(arr, i, i + W);
    const jump = Math.abs(l.med - r.med);
    return Math.max(l.spread, r.spread) <= jump / 4 ? jump : 0;
  };
  let best = 0, at = -1;
  for (let i = minPart; i <= len - minPart; i++) {
    const jump = Math.max(step(first, i), step(last, i));
    if (jump > best) { best = jump; at = i; }
  }
  return best > Math.max(6, 0.06 * cross) ? { axis, at } : null;
}

/**
 * The album page colour: the most common coarse colour (32 levels per channel) in a frame 4% wide
 * around the photo, averaged over the pixels in that bin. The mode resists stamps cut by the frame.
 */
function backgroundColour(img: RgbaImage): [number, number, number] {
  const t = Math.max(2, Math.round(Math.min(img.width, img.height) * 0.04));
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 400_000)));
  const key = (i: number) => ((img.data[i] >> 5) << 6) | ((img.data[i + 1] >> 5) << 3) | (img.data[i + 2] >> 5);
  const inFrame = (x: number, y: number) => x < t || y < t || x >= img.width - t || y >= img.height - t;
  const counts = new Map<number, number>();
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step)
      if (inFrame(x, y)) { const k = key((y * img.width + x) * 4); counts.set(k, (counts.get(k) ?? 0) + 1); }
  let mode = 0, top = -1;
  for (const [k, c] of counts) if (c > top) { top = c; mode = k; }
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      if (!inFrame(x, y) || key(i) !== mode) continue;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
  return [r / n, g / n, b / n];
}

/** Paper colour difference (0–255) above which a pixel counts as part of a stamp design. */
const DESIGN_CONTRAST = 40;
/** A column/row is a gutter candidate when less than this fraction of it is design. */
const GUTTER_MAX_DESIGN = 0.15;
/** Stamps' white margins blend into a white envelope/sheet; grow found designs by this × shorter side. */
const SHEET_MARGIN = 0.1;

/**
 * Stamps inside one item, in coordinates relative to the item.
 * Blocks/singles: split along perforation gutters (≥ 2 boxes for a block, [] for a single).
 * Sheets/covers: rectangles that stand out from the sheet/envelope, upper-right ones first.
 */
export async function detectInner(item: RgbaImage, kind: ItemKind = 'single'): Promise<Box[]> {
  if (kind === 'sheet' || kind === 'cover') {
    const cv = await getCv();
    const found = dropContained(findRectangles(cv, item, 0.005))
      .filter((b) => b.w * b.h < 0.8 * item.width * item.height)
      .map((b) => {
        const m = Math.round(SHEET_MARGIN * Math.min(b.w, b.h));
        const x0 = Math.max(0, b.x - m), y0 = Math.max(0, b.y - m);
        return { x: x0, y: y0, w: Math.min(item.width, b.x + b.w + m) - x0, h: Math.min(item.height, b.y + b.h + m) - y0 };
      });
    const upperRight = (b: Box) => b.x + b.w / 2 >= item.width / 2 && b.y + b.h / 2 <= item.height / 2;
    return found.sort((a, b) => Number(upperRight(b)) - Number(upperRight(a)) || b.w * b.h - a.w * a.h);
  }
  return gridSplit(item);
}

function gridSplit(img: RgbaImage): Box[] {
  const paper = frameColour(img);
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

/** Median colour of a thin frame around the image — a stamp's paper margin. */
function frameColour(img: RgbaImage): [number, number, number] {
  const t = Math.max(2, Math.round(Math.min(img.width, img.height) * 0.02));
  const ch: number[][] = [[], [], []];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (x < t || y < t || x >= img.width - t || y >= img.height - t) {
        const i = (y * img.width + x) * 4;
        ch[0].push(img.data[i]); ch[1].push(img.data[i + 1]); ch[2].push(img.data[i + 2]);
      }
  return ch.map((v) => { v.sort((a, b) => a - b); return v[v.length >> 1]; }) as [number, number, number];
}

/**
 * Centres of interior gutters between joined stamps: low-design runs that contain a line of
 * perforation holes (≤ 3 columns of partial "design" splitting the run). A clean light band
 * inside one stamp's design has no holes and is not a gutter.
 */
function gutterCentres(profile: Float32Array): number[] {
  const n = profile.length;
  const runs: [number, number, boolean][] = [];
  for (let i = 0; i < n; ) {
    if (profile[i] >= GUTTER_MAX_DESIGN) { i++; continue; }
    let j = i;
    while (j < n && profile[j] < GUTTER_MAX_DESIGN) j++;
    const last = runs[runs.length - 1];
    if (last && i - last[1] <= 3) { last[1] = j; last[2] = true; } else runs.push([i, j, false]);
    i = j;
  }
  const minCell = 0.15 * n, minRun = Math.max(2, 0.01 * n);
  const centres: number[] = [];
  for (const [a, b, perforated] of runs) {
    if (!perforated || a === 0 || b === n || b - a < minRun) continue;
    const c = Math.round((a + b) / 2);
    if (c - (centres[centres.length - 1] ?? 0) >= minCell && n - c >= minCell) centres.push(c);
  }
  return centres;
}

function toOriginal(b: Box, scale: number, img: { width: number; height: number }): Box {
  const x0 = Math.max(0, Math.floor(b.x / scale));
  const y0 = Math.max(0, Math.floor(b.y / scale));
  const x1 = Math.min(img.width, Math.ceil((b.x + b.w) / scale));
  const y1 = Math.min(img.height, Math.ceil((b.y + b.h) / scale));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Drop boxes ≥ 90% inside a bigger box. An unresolved blob's box never swallows other items. */
function dropContained<T extends Found>(boxes: T[]): T[] {
  return boxes.filter((a, i) =>
    !boxes.some((b, j) => {
      if (i === j || b.unresolved || b.w * b.h < a.w * a.h) return false;
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

function classify(found: Found[], imageArea: number): Detected[] {
  if (found.length === 0) return [];
  const ref = median(found.filter((b) => !b.unresolved).map((b) => b.w * b.h));
  return found.map(({ unresolved, ...box }) => {
    const area = box.w * box.h, aspect = Math.max(box.w, box.h) / Math.min(box.w, box.h);
    const large = area >= SHEET_AREA * ref || area >= SHEET_PAGE_FRACTION * imageArea;
    const kind: ItemKind = !unresolved && large && aspect <= 2.6 ? 'sheet' : 'single';
    return unresolved ? { box, kind, inner: [], unresolved: true } : { box, kind, inner: [] };
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
