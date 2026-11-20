import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { exportZip, importZip } from './backup';
import { openStampDb, putItems, allItems, clearAll, getMeta } from '../db/db';
import type { Item } from '../db/types';

const bytes = (s: string) => new Blob([new TextEncoder().encode(s)], { type: 'image/jpeg' });
const item = (id: string, p: Partial<Item> = {}): Item => ({
  id, kind: 'single', groupId: id, forTrade: false, image: bytes(`img-${id}`), thumb: bytes(`th-${id}`),
  embedding: Float32Array.from([0.1, 0.2, 0.3]), color: Float32Array.from({ length: 72 }, (_, i) => i / 100), createdAt: 123, ...p,
});
const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());

describe('backup', () => {
  it('round-trips every field', async () => {
    const db = await openStampDb('bk1');
    const original = [
      item('blk', { kind: 'block', album: 1, page: 2, pos: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }),
      item('in', { parentId: 'blk', album: 1, page: 2 }),
      item('u', { forTrade: true, note: 'обмен' }),
    ];
    await putItems(db, original);
    const zip = await exportZip(db);
    expect((await getMeta(db)).addedSinceBackup).toBe(0);
    await clearAll(db);
    expect(await importZip(db, zip)).toEqual({ items: 3 });
    const back = (await allItems(db)).sort((a, b) => a.id.localeCompare(b.id));
    const orig = [...original].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < orig.length; i++) {
      const { image, thumb, embedding, color, ...rest } = back[i];
      const o = orig[i];
      const { image: _i, thumb: _t, embedding: _e, color: _c, ...oRest } = o;
      expect(rest).toEqual(oRest);
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(Array.from(embedding)).toEqual(Array.from(o.embedding));
      expect(Array.from(color)).toEqual(Array.from(o.color));
      expect(await text(image)).toBe(await text(o.image));
      expect(await text(thumb)).toBe(await text(o.thumb));
    }
  });

  it('rejects a file that is not a backup and leaves the collection alone', async () => {
    const db = await openStampDb('bk2');
    await putItems(db, [item('a')]);
    await expect(importZip(db, new Blob(['not a zip']))).rejects.toThrow('bad backup');
    expect(await allItems(db)).toHaveLength(1);
  });
});
