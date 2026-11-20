import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { IndexEntry } from '../core/match';
import type { Item, Meta } from './types';

interface Schema extends DBSchema {
  items: {
    key: string;
    value: Item;
    indexes: { byPage: [number, number]; byParent: string; byGroup: string };
  };
  meta: { key: string; value: Meta };
}

export type StampDb = IDBPDatabase<Schema>;
const META_KEY = 'meta';

export function openStampDb(name = 'stamps'): Promise<StampDb> {
  return openDB<Schema>(name, 1, {
    upgrade(db) {
      const items = db.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('byPage', ['album', 'page']);
      items.createIndex('byParent', 'parentId');
      items.createIndex('byGroup', 'groupId');
      db.createObjectStore('meta');
    },
  });
}

const topLevel = (i: Item) => i.parentId === undefined;

export async function getMeta(db: StampDb): Promise<Meta> {
  return (await db.get('meta', META_KEY)) ?? { addedSinceBackup: 0 };
}

export async function setMeta(db: StampDb, patch: Partial<Meta>): Promise<void> {
  await db.put('meta', { ...(await getMeta(db)), ...patch }, META_KEY);
}

export async function putItems(db: StampDb, items: Item[]): Promise<void> {
  const tx = db.transaction(['items', 'meta'], 'readwrite');
  for (const it of items) await tx.objectStore('items').put(it);
  const meta = (await tx.objectStore('meta').get(META_KEY)) ?? { addedSinceBackup: 0 };
  meta.addedSinceBackup += items.filter(topLevel).length;
  await tx.objectStore('meta').put(meta, META_KEY);
  await tx.done;
}

export async function updateItem(db: StampDb, id: string, patch: Partial<Omit<Item, 'id'>>): Promise<void> {
  const tx = db.transaction('items', 'readwrite');
  const cur = await tx.store.get(id);
  if (!cur) throw new Error(`no item ${id}`);
  await tx.store.put({ ...cur, ...patch, id });
  await tx.done;
}

export async function deleteItem(db: StampDb, id: string): Promise<void> {
  const tx = db.transaction('items', 'readwrite');
  for (const childKey of await tx.store.index('byParent').getAllKeys(id)) await tx.store.delete(childKey);
  await tx.store.delete(id);
  await tx.done;
}

export const getItem = (db: StampDb, id: string) => db.get('items', id);
export const childrenOf = (db: StampDb, id: string) => db.getAllFromIndex('items', 'byParent', id);
export const allItems = (db: StampDb) => db.getAll('items');

export async function listByPage(db: StampDb, album: number, page: number): Promise<Item[]> {
  return (await db.getAllFromIndex('items', 'byPage', [album, page])).filter(topLevel);
}

export async function listUnfiled(db: StampDb): Promise<Item[]> {
  return (await db.getAll('items')).filter((i) => topLevel(i) && i.album === undefined);
}

export async function countUnfiled(db: StampDb): Promise<number> {
  return (await listUnfiled(db)).length;
}

export async function listAlbums(db: StampDb): Promise<{ album: number; pages: number[] }[]> {
  const keys = await db.getAllKeysFromIndex('items', 'byPage');
  const map = new Map<number, Set<number>>();
  for (const k of await Promise.all(keys.map((id) => db.get('items', id)))) {
    if (!k || !topLevel(k) || k.album === undefined || k.page === undefined) continue;
    if (!map.has(k.album)) map.set(k.album, new Set());
    map.get(k.album)!.add(k.page);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([album, pages]) => ({ album, pages: [...pages].sort((a, b) => a - b) }));
}

/** Matchable stamps: singles, including stamps inside blocks/sheets/covers. */
export async function loadIndex(db: StampDb): Promise<(IndexEntry & { groupId: string })[]> {
  return (await db.getAll('items'))
    .filter((i) => i.kind === 'single')
    .map((i) => ({ id: i.id, embedding: i.embedding, color: i.color, groupId: i.groupId }));
}

export async function groupStats(db: StampDb, groupId: string): Promise<{ copies: number; forTrade: number }> {
  const g = await db.getAllFromIndex('items', 'byGroup', groupId);
  return { copies: g.length, forTrade: g.filter((i) => i.forTrade).length };
}

export async function clearAll(db: StampDb): Promise<void> {
  const tx = db.transaction(['items', 'meta'], 'readwrite');
  await tx.objectStore('items').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
}
