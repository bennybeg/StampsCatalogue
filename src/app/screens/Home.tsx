import { useT } from '../i18n';

export function Home({ go, unfiledCount = 0 }: { go(path: string): void; unfiledCount?: number }) {
  const { t, lang, setLang } = useT();
  return (
    <main className="screen home">
      <h1>{t('appTitle')}</h1>
      <button className="big primary" onClick={() => go('/check')}>{t('homeCheck')}</button>
      <button className="big" onClick={() => go('/page')}>{t('homeCapture')}</button>
      <button className="big" onClick={() => go('/unfiled')}>
        {t('homeUnfiled')}{unfiledCount > 0 && <span className="badge" aria-hidden="true"> {unfiledCount}</span>}
      </button>
      <button className="big" onClick={() => go('/browse')}>{t('homeBrowse')}</button>
      <button className="big" onClick={() => go('/backup')}>{t('homeBackup')}</button>
      <button className="link" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>{t('switchLanguage')}</button>
    </main>
  );
}
