'use strict';

require('../discogsLibPaths');

// Sourced directly from discogs-marketplace-api-nodejs's own country table
// (name -> ISO code), the same table it uses internally to translate a
// country into Discogs' "ships_from" query value. Reusing it guarantees our
// country picker and the library's own filtering agree on names and codes.
const DISCOGS_LIB_COUNTRY_TABLE = require('data/country.data').default;

/** Static lookup over the country names/codes Discogs' marketplace understands. */
class CountryCatalog {
  static #names = Object.keys(DISCOGS_LIB_COUNTRY_TABLE).sort((a, b) => a.localeCompare(b));

  /** @returns {string[]} every selectable country name, alphabetically sorted. */
  static all() {
    return CountryCatalog.#names;
  }

  /** @returns {string|undefined} the 2-letter ISO code for a Discogs country name. */
  static codeFor(name) {
    return DISCOGS_LIB_COUNTRY_TABLE[name];
  }
}

module.exports = { CountryCatalog };
