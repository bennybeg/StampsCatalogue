import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { allItems, clearAll, putItems, setMeta, type StampDb } from '../db/db';
import type { Item } from '../db/types';

const VERSION = 1;
type Entry = Omit<Item, 'image' | 'thumb' | 'embedding' | 'color'> & { image: string; thumb: string; embedding: number[]; color: number[] };
type Manifest = { version: number; exportedAt: number; items: Entry[] };

/** Whole collection as one zip: manifest.json + img/<id>.jpg + thumb/<id>.jpg. */
export async function exportZip(db: StampDb): Promise<Blob> {
  const items = await allItems(db);
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const entries: Entry[] = [];
  for (const it of items) {
    const { image, thumb, embedding, color, ...rest } = it;
    const img = `img/${it.id}.jpg`, th = `thumb/${it.id}.jpg`;
    files[img] = [new Uint8Array(await image.arrayBuffer()), { level: 0 }];
    files[th] = [new Uint8Array(await thumb.arrayBuffer()), { level: 0 }];
    entries.push({ ...rest, image: img, thumb: th, embedding: Array.from(embedding), color: Array.from(color) });
  }
  const now = Date.now();
  files['manifest.json'] = strToU8(JSON.stringify({ version: VERSION, exportedAt: now, items: entries } satisfies Manifest));
  const zip = zipSync(files);
  await setMeta(db, { lastBackupAt: now, addedSinceBackup: 0 });
  return new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

/** Replace the collection with a backup. Everything is parsed first; a bad file leaves the db untouched. */
export async function importZip(db: StampDb, file: Blob): Promise<{ items: number }> {
  let items: Item[];
  try {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const m = JSON.parse(strFromU8(files['manifest.json'])) as Manifest;
    if (m.version !== VERSION || !Array.isArray(m.items)) throw new Error('version');
    items = m.items.map((e) => {
      const img = files[e.image], th = files[e.thumb];
      if (!img || !th) throw new Error('missing image');
      return {
        ...e,
        image: new Blob([img as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }),
        thumb: new Blob([th as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }),
        embedding: Float32Array.from(e.embedding),
        color: Float32Array.from(e.color),
      };
    });
  } catch {
    throw new Error('bad backup');
  }
  await clearAll(db);
  await putItems(db, items);
  await setMeta(db, { addedSinceBackup: 0, lastBackupAt: Date.now() });
  return { items: items.length };
}
