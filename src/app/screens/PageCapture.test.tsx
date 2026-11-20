// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { ru } from '../i18n/ru';
import { ServicesProvider, type Services } from '../services';
import { PageCapture } from './PageCapture';
import { openStampDb, listByPage, putItems } from '../../db/db';
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

  it('saves new stamps once even when the confirm button is tapped twice', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:photo', revokeObjectURL: () => {} }));
    const db = await openStampDb('capture2');
    const e0 = new Float32Array(4); e0[0] = 1;
    const e1 = new Float32Array(4); e1[1] = 1;
    await putItems(db, [{ id: 'old', kind: 'single', groupId: 'old', forTrade: false, album: 1, page: 4, pos: { x: 0.05, y: 0.05, w: 0.3, h: 0.4 },
      image: new Blob(['i']), thumb: new Blob(['t']), embedding: e0, color: new Float32Array(72), createdAt: 1 }]);
    let k = 0;
    const recognizer: Recognizer = {
      detect: async () => [
        { box: { x: 5, y: 5, w: 30, h: 40 }, kind: 'single', inner: [] },
        { box: { x: 50, y: 5, w: 30, h: 40 }, kind: 'single', inner: [] },
      ],
      snap: async () => null,
      describe: async () => ({ embedding: k++ === 0 ? e0 : e1, color: new Float32Array(72) }),
      warmUp: async () => {},
    };
    const services: Services = { getDb: async () => db, recognizer,
      decode: async () => ({ width: 100, height: 100, data: new Uint8ClampedArray(40000) }), encode: async () => new Blob(['jpg']) };
    render(<I18nProvider><ServicesProvider value={services}><PageCapture go={() => {}} /></ServicesProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText(ru.albumLabel), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(ru.pageLabel), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(ru.takePhoto), { target: { files: [new File(['x'], 'p.jpg')] } });
    await waitFor(() => expect(screen.getByTestId('box-1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: ru.save }));
    await waitFor(() => expect(screen.getByText(ru.confirmTitle)).toBeTruthy());
    const save = screen.getByRole('button', { name: ru.save });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText(ru.savedN.replace('{n}', '1'))).toBeTruthy());
    expect(await listByPage(db, 1, 4)).toHaveLength(2);
  });

  it('adds a movable frame with the button, and a frame where a tap finds no edges', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:photo', revokeObjectURL: () => {} }));
    const db = await openStampDb('capture3');
    const recognizer: Recognizer = {
      detect: async () => [{ box: { x: 5, y: 5, w: 30, h: 40 }, kind: 'single', inner: [] }],
      snap: async () => null,
      describe: async () => ({ embedding: new Float32Array(4), color: new Float32Array(72) }),
      warmUp: async () => {},
    };
    const services: Services = { getDb: async () => db, recognizer,
      decode: async () => ({ width: 100, height: 100, data: new Uint8ClampedArray(40000) }), encode: async () => new Blob(['jpg']) };
    render(<I18nProvider><ServicesProvider value={services}><PageCapture go={() => {}} /></ServicesProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText(ru.albumLabel), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(ru.pageLabel), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(ru.takePhoto), { target: { files: [new File(['x'], 'p.jpg')] } });
    await waitFor(() => expect(screen.getByTestId('box-0')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: ru.addFrame }));
    expect(document.querySelectorAll('.box')).toHaveLength(2);
    expect(screen.getByRole('button', { name: ru.delete })).toBeTruthy(); // new frame is selected, ready to drag
    fireEvent.click(screen.getByRole('button', { name: ru.delete }));
    fireEvent.click(screen.getByTestId('photo-surface'), { clientX: 70, clientY: 70 });
    await waitFor(() => expect(document.querySelectorAll('.box')).toHaveLength(2));
  });
});
