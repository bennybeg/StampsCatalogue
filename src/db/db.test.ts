import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  openStampDb, putItems, deleteItem, getItem, listByPage, countUnfiled, listUnfiled, listAlbums,
  loadIndex, groupStats, getMeta, updateItem, childrenOf, type StampDb,
} from './db';
import type { Item } from './types';

let n = 0;
function item(p: Partial<Item> = {}): Item {
  const id = p.id ?? `i${++n}`;
  return {
    id, kind: 'single', groupId: id, forTrade: false,
    image: new Blob(['img']), thumb: new Blob(['th']),
    embedding: Float32Array.from([1, 0, 0]), color: new Float32Array(72).fill(1 / 72),
    createdAt: Date.now(), ...p,
  };
}

let db: StampDb;
beforeEach(async () => { db = await openStampDb(`t${++n}`); });

describe('stamp db', () => {
  it('lists by page (top-level only), unfiled and albums', async () => {
    const block = item({ kind: 'block', album: 1, page: 2 });
    await putItems(db, [item({ album: 1, page: 2 }), block, item({ parentId: block.id, album: 1, page: 2 }), item()]);
    expect(await listByPage(db, 1, 2)).toHaveLength(2);
    expect(await countUnfiled(db)).toBe(1);
    expect(await listUnfiled(db)).toHaveLength(1);
    expect(await listAlbums(db)).toEqual([{ album: 1, pages: [2] }]);
  });

  it('deletes children with their parent', async () => {
    const block = item({ kind: 'block' });
    const child = item({ parentId: block.id });
    await putItems(db, [block, child]);
    await deleteItem(db, block.id);
    expect(await getItem(db, child.id)).toBeUndefined();
    expect(await childrenOf(db, block.id)).toEqual([]);
  });

  it('indexes matchable stamps (singles and inner) with their embeddings intact', async () => {
    const block = item({ kind: 'block', embedding: Float32Array.from([0, 1, 0]) });
    const inner = item({ parentId: block.id, embedding: Float32Array.from([0, 0, 1]) });
    const single = item({ embedding: Float32Array.from([0.6, 0.8, 0]) });
    await putItems(db, [block, inner, single]);
    const idx = await loadIndex(db);
    expect(idx.map((e) => e.id).sort()).toEqual([inner.id, single.id].sort());
    const s = idx.find((e) => e.id === single.id)!;
    expect(s.embedding).toBeInstanceOf(Float32Array);
    expect(Array.from(s.embedding)).toEqual(Array.from(Float32Array.from([0.6, 0.8, 0])));
    expect(s.groupId).toBe(single.groupId);
  });

  it('counts copies and trade copies in a group', async () => {
    const a = item();
    await putItems(db, [a, item({ groupId: a.groupId, forTrade: true })]);
    expect(await groupStats(db, a.groupId)).toEqual({ copies: 2, forTrade: 1 });
  });

  it('counts top-level additions since the last backup', async () => {
    const block = item({ kind: 'block' });
    await putItems(db, [block, item(), item({ parentId: block.id })]);
    expect((await getMeta(db)).addedSinceBackup).toBe(2);
  });

  it('updates fields and files an unfiled item', async () => {
    const a = item();
    await putItems(db, [a]);
    await updateItem(db, a.id, { album: 3, page: 7, forTrade: true });
    expect(await countUnfiled(db)).toBe(0);
    expect((await listByPage(db, 3, 7))[0].forTrade).toBe(true);
  });
});
