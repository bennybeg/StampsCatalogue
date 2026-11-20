import { detectItems, type Detected } from '../core/detect';
import { snapBoxAt } from '../core/snap';
import { createEmbedder } from '../core/embed';
import { colorSignature } from '../core/color';
import { getCv } from '../core/cv';
import type { Box, RgbaImage } from '../core/image';

export const MODEL_ID = 'Xenova/dinov2-small';

export type Handlers = {
  detect(img: RgbaImage): Promise<Detected[]>;
  snap(img: RgbaImage, x: number, y: number): Promise<Box | null>;
  describe(img: RgbaImage): Promise<{ embedding: Float32Array; color: Float32Array }>;
  warmUp(): Promise<void>;
};

export const handlers: Handlers = {
  detect: (img) => detectItems(img),
  snap: (img, x, y) => snapBoxAt(img, x, y),
  async describe(img) {
    const e = await createEmbedder(MODEL_ID);
    return { embedding: await e.embed(img), color: colorSignature(img) };
  },
  async warmUp() {
    await getCv();
    await createEmbedder(MODEL_ID);
  },
};

export type Request = { id: number; method: keyof Handlers; args: unknown[] };
export type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

type Port = { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

/** Answer requests arriving on `port` with `h`. Images are copied, not transferred, so callers keep theirs. */
export function serve(port: Port, h: Handlers = handlers): void {
  port.onmessage = async (e: MessageEvent) => {
    const { id, method, args } = e.data as Request;
    try {
      const fn = h[method] as (...a: unknown[]) => Promise<unknown>;
      port.postMessage({ id, ok: true, value: await fn(...args) } satisfies Reply);
    } catch (err) {
      port.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Reply);
    }
  };
}
