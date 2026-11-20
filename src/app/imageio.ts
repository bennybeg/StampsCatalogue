import type { RgbaImage } from '../core/image';

type AnyCanvas = { width: number; height: number; getContext(t: '2d'): unknown };

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as unknown as AnyCanvas;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c as unknown as AnyCanvas;
}

type Ctx2d = {
  drawImage(src: unknown, x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray };
  putImageData(d: ImageData, x: number, y: number): void;
};

/**
 * Decode a photo upright (EXIF applied) and downscale so its longer side is at most `maxSide`.
 * Keeps a 50 MP camera photo from exhausting phone memory.
 */
export async function fileToRgba(file: Blob, maxSide = 3000): Promise<RgbaImage> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const ctx = makeCanvas(w, h).getContext('2d') as Ctx2d;
  ctx.drawImage(bmp, 0, 0, w, h);
  (bmp as { close?(): void }).close?.();
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

/** Encode as JPEG, downscaled so the longer side is at most `maxSide`. */
export async function rgbaToJpeg(img: RgbaImage, maxSide: number, quality = 0.85): Promise<Blob> {
  const full = makeCanvas(img.width, img.height);
  (full.getContext('2d') as Ctx2d).putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const out = makeCanvas(w, h);
  (out.getContext('2d') as Ctx2d).drawImage(full, 0, 0, w, h);
  if ('convertToBlob' in out) return (out as unknown as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) =>
    (out as unknown as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality));
}
