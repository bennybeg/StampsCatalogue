import type { RgbaImage } from './image';

/** A cheap fingerprint of a photo (size + sampled pixels): taps and the page search share one embedding. */
export function imageKey(img: RgbaImage): string {
  let h = img.width * 31 + img.height;
  for (let i = 0; i < img.data.length; i += 4099) h = (h * 33 + img.data[i]) | 0;
  return `${img.width}x${img.height}:${h}`;
}

let slot: { key: string; value: Promise<unknown> } | null = null;

/**
 * The SAM embedding of the most recent photo. The promise is cached at once, so taps that arrive
 * while it is still being computed share it instead of starting another (memory-heavy) one.
 */
export function cachedPrepare<T>(img: RgbaImage, prepare: (img: RgbaImage) => Promise<T>): Promise<T> {
  const key = imageKey(img);
  if (slot?.key !== key) {
    const value = prepare(img).catch((e) => { if (slot?.key === key) slot = null; throw e; });
    slot = { key, value };
  }
  return slot.value as Promise<T>;
}
