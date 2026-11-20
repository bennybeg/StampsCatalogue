// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { ru } from '../i18n/ru';
import { ServicesProvider, type Services } from '../services';
import { PageCapture } from './PageCapture';
import { openStampDb, listByPage } from '../../db/db';
import type { Recognizer } from '../../worker/client';

afterEach(() => cleanup());

describe('PageCapture', () => {
  it('detects stamps on a photo and saves them to the album page', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:photo', revokeObjectURL: () => {} }));
    const db = await openStampDb('capture1');
    let k = 0;
    const recognizer: Recognizer = {
      detect: async () => [
        { box: { x: 5, y: 5, w: 30, h: 40 }, kind: 'single', inner: [] },
        { box: { x: 50, y: 5, w: 30, h: 40 }, kind: 'single', inner: [] },
      ],
      snap: async () => null,
      describe: async () => { k++; const e = new Float32Array(4); e[k % 4] = 1; return { embedding: e, color: new Float32Array(72) }; },
      warmUp: async () => {},
    };
    const services: Services = {
      getDb: async () => db, recognizer,
      decode: async () => ({ width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) }),
      encode: async () => new Blob(['jpg']),
    };
    render(<I18nProvider><ServicesProvider value={services}><PageCapture go={() => {}} /></ServicesProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText(ru.albumLabel), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(ru.pageLabel), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(ru.takePhoto), { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByTestId('box-0')).toBeTruthy());
    expect(screen.getByTestId('box-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ru.save }));
    await waitFor(() => expect(screen.getByText(ru.savedN.replace('{n}', '2'))).toBeTruthy());
    expect(await listByPage(db, 1, 4)).toHaveLength(2);
  });
});
