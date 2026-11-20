import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ru } from './i18n/ru';
import { en } from './i18n/en';

export type Lang = 'ru' | 'en';
export type Key = keyof typeof ru;
const DICTS: Record<Lang, Record<Key, string>> = { ru, en };

function readLang(): Lang {
  try { return localStorage.getItem('lang') === 'en' ? 'en' : 'ru'; } catch { return 'ru'; }
}

type Ctx = { t(key: Key, vars?: Record<string, string | number>): string; lang: Lang; setLang(l: Lang): void };
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch { /* storage unavailable: keep in memory */ }
  }, []);
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => {
    let s = DICTS[lang][key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }, [lang]);
  const value = useMemo(() => ({ t, lang, setLang }), [t, lang, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useT(): Ctx {
  const c = useContext(I18n);
  if (!c) throw new Error('useT outside I18nProvider');
  return c;
}
