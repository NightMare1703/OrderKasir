import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import id from './locales/id.json';

// Bahasa mengikuti setting app (tabel settings), bukan locale OS.
// Default Indonesia sampai fitur ganti bahasa (T3.9) menyimpan pilihan user.
export const DEFAULT_LANGUAGE = 'id' as const;

const resources = {
  id: { translation: id },
  en: { translation: en },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export const changeAppLanguage = async (lng: string): Promise<void> => {
  await i18n.changeLanguage(lng in resources ? lng : DEFAULT_LANGUAGE);
};

export default i18n;
