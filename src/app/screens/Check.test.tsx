// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { ru } from '../i18n/ru';
import { ServicesProvider, type Services } from '../services';
import { Check } from './Check';
import { openStampDb, putItems, countUnfiled, type StampDb } from '../../db/db';
import type { Recognizer } from '../../worker/client';
import type { Detected } from '../../core/detect';

afterEach(() => cleanup());
vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));

const unit = (k: number) => { const e = new Float32Array(8); e[k] = 1; return e; };

async function setup(detected: Detected[]) {
  const db = await openStampDb(`check${Math.random()}`);
  await putItems(db, Array.from({ length: 6 }, (_, k) => ({
    id: `s${k}`, kind: 'single' as const, groupId: `s${k}`, forTrade: false, album: 1, page: k + 1,
    image: new Blob(['i']), thumb: new Blob(['t']), embedding: unit(k), color: new Float32Array(72), createdAt: 1,
  })));
  const recognizer: Recognizer = {
    detect: async () => detected, snap: async () => null, warmUp: async () => {},
    describe: async () => ({ embedding: unit(2), color: new Float32Array(72) }),
  };
  const services: Services = {
    getDb: async () => db, recognizer,
    decode: async () => ({ width: 100, height: 100, data: new Uint8ClampedArray(40000) }),
    encode: async () => new Blob(['jpg']),
  };
  render(<I18nProvider><ServicesProvider value={services}><Check go={() => {}} /></ServicesProvider></I18nProvider>);
  fireEvent.change(screen.getByLabelText(ru.takePhoto), { target: { files: [new File(['x'], 'q.jpg')] } });
  return db as StampDb;
}

const one: Detected[] = [{ box: { x: 10, y: 10, w: 50, h: 60 }, kind: 'single', inner: [] }];

describe('Check', () => {
  it('shows the five closest stamps, best first, and adds the stamp as unfiled', async () => {
    const db = await setup(one);
    await waitFor(() => expect(screen.getAllByTestId('match-row')).toHaveLength(5));
    expect(screen.getAllByTestId('match-row')[0].textContent).toContain('стр. 3');
    fireEvent.click(screen.getByRole('button', { name: ru.addToCollection }));
    await waitFor(() => expect(screen.getByText(ru.addedUnfiled)).toBeTruthy());
    expect(await countUnfiled(db)).toBe(1);
  });

  it('asks which stamp when the photo has several', async () => {
    await setup([...one, { box: { x: 70, y: 10, w: 20, h: 30 }, kind: 'single', inner: [] }]);
    await waitFor(() => expect(screen.getByText(ru.pickStamp)).toBeTruthy());
    fireEvent.click(screen.getByTestId('box-0'));
    await waitFor(() => expect(screen.getAllByTestId('match-row')).toHaveLength(5));
  });
});
