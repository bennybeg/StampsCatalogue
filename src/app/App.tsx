import { useMemo } from 'react';
import { I18nProvider } from './i18n';
import { useRoute } from './router';
import { ServicesProvider, useServices, type Services } from './services';
import { Home } from './screens/Home';
import { PageCapture } from './screens/PageCapture';
import { Check } from './screens/Check';
import { Unfiled } from './screens/Unfiled';
import { Browse } from './screens/Browse';
import { ItemDetail } from './screens/ItemDetail';
import { countUnfiled } from '../db/db';
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

function HomeWithCount({ go }: { go(path: string): void }) {
  const svc = useServices();
  const { value } = useAsync(async () => countUnfiled(await svc.getDb()), []);
  return <Home go={go} unfiledCount={value ?? 0} />;
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

export function App({ services }: { services?: Services }) {
  const svc = useMemo(() => services ?? realServices(), [services]);
  return (
    <I18nProvider>
      <ServicesProvider value={svc}>
        <Screens />
      </ServicesProvider>
    </I18nProvider>
  );
}
