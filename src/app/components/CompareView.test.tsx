// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { ru } from '../i18n/ru';
import { CompareView } from './CompareView';

afterEach(() => cleanup());
const view = (edgesDiffer: boolean) =>
  render(<I18nProvider><CompareView left="a.jpg" right="b.jpg" edgesDiffer={edgesDiffer} onClose={() => {}} /></I18nProvider>);

describe('CompareView', () => {
  it('shows the edges banner only when edges differ', () => {
    view(false);
    expect(screen.queryByText(ru.edgesDiffer)).toBeNull();
    cleanup();
    view(true);
    expect(screen.getByText(ru.edgesDiffer)).toBeTruthy();
  });
  it('zooms both images to 3x on the edges button', () => {
    view(false);
    fireEvent.click(screen.getByRole('button', { name: ru.zoomEdges }));
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(2);
    for (const i of imgs) expect(i.style.transform).toContain('scale(3)');
  });
});
