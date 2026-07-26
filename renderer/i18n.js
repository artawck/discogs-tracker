'use strict';

import i18next from '../node_modules/i18next/dist/esm/i18next.js';
import translations from './translations.json' with { type: 'json' };

/**
 * Initializes the renderer's i18next instance. Keys are kept flat
 * (dot-in-key, e.g. "table.artist") rather than i18next's usual
 * nested-namespace convention, since they're shared verbatim with the main
 * process's own i18next instance via renderer/translations.json.
 */
export async function createI18n(initialLanguage) {
  await i18next.init({
    lng: initialLanguage || 'en',
    fallbackLng: 'en',
    resources: translations,
    keySeparator: false,
    interpolation: { escapeValue: false },
  });
  return i18next;
}
