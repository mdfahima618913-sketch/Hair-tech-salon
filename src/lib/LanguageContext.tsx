import React, { createContext, useContext, useState } from 'react';
import T, { type Lang, type TKey } from './translations';

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
  toggle: () => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => T[key].en,
  toggle: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('hairtech_lang') as Lang) ?? 'en'; }
    catch { return 'en'; }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('hairtech_lang', l); } catch {}
  };

  const toggle = () => setLang(lang === 'en' ? 'hi' : 'en');

  const t = (key: TKey): string => T[key]?.[lang] ?? T[key]?.en ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
