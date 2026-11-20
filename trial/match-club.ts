/**
 * Trial: match club photos (and synthetic "re-photographed" copies of every owned crop) against
 * the crops produced by detect-pages.ts, for each candidate model. Writes trial-output/report-<model>.html.
 *   npx tsx trial/match-club.ts [--colorWeight 0.3] [--models id1,id2]
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { detectItems } from '../src/core/detect';
import { colorSignature } from '../src/core/color';
import { createEmbedder, MODEL_CANDIDATES } from '../src/core/embed';
import { crop, withMargin, type RgbaImage } from '../src/core/image';
import { rankMatches, type IndexEntry, type Match } from '../src/core/match';
import { withPostmark } from '../src/core/testing/synthetic';
import { loadImage, saveImage } from './load';
import { IMAGE_EXT, OUT, type CropEntry } from './detect-pages';

const CLUB_DIR = 'test-photos/club';
const LABELS = 'test-photos/labels.json';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** A plausible re-photograph: rotated 3°, smaller, darker, blurred, JPEG q60, with a 12% postmark. */
async function rephotograph(img: RgbaImage): Promise<RgbaImage> {
  const marked = withPostmark(img, 0.12);
  const { data, info } = await sharp(Buffer.from(marked.data.buffer, marked.data.byteOffset, marked.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .rotate(3, { background: '#333336' })
    .resize(Math.max(32, Math.round(img.width * 0.6)))
    .modulate({ brightness: 0.85 })
    .blur(1)
    .jpeg({ quality: 60 })
    .toBuffer({ resolveWithObject: true })
    .then(({ data }) => sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

type Query = { label: string; file: string; expected?: string; matches: Match[] };

function modelBytes(modelId: string): number {
  const dir = join('node_modules/@huggingface/transformers/.cache', modelId, 'onnx');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.includes('quantized')).reduce((s, f) => s + statSync(join(dir, f)).size, 0);
}

function html(model: string, summary: string[], sections: { title: string; queries: Query[] }[], byId: Map<string, CropEntry>): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cell = (file: string, caption: string, cls = '') =>
    `<figure class="${cls}"><img src="${encodeURI(file)}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
  const rows = (qs: Query[]) => qs.map((q) => `<div class="row">${cell(q.file, esc(q.label), 'query')}${q.matches.map((m) => {
    const e = byId.get(m.id)!;
    return cell(e.file, `${esc(m.id)}<br>${e.kind} · s ${m.score.toFixed(3)} · v ${m.visual.toFixed(3)} · c ${m.color.toFixed(2)}`, m.id === q.expected ? 'hit' : '');
  }).join('')}</div>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Trial ${esc(model)}</title>
<style>body{font:13px system-ui;margin:16px;background:#fafafa}h1,h2{font-weight:600}.row{display:flex;gap:8px;margin:10px 0;padding-bottom:10px;border-bottom:1px solid #ddd;overflow-x:auto}
figure{margin:0;width:150px;flex:none}img{width:150px;height:150px;object-fit:contain;background:#222}figcaption{font-size:11px;word-break:break-all}
.query img{outline:3px solid #2962ff}.hit img{outline:4px solid #00c853}</style>
<h1>${esc(model)}</h1><ul>${summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
${sections.map((s) => `<h2>${esc(s.title)}</h2>${rows(s.queries)}`).join('\n')}`;
}

export async function matchClub(): Promise<void> {
  const index: CropEntry[] = JSON.parse(readFileSync(join(OUT, 'crops', 'index.json'), 'utf8'));
  const byId = new Map(index.map((e) => [e.id, e]));
  const colorWeight = Number(arg('colorWeight') ?? 0.3);
  const models = arg('models')?.split(',') ?? [...MODEL_CANDIDATES];
  const labels: Record<string, string> = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, 'utf8')) : {};
  // Only stamps are self-tested and expected as answers; whole blocks/sheets are context.
  const stamps = index.filter((e) => e.kind === 'single' || e.kind === 'inner');

  // Club query crops (model-independent).
  const clubFiles = existsSync(CLUB_DIR) ? readdirSync(CLUB_DIR).filter((f) => IMAGE_EXT.test(f)).sort() : [];
  const clubQueries: { label: string; file: string; img: RgbaImage; expected?: string }[] = [];
  for (const f of clubFiles) {
    const img = await loadImage(join(CLUB_DIR, f));
    const items = await detectItems(img);
    const big = items.filter((d) => d.box.w * d.box.h >= 0.03 * img.width * img.height);
    const boxes = big.flatMap((d) => (d.kind === 'single' ? [d.box] : [d.box, ...d.inner.map((b) => ({ ...b, x: b.x + d.box.x, y: b.y + d.box.y }))]));
    const parts = boxes.length ? boxes.map((b) => crop(img, withMargin(b, img))) : [img];
    for (const [i, part] of parts.entries()) {
      const file = `club/${parse(f).name}__${i}.jpg`;
      await saveImage(part, join(OUT, file));
      clubQueries.push({ label: `${f} #${i}`, file, img: part, expected: labels[f] });
    }
  }
  console.log(`${clubQueries.length} club query crops from ${clubFiles.length} photos`);

  // Re-photographed copies of every owned stamp (model-independent).
  mkdirSync(join(OUT, 'rephoto'), { recursive: true });
  const rephotos: { id: string; file: string; img: RgbaImage }[] = [];
  for (const e of stamps) {
    const img = await rephotograph(await loadImage(join(OUT, e.file)));
    const file = `rephoto/${parse(e.file).name}.jpg`;
    await saveImage(img, join(OUT, file));
    rephotos.push({ id: e.id, file, img });
  }

  for (const modelId of models) {
    const embedder = await createEmbedder(modelId);
    const entries: IndexEntry[] = [];
    let t = performance.now();
    for (const e of index) {
      const img = await loadImage(join(OUT, e.file));
      entries.push({ id: e.id, embedding: await embedder.embed(img), color: colorSignature(img) });
    }
    const embedMs = (performance.now() - t) / index.length;
    const q = async (img: RgbaImage) => rankMatches({ embedding: await embedder.embed(img), color: colorSignature(img) }, entries, { k: 5, colorWeight });

    const club: Query[] = [];
    for (const c of clubQueries) club.push({ label: c.label, file: c.file, expected: c.expected, matches: await q(c.img) });

    t = performance.now();
    const self: Query[] = [];
    for (const r of rephotos) self.push({ label: `re-photo of ${r.id}`, file: r.file, expected: r.id, matches: await q(r.img) });
    const searchMs = (performance.now() - t) / Math.max(1, rephotos.length);
    const top1 = self.filter((s) => s.matches[0]?.id === s.expected).length;
    const top5 = self.filter((s) => s.matches.some((m) => m.id === s.expected)).length;
    const misses = self.filter((s) => s.matches[0]?.id !== s.expected);

    const labelled = club.filter((c) => c.expected);
    const summary = [
      `model size (quantized onnx): ${(modelBytes(modelId) / 1e6).toFixed(0)} MB, dim ${embedder.dim}`,
      `avg embed time (Node, this computer): ${embedMs.toFixed(0)} ms per crop; avg embed+search per query: ${searchMs.toFixed(0)} ms`,
      `colour weight: ${colorWeight}`,
      `self-test (re-photographed owned stamps, ${self.length}): top-1 ${top1} (${((100 * top1) / self.length).toFixed(1)}%), top-5 ${top5} (${((100 * top5) / self.length).toFixed(1)}%)`,
      labelled.length
        ? `labelled club photos: top-1 ${labelled.filter((c) => c.matches[0]?.id === c.expected).length}/${labelled.length}, top-5 ${labelled.filter((c) => c.matches.some((m) => m.id === c.expected)).length}/${labelled.length}`
        : 'club photos: no labels.json — judge by eye',
    ];
    summary.forEach((s) => console.log(`[${modelId}] ${s}`));
    const name = modelId.replace(/\//g, '_');
    writeFileSync(join(OUT, `selftest-${name}-cw${colorWeight}.json`), JSON.stringify(self.map((s) => ({ expected: s.expected, matches: s.matches })), null, 1));
    writeFileSync(join(OUT, `report-${name}-cw${colorWeight}.html`), html(modelId, summary, [
      { title: 'Club photos', queries: club },
      { title: `Self-test misses (${misses.length})`, queries: misses },
      { title: 'Self-test, all', queries: self },
    ], byId));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await matchClub();
