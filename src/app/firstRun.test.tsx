// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from './App';
import { ru } from './i18n/ru';
import { openStampDb } from '../db/db';
import type { Services } from './services';

afterEach(() => cleanup());

describe('first run', () => {
  it('offers a retry when the recognition engine fails to load, and recovers', async () => {
    const db = await openStampDb(`fr${Math.random()}`);
    let calls = 0;
    const services = {
      getDb: async () => db,
      recognizer: { warmUp: async () => { if (++calls === 1) throw new Error('offline'); } },
    } as unknown as Services;
    render(<App services={services} />);
    await waitFor(() => expect(screen.getByText(ru.loadFailed)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: ru.retry }));
    await waitFor(() => expect(screen.queryByText(ru.loadFailed)).toBeNull());
    expect(calls).toBe(2);
    expect(screen.getByRole('button', { name: ru.homeCheck })).toBeTruthy();
  });
});
