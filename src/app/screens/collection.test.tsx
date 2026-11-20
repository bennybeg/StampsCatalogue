// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '../i18n';
import { ru } from '../i18n/ru';
import { ServicesProvider, type Services } from '../services';
import { Unfiled } from './Unfiled';
import { Browse } from './Browse';
import { ItemDetail } from './ItemDetail';
import { openStampDb, putItems, listByPage, countUnfiled, getItem, type StampDb } from '../../db/db';
import type { Item } from '../../db/types';

afterEach(() => cleanup());
vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));

const item = (id: string, p: Partial<Item> = {}): Item => ({
  id, kind: 'single', groupId: id, forTrade: false, image: new Blob(['i']), thumb: new Blob(['t']),
  embedding: new Float32Array(3), color: new Float32Array(72), createdAt: 1, ...p,
});

async function withDb(items: Item[], ui: ReactNode): Promise<StampDb> {
  const db = await openStampDb(`col${Math.random()}`);
  await putItems(db, items);
  const svc = { getDb: async () => db } as unknown as Services;
  render(<I18nProvider><ServicesProvider value={svc}>{ui}</ServicesProvider></I18nProvider>);
  return db;
}

describe('Unfiled', () => {
  it('files a stamp to an album page', async () => {
    const db = await withDb([item('a'), item('b')], <Unfiled go={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId('unfiled-row')).toHaveLength(2));
    fireEvent.change(screen.getAllByLabelText(ru.albumLabel)[0], { target: { value: '1' } });
    fireEvent.change(screen.getAllByLabelText(ru.pageLabel)[0], { target: { value: '4' } });
    fireEvent.click(screen.getAllByRole('button', { name: ru.fileIt })[0]);
    await waitFor(() => expect(screen.getAllByTestId('unfiled-row')).toHaveLength(1));
    expect(await listByPage(db, 1, 4)).toHaveLength(1);
    expect(await countUnfiled(db)).toBe(1);
  });
});

describe('Browse', () => {
  it('lists albums', async () => {
    await withDb([item('a', { album: 1, page: 2 }), item('b', { album: 3, page: 1 })], <Browse go={() => {}} params={{}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Альбом 1' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Альбом 3' })).toBeTruthy();
  });

  it('filters a page to stamps for trade', async () => {
    await withDb([item('a', { album: 1, page: 2 }), item('b', { album: 1, page: 2, forTrade: true })], <Browse go={() => {}} params={{ album: '1', page: '2' }} />);
    await waitFor(() => expect(screen.getAllByTestId('grid-item')).toHaveLength(2));
    fireEvent.click(screen.getByLabelText(ru.onlyForTrade));
    await waitFor(() => expect(screen.getAllByTestId('grid-item')).toHaveLength(1));
  });
});

describe('ItemDetail', () => {
  it('saves the for-trade switch', async () => {
    const db = await withDb([item('a', { album: 1, page: 1 })], <ItemDetail go={() => {}} id="a" />);
    await waitFor(() => expect(screen.getByLabelText(ru.forTrade)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(ru.forTrade));
    await waitFor(async () => expect((await getItem(db, 'a'))!.forTrade).toBe(true));
  });

  it('deletes after confirmation, including stamps inside', async () => {
    const go = vi.fn();
    const db = await withDb([item('blk', { kind: 'block', album: 1, page: 1 }), item('in', { parentId: 'blk' })], <ItemDetail go={go} id="blk" />);
    await waitFor(() => expect(screen.getByRole('button', { name: ru.delete })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: ru.delete }));
    fireEvent.click(screen.getByRole('button', { name: ru.confirmDelete }));
    await waitFor(async () => expect(await getItem(db, 'blk')).toBeUndefined());
    expect(await getItem(db, 'in')).toBeUndefined();
    expect(go).toHaveBeenCalled();
  });
});
