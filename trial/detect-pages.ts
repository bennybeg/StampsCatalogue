/**
 * Trial: detect items on every album page in test-photos/pages/.
 * Writes annotated pages and crops to trial-output/ (git-ignored).
 *   npx tsx trial/detect-pages.ts
 */
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectItems, type Detected } from '../src/core/detect';
import { crop, withMargin, resizeTo, type Box } from '../src/core/image';
import { loadImage, saveImage } from './load';

export const PAGES_DIR = 'test-photos/pages';
export const OUT = 'trial-output';
const OUT_DEFAULT = OUT;
/** HEIC is not decodable by the bundled sharp; convert iPhone photos to JPEG first. */
export const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?)$/i;

export type CropEntry = {
  id: string; file: string; page: string; index: string;
  kind: 'single' | 'block' | 'sheet' | 'cover' | 'inner'; box: Box; parent?: string;
};

const COLORS: Record<string, string> = { single: '#00e676', block: '#ffab00', sheet: '#40c4ff', cover: '#40c4ff', inner: '#ff4081' };

function overlay(items: Detected[], scale: number, w: number, h: number): string {
  const s = (v: number) => Math.round(v * scale);
  const stroke = Math.max(3, Math.round(Math.max(w, h) / 400));
  const font = Math.max(18, Math.round(Math.max(w, h) / 60));
  const parts = items.flatMap((d, i) => [
    `<rect x="${s(d.box.x)}" y="${s(d.box.y)}" width="${s(d.box.w)}" height="${s(d.box.h)}" fill="none" stroke="${COLORS[d.kind]}" stroke-width="${stroke}"/>`,
    ...d.inner.map((b) => `<rect x="${s(d.box.x + b.x)}" y="${s(d.box.y + b.y)}" width="${s(b.w)}" height="${s(b.h)}" fill="none" stroke="${COLORS.inner}" stroke-width="${Math.max(1, stroke >> 1)}"/>`),
    `<text x="${s(d.box.x) + 4}" y="${s(d.box.y) + font}" font-size="${font}" font-family="sans-serif" font-weight="bold" fill="${COLORS[d.kind]}" stroke="#000" stroke-width="1">${i} ${d.kind}</text>`,
  ]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`;
}

export async function detectPages(pagesDir = PAGES_DIR, OUT = OUT_DEFAULT): Promise<CropEntry[]> {
  if (!existsSync(pagesDir)) throw new Error(`Put album page photos in ${pagesDir}/`);
  const all = readdirSync(pagesDir);
  for (const f of all.filter((f) => /\.(heic|heif)$/i.test(f))) console.warn(`skipping ${f}: convert HEIC to JPEG first`);
  const files = all.filter((f) => IMAGE_EXT.test(f)).sort();
  const entries: CropEntry[] = [];
  mkdirSync(join(OUT, 'crops'), { recursive: true });
  for (const f of files) {
    const name = parse(f).name;
    let img;
    try {
      img = await loadImage(join(pagesDir, f));
    } catch (e) {
      console.warn(`skipping ${f}: ${(e as Error).message}`);
      continue;
    }
    const t0 = performance.now();
    const items = await detectItems(img);
    const ms = Math.round(performance.now() - t0);
    const kinds = items.reduce<Record<string, number>>((a, d) => ((a[d.kind] = (a[d.kind] ?? 0) + 1), a), {});
    console.log(`${f}: ${items.length} items ${JSON.stringify(kinds)} in ${ms} ms (${img.width}x${img.height})`);

    const { image: small, scale } = resizeTo(img, 2000);
    await saveImage(small, join(OUT, 'pages', `${name}.annotated.jpg`), overlay(items, scale, small.width, small.height));

    for (const [i, d] of items.entries()) {
      const id = `${name}#${i}`, file = `crops/${name}__${i}.jpg`;
      await saveImage(crop(img, withMargin(d.box, img)), join(OUT, file));
      entries.push({ id, file, page: name, index: String(i), kind: d.kind, box: d.box });
      for (const [j, b] of d.inner.entries()) {
        if (d.kind === 'single') continue;
        const abs = { x: d.box.x + b.x, y: d.box.y + b.y, w: b.w, h: b.h };
        const innerFile = `crops/${name}__${i}.${j}.jpg`;
        await saveImage(crop(img, withMargin(abs, img)), join(OUT, innerFile));
        entries.push({ id: `${id}.${j}`, file: innerFile, page: name, index: `${i}.${j}`, kind: 'inner', box: abs, parent: id });
      }
    }
  }
  writeFileSync(join(OUT, 'crops', 'index.json'), JSON.stringify(entries, null, 1));
  console.log(`${entries.length} crops from ${files.length} pages → ${OUT}/`);
  return entries;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await detectPages();
