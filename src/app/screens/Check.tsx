import { useEffect, useState } from 'react';
import { crop, withMargin, type Box, type RgbaImage } from '../../core/image';
import { rankMatches } from '../../core/match';
import { edgesDiffer } from '../../core/edges';
import { loadIndex, putItems } from '../../db/db';
import { BoxEditor, type EditBox } from '../components/BoxEditor';
import { BlobImg } from '../components/BlobImg';
import { CompareView } from '../components/CompareView';
import { useT } from '../i18n';
import { useServices } from '../services';
import { describeMatch, rowLabel, type MatchRow } from '../matchView';
import { IMAGE_SIDE, JPEG_QUALITY, THUMB_SIDE } from '../savePage';

export const MATCH_K = 5;
export const COLOR_WEIGHT = 0.5;

type Query = { img: RgbaImage; look: { embedding: Float32Array; color: Float32Array } };
type Step =
  | { s: 'start' }
  | { s: 'working' }
  | { s: 'pick'; photo: RgbaImage; url: string; boxes: EditBox[] }
  | { s: 'results'; q: Query; rows: MatchRow[] }
  | { s: 'added' }
  | { s: 'error'; msg: string };

export function Check({ go }: { go(path: string): void }) {
  const { t } = useT();
  const svc = useServices();
  const [step, setStep] = useState<Step>({ s: 'start' });
  const [compare, setCompare] = useState<MatchRow | null>(null);
  const [sameGroup, setSameGroup] = useState<string | null>(null);
  const [forTrade, setForTrade] = useState(false);
  const [queryBlob, setQueryBlob] = useState<Blob | null>(null);
  const [differ, setDiffer] = useState(false);

  const search = async (photo: RgbaImage, box: Box | null) => {
    setStep({ s: 'working' });
    const img = box ? crop(photo, withMargin(box, photo)) : photo;
    const look = await svc.recognizer.describe(img);
    const db = await svc.getDb();
    const matches = rankMatches(look, await loadIndex(db), { k: MATCH_K, colorWeight: COLOR_WEIGHT });
    const rows = await Promise.all(matches.map((m) => describeMatch(db, m)));
    setQueryBlob(await svc.encode(img, IMAGE_SIDE, JPEG_QUALITY));
    setSameGroup(null);
    setStep({ s: 'results', q: { img, look }, rows });
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      setStep({ s: 'working' });
      const photo = await svc.decode(file);
      const found = (await svc.recognizer.detect(photo)).filter((d) => !d.unresolved);
      if (found.length > 1)
        return setStep({ s: 'pick', photo, url: URL.createObjectURL(file), boxes: found.map((d, i) => ({ key: String(i), box: d.box, kind: d.kind, inner: d.inner })) });
      await search(photo, found[0]?.box ?? null);
    } catch (e) {
      setStep({ s: 'error', msg: (e as Error).message });
    }
  };

  useEffect(() => () => { if (step.s === 'pick') URL.revokeObjectURL(step.url); }, [step]);

  const openCompare = async (row: MatchRow, q: Query) => {
    setCompare(row);
    setDiffer(false);
    try {
      const bmp = await svc.decode(row.item.image);
      setDiffer(edgesDiffer(q.img, bmp));
    } catch { /* hint is optional */ }
  };

  const add = async (q: Query) => {
    const db = await svc.getDb();
    const id = crypto.randomUUID();
    await putItems(db, [{
      id, kind: 'single', groupId: sameGroup ?? id, forTrade,
      image: await svc.encode(q.img, IMAGE_SIDE, JPEG_QUALITY), thumb: await svc.encode(q.img, THUMB_SIDE, JPEG_QUALITY),
      embedding: q.look.embedding, color: q.look.color, createdAt: Date.now(),
    }]);
    setStep({ s: 'added' });
  };

  return (
    <main className="screen">
      <button className="link" onClick={() => go('/')}>← {t('back')}</button>
      <h1>{t('homeCheck')}</h1>
      {(step.s === 'start' || step.s === 'added' || step.s === 'error') && (
        <>
          {step.s === 'added' && <p className="banner ok">{t('addedUnfiled')}</p>}
          {step.s === 'error' && <p className="banner">{t('errorPrefix', { msg: step.msg })}</p>}
          <label className="big button primary">
            {step.s === 'start' ? t('takePhoto') : t('checkAnother')}
            <input type="file" accept="image/*" capture="environment" hidden aria-label={t('takePhoto')} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </>
      )}
      {step.s === 'working' && <p>{t('findingStamps')}</p>}
      {step.s === 'pick' && (
        <>
          <p>{t('pickStamp')}</p>
          <BoxEditor photoUrl={step.url} width={step.photo.width} height={step.photo.height} boxes={step.boxes} mode="pick"
            onPick={(b) => search(step.photo, b.box)}
            onTapEmpty={async (x, y) => { const b = await svc.recognizer.snap(step.photo, x, y); if (b) search(step.photo, b); }} />
        </>
      )}
      {step.s === 'results' && (
        <>
          {queryBlob && <BlobImg blob={queryBlob} className="query-img" alt={t('yourPhoto')} />}
          {step.rows.length === 0 ? <p>{t('emptyCollection')}</p> : <h2>{t('closestMatches')}</h2>}
          {step.rows.map((r) => (
            <button key={r.item.id} className="match-row row" data-testid="match-row" onClick={() => openCompare(r, step.q)}>
              <BlobImg blob={r.item.thumb} className="thumb" />
              <span>{rowLabel(t, r)}</span>
            </button>
          ))}
          <label className="row check"><input type="checkbox" checked={forTrade} onChange={(e) => setForTrade(e.target.checked)} /> {t('forTrade')}</label>
          <button className="big primary" onClick={() => add(step.q)}>{t('addToCollection')}</button>
          <label className="big button">
            {t('checkAnother')}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {compare && queryBlob && (
            <CompareView left={queryBlob} right={compare.item.image} edgesDiffer={differ}
              onClose={() => setCompare(null)}
              onSameStamp={() => { setSameGroup(compare.item.groupId); setCompare(null); }} />
          )}
        </>
      )}
    </main>
  );
}
