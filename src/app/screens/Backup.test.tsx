// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { App } from '../App';
import { I18nProvider } from '../i18n';
import { ru } from '../i18n/ru';
import { ServicesProvider, type Services } from '../services';
import { Backup } from './Backup';
import { openStampDb, setMeta } from '../../db/db';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); location.hash = ''; });

async function appWithAdded(n: number) {
  const db = await openStampDb(`bkui${Math.random()}`);
  await setMeta(db, { addedSinceBackup: n });
  render(<App services={{ getDb: async () => db } as unknown as Services} />);
}

describe('backup reminder', () => {
  it('shows at 50 new stamps', async () => {
    await appWithAdded(50);
    await waitFor(() => expect(screen.getByText(ru.backupReminder)).toBeTruthy());
  });
  it('does not show at 49', async () => {
    await appWithAdded(49);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(ru.backupReminder)).toBeNull();
  });
});

describe('Backup screen', () => {
  it('shows storage used in MB', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ usage: 188_743_680 }) } });
    const db = await openStampDb(`bkui${Math.random()}`);
    render(<I18nProvider><ServicesProvider value={{ getDb: async () => db } as unknown as Services}><Backup go={() => {}} /></ServicesProvider></I18nProvider>);
    await waitFor(() => expect(screen.getByText(ru.storageUsed.replace('{mb}', '180'))).toBeTruthy());
  });
});
