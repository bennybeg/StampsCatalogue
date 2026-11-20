import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getMeta, openStampDb, setMeta } from '../db/db';
import { ensurePersisted } from './persist';
import './styles.css';

(async () => {
  try {
    const persisted = await ensurePersisted(navigator.storage);
    const db = await openStampDb();
    if ((await getMeta(db)).persisted !== persisted) await setMeta(db, { persisted });
  } catch { /* best effort */ }
})();

createRoot(document.getElementById('root')!).render(<App />);
