import { inflateSync, strFromU8, strToU8 } from 'fflate';
import { allItems, clearAll, putItems, setMeta, type StampDb } from '../db/db';
import type { Item } from '../db/types';

/**
 * Backups are plain "stored" (uncompressed) zips: the pictures are already JPEG, so compression
 * gains nothing. Writing them by hand lets the zip reference each picture Blob directly (no copy of
 * the whole collection in memory), and lets restore slice entries out of the file one at a time.
 * A 2500-stamp collection is ~150–250 MB, which would not fit in a phone tab three times over.
 */

const VERSION = 1;
type Entry = Omit<Item, 'image' | 'thumb' | 'embedding' | 'color'> & { image: string; thumb: string; embedding: number[]; color: number[] };
type Manifest = { version: number; exportedAt: number; items: Entry[] };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const UTF8_FLAG = 0x0800;
const DOS_DATE_1980 = 0x21;

function localHeader(name: Uint8Array, crc: number, size: number): Uint8Array {
  const h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
  v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, UTF8_FLAG, true); v.setUint16(8, 0, true);
  v.setUint16(10, 0, true); v.setUint16(12, DOS_DATE_1980, true); v.setUint32(14, crc, true);
  v.setUint32(18, size, true); v.setUint32(22, size, true); v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
  h.set(name, 30);
  return h;
}

function centralHeader(name: Uint8Array, crc: number, size: number, offset: number): Uint8Array {
  const h = new Uint8Array(46 + name.length), v = new DataView(h.buffer);
  v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, UTF8_FLAG, true);
  v.setUint16(10, 0, true); v.setUint16(12, 0, true); v.setUint16(14, DOS_DATE_1980, true); v.setUint32(16, crc, true);
  v.setUint32(20, size, true); v.setUint32(24, size, true); v.setUint16(28, name.length, true);
  v.setUint32(42, offset, true);
  h.set(name, 46);
  return h;
}

/** Whole collection as one stored zip: manifest.json + img/<id>.jpg + thumb/<id>.jpg. */
export async function exportZip(db: StampDb): Promise<Blob> {
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const add = async (path: string, data: Blob) => {
    const name = strToU8(path);
    const crc = crc32(new Uint8Array(await data.arrayBuffer())); // one picture in memory at a time
    const lh = localHeader(name, crc, data.size);
    parts.push(lh as Uint8Array<ArrayBuffer>, data);
    central.push(centralHeader(name, crc, data.size, offset));
    offset += lh.length + data.size;
  };

  const entries: Entry[] = [];
  for (const it of await allItems(db)) {
    const { image, thumb, embedding, color, ...rest } = it;
    const img = `img/${it.id}.jpg`, th = `thumb/${it.id}.jpg`;
    await add(img, image);
    await add(th, thumb);
    entries.push({ ...rest, image: img, thumb: th, embedding: Array.from(embedding), color: Array.from(color) });
  }
  const now = Date.now();
  await add('manifest.json', new Blob([strToU8(JSON.stringify({ version: VERSION, exportedAt: now, items: entries } satisfies Manifest)) as Uint8Array<ArrayBuffer>]));

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, central.length, true); v.setUint16(10, central.length, true);
  v.setUint32(12, cdSize, true); v.setUint32(16, offset, true);
  await setMeta(db, { lastBackupAt: now, addedSinceBackup: 0 });
  return new Blob([...parts, ...(central as Uint8Array<ArrayBuffer>[]), end], { type: 'application/zip' });
}

const bytes = async (file: Blob, from: number, to: number) => new Uint8Array(await file.slice(from, to).arrayBuffer());

/** Index of a zip's entries by name: where each entry's data lies in the file, and how it is stored. */
async function readDirectory(file: Blob): Promise<Map<string, { start: number; size: number; method: number }>> {
  const tailFrom = Math.max(0, file.size - 22 - 0xffff);
  const tail = await bytes(file, tailFrom, file.size);
  const tv = new DataView(tail.buffer);
  let e = tail.length - 22;
  while (e >= 0 && tv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('no zip directory');
  const count = tv.getUint16(e + 10, true), cdSize = tv.getUint32(e + 12, true), cdOffset = tv.getUint32(e + 16, true);
  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const cv = new DataView(cd.buffer);
  const out = new Map<string, { start: number; size: number; method: number }>();
  for (let k = 0, p = 0; k < count; k++) {
    if (cv.getUint32(p, true) !== 0x02014b50) throw new Error('bad directory');
    const method = cv.getUint16(p + 10, true), size = cv.getUint32(p + 20, true);
    const nameLen = cv.getUint16(p + 28, true), extraLen = cv.getUint16(p + 30, true), commentLen = cv.getUint16(p + 32, true);
    const local = cv.getUint32(p + 42, true);
    const name = strFromU8(cd.subarray(p + 46, p + 46 + nameLen));
    const lh = new DataView((await bytes(file, local, local + 30)).buffer);
    const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    out.set(name, { start, size, method });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Replace the collection with a backup. Everything is parsed first; a bad file leaves the db untouched. */
export async function importZip(db: StampDb, file: Blob): Promise<{ items: number }> {
  let items: Item[];
  try {
    const dir = await readDirectory(file);
    const entry = (name: string) => { const d = dir.get(name); if (!d) throw new Error(`missing ${name}`); return d; };
    const m0 = entry('manifest.json');
    let raw = await bytes(file, m0.start, m0.start + m0.size);
    if (m0.method === 8) raw = inflateSync(raw);
    const m = JSON.parse(strFromU8(raw)) as Manifest;
    if (m.version !== VERSION || !Array.isArray(m.items)) throw new Error('version');
    const slice = (name: string) => {
      const d = entry(name);
      if (d.method !== 0) throw new Error('compressed picture');
      return file.slice(d.start, d.start + d.size, 'image/jpeg');
    };
    items = m.items.map((e) => ({
      ...e,
      image: slice(e.image),
      thumb: slice(e.thumb),
      embedding: Float32Array.from(e.embedding),
      color: Float32Array.from(e.color),
    }));
  } catch {
    throw new Error('bad backup');
  }
  await clearAll(db);
  await putItems(db, items);
  await setMeta(db, { addedSinceBackup: 0, lastBackupAt: Date.now() });
  return { items: items.length };
}
