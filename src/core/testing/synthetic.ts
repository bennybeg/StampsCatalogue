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
