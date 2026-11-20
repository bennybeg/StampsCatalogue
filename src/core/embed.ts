import { AutoModel, AutoProcessor, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers';
import type { RgbaImage } from './image';

/** Candidate image-embedding models compared in the trial (ONNX weights on huggingface.co). */
export const MODEL_CANDIDATES = ['Xenova/dinov2-small', 'Xenova/clip-vit-base-patch32'] as const;

export interface Embedder {
  modelId: string;
  dim: number;
  embed(img: RgbaImage): Promise<Float32Array>;
}

const cache = new Map<string, Promise<Embedder>>();

/** Load a model once (quantized int8 by default) and return an L2-normalized image embedder. */
export function createEmbedder(modelId: string, opts: { quantized?: boolean } = {}): Promise<Embedder> {
  const quantized = opts.quantized ?? true;
  const key = `${modelId}|${quantized}`;
  if (!cache.has(key)) {
    // A failed load (e.g. offline on first run) must not stay cached, so a retry can succeed.
    const p = load(modelId, quantized).catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return cache.get(key)!;
}

async function load(modelId: string, quantized: boolean): Promise<Embedder> {
  const dtype = quantized ? 'q8' : 'fp32';
  const isClip = modelId.toLowerCase().includes('clip');
  const processor = await AutoProcessor.from_pretrained(modelId);
  const model = isClip
    ? await CLIPVisionModelWithProjection.from_pretrained(modelId, { dtype })
    : await AutoModel.from_pretrained(modelId, { dtype });

  const run = async (img: RgbaImage): Promise<Float32Array> => {
    const raw = new RawImage(img.data, img.width, img.height, 4).rgb();
    const { pixel_values } = await processor(raw);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any = await model({ pixel_values });
    let v: Float32Array;
    if (out.image_embeds) v = Float32Array.from(out.image_embeds.data as Float32Array);
    else if (out.pooler_output) v = Float32Array.from(out.pooler_output.data as Float32Array);
    else {
      const [, , d] = out.last_hidden_state.dims as number[];
      v = Float32Array.from((out.last_hidden_state.data as Float32Array).subarray(0, d)); // CLS token
    }
    const n = Math.hypot(...v) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  };

  const probe = await run({ width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4).fill(128) });
  return { modelId, dim: probe.length, embed: run };
}
