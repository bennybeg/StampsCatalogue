import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage, saveImage } from './load';

describe('loadImage', () => {
  it('applies EXIF orientation so portrait phone photos load upright', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stamps-'));
    const file = join(dir, 'rotated.jpg');
    await sharp(Buffer.alloc(200 * 100 * 3, 128), { raw: { width: 200, height: 100, channels: 3 } })
      .jpeg().withMetadata({ orientation: 6 }).toFile(file);
    const img = await loadImage(file);
    expect(img.width).toBe(100);
    expect(img.height).toBe(200);
    expect(img.data.length).toBe(100 * 200 * 4);
  });

  it('round-trips through saveImage', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stamps-'));
    const file = join(dir, 'out.jpg');
    await saveImage({ width: 30, height: 20, data: new Uint8ClampedArray(30 * 20 * 4).fill(200) }, file);
    const back = await loadImage(file);
    expect([back.width, back.height]).toEqual([30, 20]);
  });
});

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { detectPages } from './detect-pages';

describe('detectPages', () => {
  it('I-6: skips files it cannot decode instead of aborting the run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stamps-'));
    const pages = join(dir, 'pages');
    mkdirSync(pages);
    await sharp({ create: { width: 300, height: 400, channels: 3, background: '#37373a' } }).jpeg().toFile(join(pages, 'a.jpg'));
    writeFileSync(join(pages, 'b.jpg'), 'not an image');
    const entries = await detectPages(pages, join(dir, 'out'));
    expect(entries.every((e) => e.page === 'a')).toBe(true);
    expect(existsSync(join(dir, 'out', 'crops', 'index.json'))).toBe(true);
  });
});
