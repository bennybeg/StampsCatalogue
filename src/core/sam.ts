import { AutoProcessor, RawImage, SamModel, Tensor } from '@huggingface/transformers';
import { resizeTo, type Box, type RgbaImage } from './image';
import { bestPointBox, isEmptyStrip, isStampLike, maskBox, pickStamps, type MaskInfo, type SamCand } from './samPick';

export const SAM_MODEL = 'Xenova/slimsam-77-uniform';
const SIDE = 1024;
/** Prompt grid spacing, in SAM's 1024-px input space. */
const GRID = 44;
const BATCH = 64;

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
export async function samFindStamps(img: RgbaImage, onProgress?: (f: number) => void): Promise<Box[]> {
  const prepared = await (await createSegmenter()).prepare(img);
  const step = (GRID * Math.max(img.width, img.height)) / SIDE;
  const pts: [number, number][] = [];
  for (let y = step / 2; y < img.height; y += step) for (let x = step / 2; x < img.width; x += step) pts.push([x, y]);

  const cands: SamCand[] = [];
  const sure: Box[] = [];
  for (let b = 0; b < pts.length; b += BATCH) {
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
    onProgress?.(Math.min(1, (b + BATCH) / pts.length));
  }
  return pickStamps(cands);
}

let lastTap: { key: string; prepared: Prepared } | null = null;
const imageKey = (img: RgbaImage) => {
  let h = img.width * 31 + img.height;
  for (let i = 0; i < img.data.length; i += 4099) h = (h * 33 + img.data[i]) | 0;
  return String(h);
};

/** The stamp under a tapped point (SAM's smallest stamp-like mask), or null. Reuses the embedding for repeated taps. */
export async function samBoxAt(img: RgbaImage, x: number, y: number): Promise<Box | null> {
  const key = imageKey(img);
  if (lastTap?.key !== key) lastTap = { key, prepared: await (await createSegmenter()).prepare(img) };
  const [masks] = await lastTap.prepared.points([[x, y]]);
  return bestPointBox(masks, img.width, img.height);
}
