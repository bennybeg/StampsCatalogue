import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { parsePageNumber, applyProposals, type CandidateWithCrops } from './savePage';
import { openStampDb, putItems, listByPage, allItems, getItem } from '../db/db';
import type { Item } from '../db/types';

const vec = () => ({ embedding: Float32Array.from([1, 0, 0]), color: new Float32Array(72) });
const blob = () => new Blob(['x']);
const pos = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const cand = (tempId: string, kind: CandidateWithCrops['box']['kind'], children = 0): CandidateWithCrops => ({
  tempId, pos, ...vec(), image: blob(), thumb: blob(),
  box: { key: tempId, box: { x: 0, y: 0, w: 10, h: 10 }, kind, inner: [] },
  children: Array.from({ length: children }, () => ({ image: blob(), thumb: blob(), pos, ...vec() })),
});
const item = (id: string, p: Partial<Item> = {}): Item => ({ id, kind: 'single', groupId: id, forTrade: false, image: blob(), thumb: blob(), ...vec(), createdAt: 1, ...p });

describe('parsePageNumber', () => {
  it.each([['03 ', 3], ['12', 12], ['', null], ['abc', null], ['0', null], ['1.5', null]])('%j → %j', (s, n) => {
    expect(parsePageNumber(s)).toBe(n);
  });
});

describe('applyProposals', () => {
  it('saves new items with children, files unfiled ones, updates already saved positions', async () => {
    const db = await openStampDb('apply1');
    await putItems(db, [item('unf'), item('old', { album: 2, page: 5, pos: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } })]);
    const cands = [cand('c1', 'block', 2), cand('c2', 'single'), cand('c3', 'single')];
    await applyProposals(db, 2, 5, cands, [
      { tempId: 'c1', type: 'new' },
      { tempId: 'c2', type: 'fileUnfiled', itemId: 'unf', score: 0.9 },
      { tempId: 'c3', type: 'alreadySaved', itemId: 'old', score: 0.9 },
    ]);
    const all = await allItems(db);
    expect(all).toHaveLength(5); // 2 existing + block + 2 inner
    expect(all.filter((i) => i.parentId)).toHaveLength(2);
    expect((await getItem(db, 'unf'))!).toMatchObject({ album: 2, page: 5, pos });
    expect((await getItem(db, 'old'))!.pos).toEqual(pos);
    expect(await listByPage(db, 2, 5)).toHaveLength(3);
  });
});
