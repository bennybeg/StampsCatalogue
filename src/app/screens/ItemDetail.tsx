import { useState } from 'react';
import type { ItemKind } from '../../core/detect';
import { childrenOf, deleteItem, getItem, groupStats, updateItem } from '../../db/db';
import { BlobImg } from '../components/BlobImg';
import { useT, type Key } from '../i18n';
import { useServices } from '../services';
import { useAsync } from '../useAsync';

const KINDS: { kind: ItemKind; label: Key }[] = [
  { kind: 'single', label: 'kindSingle' }, { kind: 'block', label: 'kindBlock' },
  { kind: 'sheet', label: 'kindSheet' }, { kind: 'cover', label: 'kindCover' },
];

export function ItemDetail({ go, id }: { go(path: string): void; id: string }) {
  const { t } = useT();
  const svc = useServices();
  const [confirming, setConfirming] = useState(false);
  const { value, reload } = useAsync(async () => {
    const db = await svc.getDb();
    const item = await getItem(db, id);
    if (!item) return null;
    return { item, children: await childrenOf(db, id), stats: await groupStats(db, item.groupId) };
  }, [id]);
  const patch = async (p: Parameters<typeof updateItem>[2]) => { await updateItem(await svc.getDb(), id, p); reload(); };
  const back = () => go(value?.item.album !== undefined ? `/browse/${value.item.album}/${value.item.page}` : '/unfiled');

  if (value === null) return <main className="screen"><button className="link" onClick={() => go('/')}>← {t('back')}</button></main>;
  if (!value) return null;
  const { item, children, stats } = value;
  return (
    <main className="screen">
      <button className="link" onClick={back}>← {t('back')}</button>
      <BlobImg blob={item.image} className="detail-img" />
      <p className="muted">
        {item.album !== undefined ? t('whereAlbum', { album: item.album, page: item.page ?? '' }) : t('whereUnfiled')}
        {' · '}{t('copiesTotal', { n: stats.copies })}
      </p>
      <label>{t('kind')}
        <select value={item.kind} onChange={(e) => patch({ kind: e.target.value as ItemKind })}>
          {KINDS.map((k) => <option key={k.kind} value={k.kind}>{t(k.label)}</option>)}
        </select>
      </label>
      <label className="row check"><input type="checkbox" aria-label={t('forTrade')} checked={item.forTrade} onChange={(e) => patch({ forTrade: e.target.checked })} /> {t('forTrade')}</label>
      <label>{t('note')}<textarea defaultValue={item.note ?? ''} onBlur={(e) => patch({ note: e.target.value || undefined })} /></label>
      {children.length > 0 && (
        <>
          <h2>{t('insideItems')}</h2>
          <div className="grid">{children.map((c) => <BlobImg key={c.id} blob={c.thumb} className="thumb" />)}</div>
        </>
      )}
      {!confirming
        ? <button className="danger" onClick={() => setConfirming(true)}>{t('delete')}</button>
        : <button className="danger big" onClick={async () => { await deleteItem(await svc.getDb(), id); back(); }}>{t('confirmDelete')}</button>}
    </main>
  );
}
