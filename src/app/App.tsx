import { useMemo } from 'react';
import { I18nProvider } from './i18n';
import { useRoute } from './router';
import { ServicesProvider, type Services } from './services';
import { Home } from './screens/Home';
import { PageCapture } from './screens/PageCapture';
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

function Screens() {
  const { route, go } = useRoute();
  switch (route) {
    case '/page':
      return <PageCapture go={go} />;
    default:
      return <Home go={go} />;
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
