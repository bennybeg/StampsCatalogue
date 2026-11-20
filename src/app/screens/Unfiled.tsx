import { useState } from 'react';
import { listUnfiled, updateItem } from '../../db/db';
import type { Item } from '../../db/types';
import { BlobImg } from '../components/BlobImg';
import { useT } from '../i18n';
import { parsePageNumber } from '../savePage';
import { useServices } from '../services';
import { useAsync } from '../useAsync';

function Row({ item, onFile }: { item: Item; onFile(album: number, page: number): void }) {
  const { t } = useT();
  const [a, setA] = useState('');
  const [p, setP] = useState('');
  const album = parsePageNumber(a), page = parsePageNumber(p);
  return (
    <div className="row unfiled-row" data-testid="unfiled-row">
      <BlobImg blob={item.thumb} className="thumb" />
      <input inputMode="numeric" aria-label={t('albumLabel')} placeholder={t('albumLabel')} value={a} onChange={(e) => setA(e.target.value)} />
      <input inputMode="numeric" aria-label={t('pageLabel')} placeholder={t('pageLabel')} value={p} onChange={(e) => setP(e.target.value)} />
      <button disabled={album === null || page === null} onClick={() => onFile(album!, page!)}>{t('fileIt')}</button>
    </div>
  );
}

export function Unfiled({ go }: { go(path: string): void }) {
  const { t } = useT();
  const svc = useServices();
  const { value: items, reload } = useAsync(async () => listUnfiled(await svc.getDb()), []);
  const file = async (id: string, album: number, page: number) => {
    await updateItem(await svc.getDb(), id, { album, page });
    reload();
  };
  return (
    <main className="screen">
      <button className="link" onClick={() => go('/')}>← {t('back')}</button>
      <h1>{t('homeUnfiled')}</h1>
      {items && items.length === 0 && <p>{t('nothingUnfiled')}</p>}
      {items?.map((i) => <Row key={i.id} item={i} onFile={(a, p) => file(i.id, a, p)} />)}
    </main>
  );
}
