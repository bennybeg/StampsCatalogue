import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from './i18n';
import { I18nProvider } from './i18n';
import { useRoute } from './router';
import { ServicesProvider, useServices, type Services } from './services';
import { Home } from './screens/Home';
import { PageCapture } from './screens/PageCapture';
import { Check } from './screens/Check';
import { Unfiled } from './screens/Unfiled';
import { Browse } from './screens/Browse';
import { ItemDetail } from './screens/ItemDetail';
import { countUnfiled, getMeta } from '../db/db';
import { Backup } from './screens/Backup';
import { useAsync } from './useAsync';
import { openStampDb, type StampDb } from '../db/db';
import { getRecognizer, type Recognizer } from '../worker/client';
import { fileToRgba, rgbaToJpeg } from './imageio';

/** Real services, created lazily so nothing heavy starts until a screen needs it. */
function realServices(): Services {
  let db: Promise<StampDb> | null = null;
  let rec: Recognizer | null = null;
  const lazyRec = () => (rec ??= getRecognizer());
  return {
    getDb: () => (db ??= openStampDb()),
    recognizer: {
      detect: (...a) => lazyRec().detect(...a),
      snap: (...a) => lazyRec().snap(...a),
      describe: (...a) => lazyRec().describe(...a),
      warmUp: () => lazyRec().warmUp(),
    },
    decode: (f) => fileToRgba(f),
    encode: (img, side, q) => rgbaToJpeg(img, side, q),
  };
}

/** Remind to back up after this many new top-level stamps. */
export const BACKUP_REMINDER_AT = 50;

function HomeWithCount({ go }: { go(path: string): void }) {
  const svc = useServices();
  const { value } = useAsync(async () => {
    const db = await svc.getDb();
    return { unfiled: await countUnfiled(db), added: (await getMeta(db)).addedSinceBackup };
  }, []);
  return <Home go={go} unfiledCount={value?.unfiled ?? 0} backupDue={(value?.added ?? 0) >= BACKUP_REMINDER_AT} />;
}

function Screens() {
  const { route, params, go } = useRoute();
  switch (route) {
    case '/unfiled':
      return <Unfiled go={go} />;
    case '/browse':
    case '/browse/:album':
    case '/browse/:album/:page':
      return <Browse key={route + JSON.stringify(params)} go={go} params={params} />;
    case '/backup':
      return <Backup go={go} />;
    case '/item/:id':
      return <ItemDetail go={go} id={params.id} />;
    case '/page':
      return <PageCapture go={go} />;
    case '/check':
      return <Check go={go} />;
    default:
      return <HomeWithCount go={go} />;
  }
}

/**
 * Loads OpenCV and the model in the background so the first check is fast. The first time this
 * downloads ~24 MB; afterwards it comes from the phone's cache. Failure shows a retry banner.
 */
function EngineStatus() {
  const { t } = useT();
  const svc = useServices();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const load = useCallback(() => {
    setState('loading');
    // new Promise also catches a synchronous throw (e.g. no Worker support).
    new Promise<void>((resolve) => resolve(svc.recognizer?.warmUp?.())).then(() => setState('ready'), () => setState('failed'));
  }, [svc]);
  useEffect(load, [load]);
  if (state === 'ready') return null;
  if (state === 'loading') return <p className="engine muted">{t('loadingEngine')}</p>;
  return (
    <div className="engine banner row">
      <span>{t('loadFailed')}</span>
      <button onClick={load}>{t('retry')}</button>
    </div>
  );
}

export function App({ services }: { services?: Services }) {
  const svc = useMemo(() => services ?? realServices(), [services]);
  return (
    <I18nProvider>
      <ServicesProvider value={svc}>
        <EngineStatus />
        <Screens />
      </ServicesProvider>
    </I18nProvider>
  );
}
