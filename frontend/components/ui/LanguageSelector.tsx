import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext.js';
import { Globe } from 'lucide-react';
import { LanguageCode } from '../../i18n/types.js';

export const LanguageSelector: React.FC = () => {
  const { language, setLanguage, languages } = useTranslation();

  return (
    <div className="relative flex items-center text-left">
      <Globe className="w-3.5 h-3.5 text-cyan-400 absolute left-3 pointer-events-none z-10" />
      <select
        id="select-language-dropdown"
        value={language}
        onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        aria-label="Select Language"
        className="bg-slate-900/90 border border-slate-700/80 text-cyan-300 text-xs rounded-xl pl-8 pr-7 h-[34px] focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold cursor-pointer transition-all shadow-sm"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code} className="bg-slate-900 text-slate-100 py-1 font-medium">
            {lang.nativeName} {lang.code !== 'en' ? `(${lang.name})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
};
