import { useState } from 'react';
import { listAlbums, listByPage } from '../../db/db';
import { BlobImg } from '../components/BlobImg';
import { useT } from '../i18n';
import { useServices } from '../services';
import { useAsync } from '../useAsync';

/** /browse → albums, /browse/:album → pages, /browse/:album/:page → stamps. */
export function Browse({ go, params }: { go(path: string): void; params: { album?: string; page?: string } }) {
  const { t } = useT();
  const svc = useServices();
  const [onlyTrade, setOnlyTrade] = useState(false);
  const album = params.album ? Number(params.album) : undefined;
  const page = params.page ? Number(params.page) : undefined;
  const { value: albums } = useAsync(async () => listAlbums(await svc.getDb()), []);
  const { value: items } = useAsync(
    async () => (album !== undefined && page !== undefined ? listByPage(await svc.getDb(), album, page) : []),
    [album, page],
  );
  const back = page !== undefined ? `/browse/${album}` : album !== undefined ? '/browse' : '/';

  return (
    <main className="screen">
      <button className="link" onClick={() => go(back)}>← {t('back')}</button>
      <h1>{album === undefined ? t('homeBrowse') : page === undefined ? t('albumN', { n: album }) : `${t('albumN', { n: album })} · ${t('pageN', { n: page })}`}</h1>
      {album === undefined && albums?.length === 0 && <p>{t('noAlbums')}</p>}
      {album === undefined && albums?.map((a) => (
        <button key={a.album} className="big" onClick={() => go(`/browse/${a.album}`)}>{t('albumN', { n: a.album })}</button>
      ))}
      {album !== undefined && page === undefined && albums?.find((a) => a.album === album)?.pages.map((p) => (
        <button key={p} className="big" onClick={() => go(`/browse/${album}/${p}`)}>{t('pageN', { n: p })}</button>
      ))}
      {page !== undefined && (
        <>
          <label className="row check"><input type="checkbox" aria-label={t('onlyForTrade')} checked={onlyTrade} onChange={(e) => setOnlyTrade(e.target.checked)} /> {t('onlyForTrade')}</label>
          {items?.length === 0 && <p>{t('emptyPage')}</p>}
          <div className="grid">
            {items?.filter((i) => !onlyTrade || i.forTrade).map((i) => (
              <button key={i.id} className="grid-item" data-testid="grid-item" onClick={() => go(`/item/${i.id}`)}>
                <BlobImg blob={i.thumb} className="thumb" />
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
