import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LanguageCode, SUPPORTED_LANGUAGES, LanguageInfo } from './types.js';

import en from './locales/en.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import te from './locales/te.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';
import gu from './locales/gu.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';
import pa from './locales/pa.json';

const dictionaries: Record<LanguageCode, any> = {
  en,
  hi,
  bn,
  te,
  mr,
  ta,
  gu,
  kn,
  ml,
  pa,
};

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  languages: LanguageInfo[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'truthseal_language';

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (saved in dictionaries)) {
        return saved as LanguageCode;
      }
    } catch (_e) {}
    return 'en';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
      document.documentElement.lang = language;
    } catch (_e) {}
  }, [language]);

  const setLanguage = (lang: LanguageCode) => {
    if (dictionaries[lang]) {
      setLanguageState(lang);
    }
  };

  const getNestedValue = (obj: any, path: string): string | undefined => {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return typeof current === 'string' ? current : undefined;
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    let rawText = getNestedValue(dictionaries[language], key);

    if (rawText === undefined && language !== 'en') {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[i18n] Key '${key}' missing in '${language}', falling back to English.`);
      }
      rawText = getNestedValue(dictionaries['en'], key);
    }

    if (rawText === undefined) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[i18n] Key '${key}' missing in master English dictionary.`);
      }
      return key;
    }

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        rawText = rawText.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }
    }

    return rawText;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
