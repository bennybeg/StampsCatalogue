import { AutoProcessor, RawImage, SamModel, Tensor } from '@huggingface/transformers';
import { resizeTo, type Box, type RgbaImage } from './image';
import { bestPointBox, isEmptyStrip, isStampLike, maskBox, pickStamps, type MaskInfo, type SamCand } from './samPick';
import { cachedPrepare } from './samCache';

export const SAM_MODEL = 'Xenova/slimsam-77-uniform';
const SIDE = 1024;
/** Prompt grid spacing, in SAM's 1024-px input space. */
const GRID = 44;
/** Share of the progress bar for the image embedding. */
const EMBED_SHARE = 0.25;
/**
 * Points per decoder run. The decoder upsamples a 32×256×256 map per point (~8 MB), so 64 points
 * needed ~1.7 GB extra; 8 keeps the peak small enough for a phone at about the same speed.
 */
const BATCH = 8;

export type PointMasks = (MaskInfo & { iou: number })[];
export interface Prepared { points(pts: [number, number][]): Promise<PointMasks[]> }
export interface Segmenter { prepare(img: RgbaImage): Promise<Prepared> }

let loading: Promise<Segmenter> | null = null;

/** Load SlimSAM once (q8, ~13 MB). A failed load is not cached, so a later call retries. */
export function createSegmenter(): Promise<Segmenter> {
  loading ??= load().catch((e) => { loading = null; throw e; });
  return loading;
}

async function load(): Promise<Segmenter> {
  const processor = await AutoProcessor.from_pretrained(SAM_MODEL);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (await SamModel.from_pretrained(SAM_MODEL, { dtype: 'q8' })) as any;
  return {
    async prepare(img) {
      const { image: work } = resizeTo(img, SIDE);
      const inputs = await processor(new RawImage(work.data, work.width, work.height, 4).rgb());
      const emb = await model.get_image_embeddings(inputs);
      const [rh, rw] = inputs.reshaped_input_sizes[0] as [number, number];
      const toInput = rw / img.width;           // caller image px → SAM input px
      const maskScale = 4 / toInput;            // low-res mask px → caller image px
      const validW = Math.ceil(rw / 4), validH = Math.ceil(rh / 4);
      return {
        async points(pts) {
          const out: PointMasks[] = [];
          for (let b = 0; b < pts.length; b += BATCH) {
            const chunk = pts.slice(b, b + BATCH);
            const input_points = new Tensor('float32', Float32Array.from(chunk.flatMap(([x, y]) => [x * toInput, y * toInput])), [1, chunk.length, 1, 2]);
            const input_labels = new Tensor('int64', BigInt64Array.from(chunk.map(() => 1n)), [1, chunk.length, 1]);
            const res = await model({ ...emb, input_points, input_labels });
            const masks = res.pred_masks.data as Float32Array;
            const ious = res.iou_scores.data as Float32Array;
            // Free decoder outputs promptly (WASM memory does not shrink on its own).
            for (const t of Object.values(res)) (t as { dispose?(): void }).dispose?.();
            for (let n = 0; n < chunk.length; n++) {
              const per: PointMasks = [];
              for (let m = 0; m < 3; m++) {
                const info = maskBox(masks, (n * 3 + m) * 256 * 256, validW, validH, maskScale);
                if (info) per.push({ ...info, box: roundBox(info.box, img), iou: ious[n * 3 + m] });
              }
              out.push(per);
            }
          }
          return out;
        },
      };
    },
  };
}

function roundBox(b: Box, img: RgbaImage): Box {
  const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
  return { x, y, w: Math.min(img.width - x, Math.round(b.w)), h: Math.min(img.height - y, Math.round(b.h)) };
}

/**
 * Every stamp-like object on a page: prompt a grid of points (skipping points inside stamps already
 * found with high confidence), keep stamp-like masks, drop empty strip, rows and stamp parts.
 */
export async function samFindStamps(img: RgbaImage, onProgress?: (f: number) => void, shouldStop?: () => boolean): Promise<Box[]> {
  const segmenter = await createSegmenter();
  const prepared = await cachedPrepare(img, (i) => segmenter.prepare(i));
  onProgress?.(EMBED_SHARE); // the embedding is the longest single step
  const step = (GRID * Math.max(img.width, img.height)) / SIDE;
  const pts: [number, number][] = [];
  for (let y = step / 2; y < img.height; y += step) for (let x = step / 2; x < img.width; x += step) pts.push([x, y]);

  const cands: SamCand[] = [];
  const sure: Box[] = [];
  for (let b = 0; b < pts.length; b += BATCH) {
    if (shouldStop?.()) throw new Error('superseded');
    const chunk = pts.slice(b, b + BATCH).filter(([x, y]) => !sure.some((s) => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h));
    if (chunk.length) {
      const res = await prepared.points(chunk);
      for (const per of res)
        for (const m of per) {
          if (!isStampLike(m, m.iou, img.width, img.height) || isEmptyStrip(img, m.box)) continue;
          cands.push({ ...m.box, score: m.iou * m.fill });
          if (m.iou > 0.95 && m.fill > 0.9) sure.push(m.box);
        }
    }
    onProgress?.(EMBED_SHARE + (1 - EMBED_SHARE) * Math.min(1, (b + BATCH) / pts.length));
  }
  return pickStamps(cands);
}

/** The stamp under a tapped point, or null. Shares the page search's embedding of the same photo. */
export async function samBoxAt(img: RgbaImage, x: number, y: number): Promise<Box | null> {
  const segmenter = await createSegmenter();
  const prepared = await cachedPrepare(img, (i) => segmenter.prepare(i));
  const [masks] = await prepared.points([[x, y]]);
  return bestPointBox(masks, img.width, img.height);
}
