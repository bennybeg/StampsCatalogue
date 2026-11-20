import { useRef, useState } from 'react';
import { exportZip, importZip } from '../../backup/backup';
import { getMeta } from '../../db/db';
import { useT } from '../i18n';
import { useServices } from '../services';
import { useAsync } from '../useAsync';

export function Backup({ go }: { go(path: string): void }) {
  const { t, lang } = useT();
  const svc = useServices();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  /** One backup/restore at a time; a double tap must not start a second 200 MB job. */
  const once = async (job: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await job(); } finally { busyRef.current = false; setBusy(false); }
  };
  const { value: meta, reload } = useAsync(async () => getMeta(await svc.getDb()), []);
  const { value: usage } = useAsync(async () => {
    try { return (await navigator.storage?.estimate?.())?.usage; } catch { return undefined; }
  }, []);

  const save = () => once(async () => {
    const blob = await exportZip(await svc.getDb());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stamps-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setMsg(t('backupSaved'));
    reload();
  }).catch(() => setMsg(t('errorGeneric')));

  const restore = (file: File) => once(async () => {
    setPending(null);
    try {
      const { items } = await importZip(await svc.getDb(), file);
      setMsg(t('backupRestored', { n: items }));
      reload();
    } catch (e) {
      setMsg((e as Error).message === 'bad backup' ? t('backupBad') : t('errorGeneric'));
    }
  });

  return (
    <main className="screen">
      <button className="link" onClick={() => go('/')}>← {t('back')}</button>
      <h1>{t('homeBackup')}</h1>
      <p className="muted">
        {meta?.lastBackupAt ? t('backupLast', { date: new Date(meta.lastBackupAt).toLocaleDateString(lang) }) : t('backupNever')}
      </p>
      {usage !== undefined && <p className="muted">{t('storageUsed', { mb: Math.round(usage / 1024 / 1024) })}</p>}
      {msg && <p className="banner">{msg}</p>}
      {busy && <p>{t('working')}</p>}
      <button className="big primary" disabled={busy} onClick={save}>{t('backupSave')}</button>
      <label className="big button">
        {t('backupRestore')}
        <input type="file" accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream" hidden disabled={busy} onChange={(e) => setPending(e.target.files?.[0] ?? null)} />
      </label>
      {pending && (
        <div className="banner">
          <p>{t('backupRestoreWarn')}</p>
          <div className="row">
            <button className="danger" onClick={() => restore(pending)}>{t('backupRestoreYes')}</button>
            <button onClick={() => setPending(null)}>{t('close')}</button>
          </div>
        </div>
      )}
    </main>
  );
}
