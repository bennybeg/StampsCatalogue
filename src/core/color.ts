import type { RgbaImage } from './image';

const H_BINS = 8;
const S_BINS = 3;
const V_BINS = 3;
/** Fraction of width/height (centred) that is sampled; edges and corners carry most postmark ink. */
const CENTRE = 0.7;

/**
 * Weight of dark, colourless pixels (V < 0.25 and S < 0.35). Postmark ink is black, and black
 * says little about which colour variant a stamp is, so it counts for much less.
 */
const INK_WEIGHT = 0.1;

/** L1-normalized 8×3×3 HSV histogram of the central 70% of the image; black ink down-weighted. */
export function colorSignature(img: RgbaImage): Float32Array {
  const hist = new Float32Array(H_BINS * S_BINS * V_BINS);
  const mx = Math.floor((img.width * (1 - CENTRE)) / 2);
  const my = Math.floor((img.height * (1 - CENTRE)) / 2);
  let total = 0;
  for (let y = my; y < img.height - my; y++) {
    for (let x = mx; x < img.width - mx; x++) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i] / 255, g = img.data[i + 1] / 255, b = img.data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0;
      if (d > 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
      }
      const s = max === 0 ? 0 : d / max;
      const hb = Math.min(H_BINS - 1, Math.floor((h / 360) * H_BINS));
      const sb = Math.min(S_BINS - 1, Math.floor(s * S_BINS));
      const wgt = max < 0.25 && s < 0.35 ? INK_WEIGHT : 1;
      const vb = Math.min(V_BINS - 1, Math.floor(max * V_BINS));
      hist[(hb * S_BINS + sb) * V_BINS + vb] += wgt;
      total += wgt;
    }
  }
  if (total > 0) for (let k = 0; k < hist.length; k++) hist[k] /= total;
  return hist;
}

/** Histogram intersection, in [0, 1]. */
export function colorSimilarity(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += Math.min(a[k], b[k]);
  return s;
}
