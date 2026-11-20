import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { describeMatch, rowLabel } from './matchView';
import { openStampDb, putItems } from '../db/db';
import type { Item } from '../db/types';
import { ru } from './i18n/ru';
import { en } from './i18n/en';

const blob = () => new Blob(['x']);
const item = (id: string, p: Partial<Item> = {}): Item => ({
  id, kind: 'single', groupId: id, forTrade: false, image: blob(), thumb: blob(),
  embedding: new Float32Array(3), color: new Float32Array(72), createdAt: 1, ...p,
});
const tFor = (d: Record<string, string>) => (k: string, v?: Record<string, string | number>) =>
  Object.entries(v ?? {}).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), d[k]);
const m = (id: string) => ({ id, score: 0.7, visual: 0.6, color: 0.8 });

describe('describeMatch + rowLabel', async () => {
  const db = await openStampDb('mv1');
  await putItems(db, [
    item('blk', { kind: 'block', album: 2, page: 5 }),
    item('in1', { parentId: 'blk', album: 2, page: 5 }),
    item('unf'),
    item('g1', { album: 3, page: 12 }),
    item('g2', { groupId: 'g1', forTrade: true }),
  ]);

  it('locates an inner stamp through its parent', async () => {
    const r = await describeMatch(db, m('in1'));
    expect(r.where).toEqual({ album: 2, page: 5 });
    expect(r.inside).toBe('block');
    expect(rowLabel(tFor(ru), r)).toBe('Альбом 2 · стр. 5 · в блоке');
    expect(rowLabel(tFor(en), r)).toBe('Album 2 · p. 5 · in a block');
  });

  it('labels an unfiled stamp', async () => {
    const r = await describeMatch(db, m('unf'));
    expect(r.where).toBe('unfiled');
    expect(rowLabel(tFor(ru), r)).toBe('Не подшита');
  });

  it('counts copies and trade copies', async () => {
    const r = await describeMatch(db, m('g1'));
    expect([r.copies, r.forTrade]).toEqual([2, 1]);
    expect(rowLabel(tFor(ru), r)).toBe('Альбом 3 · стр. 12 · 2 шт. (1 на обмен)');
    expect(rowLabel(tFor(en), r)).toBe('Album 3 · p. 12 · 2 pcs (1 for trade)');
  });
});
