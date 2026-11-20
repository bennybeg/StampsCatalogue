// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App';
import { ru } from './i18n/ru';
import { en } from './i18n/en';

afterEach(() => cleanup());

describe('App', () => {
  it('starts in Russian and remembers a switch to English', () => {
    localStorage.clear();
    const first = render(<App />);
    expect(screen.getByRole('button', { name: ru.homeCheck })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ru.switchLanguage }));
    expect(screen.getByRole('button', { name: en.homeCheck })).toBeTruthy();
    first.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: en.homeCheck })).toBeTruthy();
  });
});
