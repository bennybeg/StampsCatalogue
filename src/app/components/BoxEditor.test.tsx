// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { ru } from '../i18n/ru';
import { BoxEditor, type EditBox } from './BoxEditor';

afterEach(() => cleanup());

const boxes: EditBox[] = [
  { key: 'a', box: { x: 100, y: 100, w: 200, h: 300 }, kind: 'single', inner: [] },
  { key: 'b', box: { x: 500, y: 100, w: 200, h: 300 }, kind: 'single', inner: [], unresolved: true },
];

function setup(props: Partial<Parameters<typeof BoxEditor>[0]> = {}) {
  const onChange = vi.fn(), onPick = vi.fn(), onTapEmpty = vi.fn();
  render(
    <I18nProvider>
      <BoxEditor photoUrl="blob:x" width={1000} height={1000} displayWidth={500} boxes={boxes} mode="edit"
        onChange={onChange} onPick={onPick} onTapEmpty={onTapEmpty} {...props} />
    </I18nProvider>,
  );
  return { onChange, onPick, onTapEmpty };
}

describe('BoxEditor', () => {
  it('selects a box and deletes it', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('box-a'));
    fireEvent.click(screen.getByRole('button', { name: ru.delete }));
    expect(onChange).toHaveBeenLastCalledWith([boxes[1]]);
  });

  it('changes the kind of the selected box', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('box-a'));
    fireEvent.click(screen.getByRole('button', { name: ru.kindCover }));
    expect(onChange.mock.lastCall![0][0].kind).toBe('cover');
  });

  it('reports taps on empty photo in photo coordinates', () => {
    const { onTapEmpty } = setup();
    fireEvent.click(screen.getByTestId('photo-surface'), { clientX: 100, clientY: 50 });
    expect(onTapEmpty).toHaveBeenCalledWith(200, 100);
  });

  it('labels unresolved boxes', () => {
    setup();
    expect(screen.getByText(ru.needsSplit)).toBeTruthy();
  });

  it('picks a box in pick mode without a toolbar', () => {
    const { onPick } = setup({ mode: 'pick' });
    fireEvent.click(screen.getByTestId('box-a'));
    expect(onPick).toHaveBeenCalledWith(boxes[0]);
    expect(screen.queryByRole('button', { name: ru.delete })).toBeNull();
  });
});
