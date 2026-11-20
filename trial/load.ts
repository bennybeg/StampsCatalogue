import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RgbaImage } from '../src/core/image';

/** Load any image sharp can read, upright (EXIF orientation applied), as RGBA. */
export async function loadImage(path: string): Promise<RgbaImage> {
  const { data, info } = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

function toSharp(img: RgbaImage) {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.width, height: img.height, channels: 4 } });
}

/** Save as JPEG (quality 85), creating parent directories. */
export async function saveImage(img: RgbaImage, path: string, svgOverlay?: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  let s = toSharp(img);
  if (svgOverlay) s = sharp(await s.png().toBuffer()).composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }]);
  await s.flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toFile(path);
}
