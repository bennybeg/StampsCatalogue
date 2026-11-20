/** RGBA, row-major, 4 bytes per pixel. Browser-compatible (no Node imports). */
export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };

/** Integer pixel rectangle in the coordinates of the image it refers to. */
export type Box = { x: number; y: number; w: number; h: number };

export function crop(img: RgbaImage, box: Box): RgbaImage {
  const { x, y, w, h } = box;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const start = ((y + row) * img.width + x) * 4;
    data.set(img.data.subarray(start, start + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}

/** Expand a box by `ratio * max(w, h)` on every side, clamped to the image. */
export function withMargin(box: Box, img: RgbaImage, ratio = 0.04): Box {
  const m = Math.round(ratio * Math.max(box.w, box.h));
  const x0 = Math.max(0, box.x - m);
  const y0 = Math.max(0, box.y - m);
  const x1 = Math.min(img.width, box.x + box.w + m);
  const y1 = Math.min(img.height, box.y + box.h + m);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Downscale (area averaging) so the longer side is at most `maxSide`. */
export function resizeTo(img: RgbaImage, maxSide: number): { image: RgbaImage; scale: number } {
  const longer = Math.max(img.width, img.height);
  if (longer <= maxSide) return { image: img, scale: 1 };
  const scale = maxSide / longer;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  return { image: resizeExact(img, w, h), scale };
}

/** Resize to exactly w×h. Area-averages when shrinking, nearest when growing. */
export function resizeExact(img: RgbaImage, w: number, h: number): RgbaImage {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; a += img.data[i + 3];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}
