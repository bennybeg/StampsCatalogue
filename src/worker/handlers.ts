import { detectItems, type Detected } from '../core/detect';
import { snapBoxAt } from '../core/snap';
import { createEmbedder } from '../core/embed';
import { colorSignature } from '../core/color';
import { getCv } from '../core/cv';
import { createSegmenter, samBoxAt, samFindStamps } from '../core/sam';
import { isEmptyStrip, mergeDetections } from '../core/samPick';
import type { Box, RgbaImage } from '../core/image';

export const MODEL_ID = 'Xenova/dinov2-small';

export type Handlers = {
  detect(img: RgbaImage, onProgress?: (fraction: number) => void): Promise<Detected[]>;
  /** Classical detector only: a fraction of a second, for club photos of one or two stamps. */
  quickDetect(img: RgbaImage): Promise<Detected[]>;
  snap(img: RgbaImage, x: number, y: number): Promise<Box | null>;
  describe(img: RgbaImage): Promise<{ embedding: Float32Array; color: Float32Array }>;
  warmUp(): Promise<void>;
};

type Deps = {
  detectItems(img: RgbaImage): Promise<Detected[]>;
  snapBoxAt(img: RgbaImage, x: number, y: number): Promise<Box | null>;
  samFindStamps(img: RgbaImage, onProgress?: (f: number) => void): Promise<Box[]>;
  samBoxAt(img: RgbaImage, x: number, y: number): Promise<Box | null>;
  warmSam(): Promise<unknown>;
  warmCore(): Promise<unknown>;
  describe(img: RgbaImage): Promise<{ embedding: Float32Array; color: Float32Array }>;
};

/** Single boxes on empty dark album strip are noise, whichever method produced them. */
const dropEmptyStrip = (img: RgbaImage, items: Detected[]) => items.filter((it) => it.kind !== 'single' || !isEmptyStrip(img, it.box));

/**
 * Detection = the fast classical detector plus SlimSAM (which separates touching stamps), merged.
 * SlimSAM is an improvement, never a requirement: if it fails, the classical result stands.
 */
export function makeHandlers(d: Deps): Handlers {
  return {
    async detect(img, onProgress) {
      const classical = await d.detectItems(img);
      onProgress?.(0.05);
      try {
        const sam = await d.samFindStamps(img, (f) => onProgress?.(0.05 + 0.95 * f));
        return dropEmptyStrip(img, mergeDetections(classical, sam));
      } catch (e) {
        console.warn('SlimSAM unavailable, classical detection only', e);
        return dropEmptyStrip(img, classical);
      }
    },
    quickDetect: (img) => d.detectItems(img),
    async snap(img, x, y) {
      const b = await d.samBoxAt(img, x, y).catch(() => null);
      return b ?? d.snapBoxAt(img, x, y);
    },
    describe: (img) => d.describe(img),
    async warmUp() {
      await d.warmCore();
      await d.warmSam().catch((e) => console.warn('SlimSAM failed to load; detection will use the classical method', e));
    },
  };
}

export const handlers: Handlers = makeHandlers({
  detectItems: (img) => detectItems(img),
  snapBoxAt: (img, x, y) => snapBoxAt(img, x, y),
  samFindStamps: (img, p) => samFindStamps(img, p),
  samBoxAt: (img, x, y) => samBoxAt(img, x, y),
  warmSam: () => createSegmenter(),
  warmCore: async () => { await getCv(); await createEmbedder(MODEL_ID); },
  async describe(img) {
    const e = await createEmbedder(MODEL_ID);
    return { embedding: await e.embed(img), color: colorSignature(img) };
  },
});

export type Request = { id: number; method: keyof Handlers; args: unknown[]; progress?: boolean };
export type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string } | { id: number; progress: number };

type Port = { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

/**
 * Answer requests arriving on `port` with `h`. Images are copied, not transferred, so callers keep theirs.
 * A request with `progress: true` gets a progress callback appended to its arguments.
 */
export function serve(port: Port, h: Handlers = handlers): void {
  port.onmessage = async (e: MessageEvent) => {
    const { id, method, args, progress } = e.data as Request;
    try {
      const fn = h[method] as (...a: unknown[]) => Promise<unknown>;
      const all = progress ? [...args, (f: number) => port.postMessage({ id, progress: f } satisfies Reply)] : args;
      port.postMessage({ id, ok: true, value: await fn(...all) } satisfies Reply);
    } catch (err) {
      port.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Reply);
    }
  };
}
