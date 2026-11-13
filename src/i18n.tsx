// Language for the public pages (landing, login, sign-up). The dashboard is English for now.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'ar';

const STORAGE_KEY = 'syncave_lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/** Picks the current language's entry from a { en, ar } dictionary. */
export function useCopy<T>(dict: { en: T; ar: T }): T {
  return dict[useLang().lang];
}

/** Applies lang/dir to <html>. Public pages follow the chosen language; the dashboard stays LTR English. */
export function applyDocumentLanguage(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function LangToggle({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { lang, setLang } = useLang();
  const colors = tone === 'dark'
    ? 'text-white/80 hover:text-white hover:bg-white/10'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      className={`px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${colors} ${className}`}
      lang={lang === 'ar' ? 'en' : 'ar'}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
    >
      {lang === 'ar' ? 'English' : 'العربية'}
    </button>
  );
}
