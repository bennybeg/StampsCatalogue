import type { RgbaImage } from './image';

/** A pixel is stamp paper when it differs from the crop's border colour by more than this. */
const PAPER_CONTRAST = 40;
/** Moving-average window for removing slow trends (tilt, curl) from the edge profile. */
const TREND_WINDOW = 15;
/** Scores at or above this mean perforated edges. Calibrated on synthetic stamps (see edges.test.ts). */
export const PERF_THRESHOLD = 1.0;

function frameColour(img: RgbaImage): [number, number, number] {
  const ch: number[][] = [[], [], []];
  const push = (x: number, y: number) => { const i = (y * img.width + x) * 4; for (let c = 0; c < 3; c++) ch[c].push(img.data[i + c]); };
  for (let x = 0; x < img.width; x++) { push(x, 0); push(x, 1); push(x, img.height - 1); push(x, img.height - 2); }
  for (let y = 0; y < img.height; y++) { push(0, y); push(1, y); push(img.width - 1, y); push(img.width - 2, y); }
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]) as [number, number, number];
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1] ?? 0; };

/**
 * How "toothed" a stamp's outline is, from a crop that includes a margin of page around it.
 * For each side: the depth from the crop border to the first paper pixel, along the side; remove
 * the slow trend; take a robust spread (MAD, so a postmark crossing one stretch of edge doesn't
 * count); average the sides; scale by side length × 1000.
 */
export function perforationScore(img: RgbaImage): number {
  const bg = frameColour(img);
  const paper = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return Math.max(Math.abs(img.data[i] - bg[0]), Math.abs(img.data[i + 1] - bg[1]), Math.abs(img.data[i + 2] - bg[2])) > PAPER_CONTRAST;
  };
  const sides: { len: number; depth(i: number): number }[] = [];
  const maxW = Math.floor(img.width / 4), maxH = Math.floor(img.height / 4);
  const scan = (limit: number, at: (d: number) => boolean) => { for (let d = 0; d < limit; d++) if (at(d)) return d; return limit; };
  sides.push({ len: img.width, depth: (x) => scan(maxH, (d) => paper(x, d)) });
  sides.push({ len: img.width, depth: (x) => scan(maxH, (d) => paper(x, img.height - 1 - d)) });
  sides.push({ len: img.height, depth: (y) => scan(maxW, (d) => paper(d, y)) });
  sides.push({ len: img.height, depth: (y) => scan(maxW, (d) => paper(img.width - 1 - d, y)) });

  const scores = sides.map(({ len, depth }) => {
    const from = Math.floor(len * 0.12), to = Math.ceil(len * 0.88);
    const prof: number[] = [];
    for (let i = from; i < to; i++) prof.push(depth(i));
    const half = TREND_WINDOW >> 1;
    const hp = prof.map((v, i) => {
      const a = Math.max(0, i - half), b = Math.min(prof.length, i + half + 1);
      let s = 0; for (let j = a; j < b; j++) s += prof[j];
      return v - s / (b - a);
    });
    const m = median(hp);
    const mad = 1.4826 * median(hp.map((v) => Math.abs(v - m)));
    return (mad / len) * 1000;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** True when exactly one of the two stamps has perforated edges. */
export function edgesDiffer(a: RgbaImage, b: RgbaImage): boolean {
  return (perforationScore(a) >= PERF_THRESHOLD) !== (perforationScore(b) >= PERF_THRESHOLD);
}
