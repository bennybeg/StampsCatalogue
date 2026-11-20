import type { Match } from '../core/match';
import { getItem, groupStats, type StampDb } from '../db/db';
import type { Item } from '../db/types';

export type MatchRow = {
  item: Item;
  parent?: Item;
  where: { album: number; page: number } | 'unfiled';
  inside?: 'block' | 'sheet' | 'cover';
  copies: number;
  forTrade: number;
  score: number;
};

/** Everything the check screen shows for one match. Inner stamps are located through their parent. */
export async function describeMatch(db: StampDb, m: Match): Promise<MatchRow> {
  const item = (await getItem(db, m.id))!;
  const parent = item.parentId ? await getItem(db, item.parentId) : undefined;
  const at = parent ?? item;
  const where = at.album !== undefined && at.page !== undefined ? { album: at.album, page: at.page } : 'unfiled' as const;
  const inside = parent && parent.kind !== 'single' ? parent.kind : undefined;
  const { copies, forTrade } = await groupStats(db, item.groupId);
  return { item, parent, where, inside, copies, forTrade, score: m.score };
}

type T = (key: never, vars?: Record<string, string | number>) => string;

/** e.g. "Альбом 3 · стр. 12 · в блоке · 2 шт. (1 на обмен)". */
export function rowLabel(tr: T | ((k: string, v?: Record<string, string | number>) => string), row: MatchRow): string {
  const t = tr as (k: string, v?: Record<string, string | number>) => string;
  const parts = [row.where === 'unfiled' ? t('whereUnfiled') : t('whereAlbum', row.where)];
  if (row.inside) parts.push(t({ block: 'insideBlock', sheet: 'insideSheet', cover: 'insideCover' }[row.inside]));
  if (row.copies > 1 || row.forTrade > 0)
    parts.push(row.forTrade > 0 ? `${t('copiesN', { n: row.copies })} ${t('forTradeN', { n: row.forTrade })}` : t('copiesN', { n: row.copies }));
  return parts.join(' · ');
}
