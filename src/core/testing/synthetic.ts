import type { Box, RgbaImage } from '../image';

export type Rgb = [number, number, number];

export function blankImage(w: number, h: number, rgb: Rgb): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; }
  return { width: w, height: h, data };
}

export function drawRect(img: RgbaImage, box: Box, rgb: Rgb): void {
  const x1 = Math.min(img.width, box.x + box.w), y1 = Math.min(img.height, box.y + box.h);
  for (let y = Math.max(0, box.y); y < y1; y++)
    for (let x = Math.max(0, box.x); x < x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
}

/**
 * A stamp: light paper with a coloured inner design, optionally rotated about its centre.
 * Returns the four rotated corners (for containment checks).
 */
export function drawStamp(img: RgbaImage, box: Box, design: Rgb = [40, 70, 160], angleDeg = 0): [number, number][] {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const a = (angleDeg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const hw = box.w / 2, hh = box.h / 2;
  const inset = Math.round(Math.min(box.w, box.h) * 0.12);
  const reach = Math.ceil(Math.hypot(hw, hh));
  for (let y = Math.floor(cy - reach); y <= cy + reach; y++)
    for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = dx * cos + dy * sin, v = -dx * sin + dy * cos; // stamp-local coords
      if (Math.abs(u) > hw || Math.abs(v) > hh) continue;
      const inner = Math.abs(u) < hw - inset && Math.abs(v) < hh - inset;
      const rgb: Rgb = inner ? design : [236, 230, 214];
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => [cx + u * cos - v * sin, cy + u * sin + v * cos]);
}

export const PAGE_BG: Rgb = [55, 55, 58];

/** A 224×280 synthetic stamp with a recognisable motif. */
export function stampArt(motif: 'planet' | 'rocket'): RgbaImage {
  const w = 224, h = 280;
  const img = blankImage(w, h, [236, 230, 214]);
  drawRect(img, { x: 20, y: 20, w: w - 40, h: h - 40 }, motif === 'planet' ? [20, 25, 70] : [120, 170, 220]);
  for (let y = 20; y < h - 20; y++)
    for (let x = 20; x < w - 20; x++) {
      const i = (y * w + x) * 4;
      let rgb: Rgb | null = null;
      if (motif === 'planet') {
        const d = Math.hypot(x - 112, y - 140);
        if (d < 55) rgb = [210, 120, 50];
        else if (Math.abs(y - 140 - (x - 112) * 0.3) < 4 && d < 95) rgb = [230, 210, 160];
      } else {
        if (Math.abs(x - 112) < 18 && y > 70 && y < 210) rgb = [235, 235, 240];
        else if (y >= 40 && y <= 70 && Math.abs(x - 112) < (y - 40) * 0.6) rgb = [200, 40, 40];
        else if (y > 180 && y < 215 && Math.abs(x - 112) < 40 && Math.abs(x - 112) > 18) rgb = [200, 40, 40];
      }
      if (rgb) { img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; }
    }
  return img;
}

/** Copy of `img` with a dark "postmark" blob over `fraction` of its area, in the lower-left. */
export function withPostmark(img: RgbaImage, fraction: number): RgbaImage {
  const out = { ...img, data: new Uint8ClampedArray(img.data) };
  const r = Math.sqrt((fraction * img.width * img.height) / Math.PI);
  const cx = img.width * 0.3, cy = img.height * 0.7;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (Math.hypot(x - cx, y - cy) < r && (Math.floor(y / 6) % 2 === 0 || Math.hypot(x - cx, y - cy) > r - 5)) {
        const i = (y * img.width + x) * 4;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = 25;
      }
  return out;
}

/** A stamp whose edges have semicircular perforation notches (page colour) every 2×toothPx. */
export function drawPerforatedStamp(img: RgbaImage, box: Box, design: Rgb = [40, 70, 160], toothPx = 8, bg: Rgb = PAGE_BG): void {
  drawStamp(img, box, design);
  const r = toothPx / 2;
  const notch = (cx: number, cy: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if (x >= 0 && y >= 0 && x < img.width && y < img.height && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) {
          const i = (y * img.width + x) * 4;
          img.data[i] = bg[0]; img.data[i + 1] = bg[1]; img.data[i + 2] = bg[2];
        }
  };
  for (let x = box.x + toothPx; x < box.x + box.w - toothPx / 2; x += 2 * toothPx) { notch(x, box.y); notch(x, box.y + box.h); }
  for (let y = box.y + toothPx; y < box.y + box.h - toothPx / 2; y += 2 * toothPx) { notch(box.x, y); notch(box.x + box.w, y); }
}
