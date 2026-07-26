'use strict';

const i18next = require('i18next');
const translations = require('../renderer/translations.json');

/**
 * Initializes the main process's i18next instance. Kept flat (dot-in-key)
 * rather than i18next's usual nested-namespace convention, since these keys
 * are shared verbatim with the renderer's own i18next instance via
 * renderer/translations.json.
 */
async function initI18n(initialLanguage) {
  await i18next.init({
    lng: initialLanguage || 'en',
    fallbackLng: 'en',
    resources: translations,
    keySeparator: false,
    interpolation: { escapeValue: false },
  });
  return i18next;
}

module.exports = { initI18n, i18next };
