import { describe, it, expect } from 'vitest';
import { ru } from './i18n/ru';
import { en } from './i18n/en';

describe('dictionaries', () => {
  it('have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });
  it('have no empty strings', () => {
    for (const d of [ru, en]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
  });
});
