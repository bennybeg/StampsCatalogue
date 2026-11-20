import { useEffect, useMemo, useRef, useState } from 'react';
import type { RgbaImage } from '../../core/image';
import { planPageSave, type Known, type Proposal } from '../../core/savePlan';
import { getItem, listByPage, listUnfiled, loadIndex } from '../../db/db';
import { BoxEditor, type EditBox } from '../components/BoxEditor';
import { useT } from '../i18n';
import { useServices } from '../services';
import { applyProposals, buildCandidates, parsePageNumber, type CandidateWithCrops } from '../savePage';
import { BlobImg } from '../components/BlobImg';

type Step =
  | { s: 'form' }
  | { s: 'detecting' }
  | { s: 'editing' }
  | { s: 'describing'; done: number; total: number }
  | { s: 'confirm'; cands: CandidateWithCrops[]; proposals: Proposal[]; known: Map<string, Blob> }
  | { s: 'done'; n: number }
  | { s: 'error'; msg: string };

export function PageCapture({ go }: { go(path: string): void }) {
  const { t } = useT();
  const svc = useServices();
  const [albumText, setAlbumText] = useState('');
  const [pageText, setPageText] = useState('');
  const [step, setStep] = useState<Step>({ s: 'form' });
  const [photo, setPhoto] = useState<RgbaImage | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [boxes, setBoxes] = useState<EditBox[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // guards taps that arrive before React re-renders
  const album = parsePageNumber(albumText), page = parsePageNumber(pageText);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setStep({ s: 'detecting' });
    try {
      const img = await svc.decode(file);
      setPhoto(img);
      setPhotoUrl(URL.createObjectURL(file));
      const found = await svc.recognizer.detect(img);
      setBoxes(found.map((d, i) => ({ key: String(i), box: d.box, kind: d.kind, inner: d.inner, unresolved: d.unresolved })));
      setStep({ s: 'editing' });
    } catch (e) {
      console.error(e);
      setStep({ s: 'error', msg: t('errorGeneric') });
    }
  };

  const onTapEmpty = async (x: number, y: number) => {
    if (!photo) return;
    const b = await svc.recognizer.snap(photo, x, y).catch(() => null);
    if (b) setBoxes((cur) => [...cur, { key: `t${Date.now()}`, box: b, kind: 'single', inner: [] }]);
  };

  const finish = async (cands: CandidateWithCrops[], proposals: Proposal[]) => {
    if (busyRef.current) return; // a double tap must not save twice
    busyRef.current = true;
    setBusy(true);
    try {
      const db = await svc.getDb();
      const accepted = proposals.map((p): Proposal => (rejected.has(p.tempId) ? { tempId: p.tempId, type: 'new' } : p));
      await applyProposals(db, album!, page!, cands, accepted);
      setStep({ s: 'done', n: accepted.filter((p) => p.type === 'new' || p.type === 'copyOf').length });
    } catch (e) {
      console.error(e);
      setStep({ s: 'error', msg: t('errorGeneric') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!photo || album === null || page === null) return;
    try {
      setStep({ s: 'describing', done: 0, total: boxes.length });
      const cands = await buildCandidates(svc, photo, boxes, (done, total) => setStep({ s: 'describing', done, total }));
      const db = await svc.getDb();
      const onPage = await listByPage(db, album, page);
      const unfiled = await listUnfiled(db);
      const asKnown = (i: { id: string; pos?: Known['pos']; embedding: Float32Array; color: Float32Array }): Known => ({ id: i.id, pos: i.pos, embedding: i.embedding, color: i.color });
      const local = new Set([...onPage, ...unfiled].map((i) => i.id));
      const elsewhere = (await loadIndex(db)).filter((e) => !local.has(e.id));
      const proposals = planPageSave(cands, onPage.map(asKnown), unfiled.map(asKnown), elsewhere);
      if (proposals.every((p) => p.type === 'new')) return await finish(cands, proposals);
      const others = await Promise.all(proposals.filter((p) => p.type === 'copyOf').map((p) => getItem(db, (p as { itemId: string }).itemId)));
      const known = new Map([...onPage, ...unfiled, ...others.filter((i) => !!i)].map((i) => [i!.id, i!.thumb]));
      setRejected(new Set());
      setStep({ s: 'confirm', cands, proposals, known });
    } catch (e) {
      console.error(e);
      setStep({ s: 'error', msg: t('errorGeneric') });
    }
  };

  const hasUnresolved = useMemo(() => boxes.some((b) => b.unresolved), [boxes]);

  return (
    <main className="screen">
      <button className="link" onClick={() => go('/')}>← {t('back')}</button>
      <h1>{t('homeCapture')}</h1>
      {(step.s === 'form' || step.s === 'detecting') && (
        <>
          <div className="row">
            <label>{t('albumLabel')}<input inputMode="numeric" value={albumText} onChange={(e) => setAlbumText(e.target.value)} aria-label={t('albumLabel')} /></label>
            <label>{t('pageLabel')}<input inputMode="numeric" value={pageText} onChange={(e) => setPageText(e.target.value)} aria-label={t('pageLabel')} /></label>
          </div>
          {(album === null || page === null) && <p className="muted">{t('invalidNumber')}</p>}
          <label className={`big button primary${album === null || page === null ? ' disabled' : ''}`}>
            {t('takePhoto')}
            <input type="file" accept="image/*" capture="environment" hidden aria-label={t('takePhoto')}
              disabled={album === null || page === null} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {step.s === 'detecting' && <p>{t('findingStamps')}</p>}
        </>
      )}
      {step.s === 'editing' && photo && (
        <>
          <p className="muted">{t('albumLabel')} {album} · {t('pageLabel')} {page}</p>
          {boxes.length === 0 && <p>{t('noStampsFound')}</p>}
          <BoxEditor photoUrl={photoUrl} width={photo.width} height={photo.height} boxes={boxes} mode="edit" onChange={setBoxes} onTapEmpty={onTapEmpty} />
          {hasUnresolved && <p className="banner">{t('splitFirst')}</p>}
          <button className="big primary" disabled={hasUnresolved || boxes.length === 0} onClick={onSave}>{t('save')}</button>
        </>
      )}
      {step.s === 'describing' && <p>{t('describing', { done: step.done, total: step.total })}</p>}
      {step.s === 'confirm' && (
        <>
          <h2>{t('confirmTitle')}</h2>
          {step.proposals.filter((p) => p.type !== 'new').map((p) => {
            const c = step.cands.find((x) => x.tempId === p.tempId)!;
            const itemId = (p as { itemId: string }).itemId;
            return (
              <label key={p.tempId} className="row proposal">
                <input type="checkbox" checked={!rejected.has(p.tempId)} onChange={(e) => {
                  const r = new Set(rejected); if (e.target.checked) r.delete(p.tempId); else r.add(p.tempId); setRejected(r);
                }} />
                <BlobImg blob={c.thumb} className="thumb" />
                <BlobImg blob={step.known.get(itemId)} className="thumb" />
                <span>{t(p.type === 'alreadySaved' ? 'proposalAlready' : p.type === 'copyOf' ? 'proposalCopy' : 'proposalUnfiled')}</span>
              </label>
            );
          })}
          <button className="big primary" disabled={busy} onClick={() => finish(step.cands, step.proposals)}>{busy ? t('working') : t('save')}</button>
        </>
      )}
      {step.s === 'done' && (
        <>
          <p className="banner ok">{t('savedN', { n: step.n })}</p>
          <button className="big primary" onClick={() => { setPageText(String((page ?? 0) + 1)); setBoxes([]); setPhoto(null); setStep({ s: 'form' }); }}>{t('nextPage')}</button>
          <button className="big" onClick={() => go('/')}>{t('home')}</button>
        </>
      )}
      {step.s === 'error' && (
        <>
          <p className="banner">{step.msg}</p>
          <button className="big" onClick={() => setStep({ s: 'form' })}>{t('back')}</button>
        </>
      )}
    </main>
  );
}
