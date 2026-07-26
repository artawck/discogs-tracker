'use strict';

/**
 * Minimal fake i18next-shaped object for classes that only ever call `t(key, vars)`.
 * Returns the key itself (with interpolated vars appended) instead of a real
 * translation, so tests can assert on which key/vars a class asked to translate.
 */
function fakeI18n() {
  return {
    language: 'en',
    t(key, vars) {
      return vars ? `${key}${JSON.stringify(vars)}` : key;
    },
  };
}

module.exports = { fakeI18n };
