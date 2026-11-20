import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getMeta, openStampDb, setMeta } from '../db/db';
import './styles.css';

/** Ask once that the browser never evicts the collection under storage pressure. */
async function persistOnce() {
  try {
    const db = await openStampDb();
    if ((await getMeta(db)).persisted !== undefined) return;
    const persisted = (await navigator.storage?.persist?.()) ?? false;
    await setMeta(db, { persisted });
  } catch { /* best effort */ }
}

persistOnce();
createRoot(document.getElementById('root')!).render(<App />);
