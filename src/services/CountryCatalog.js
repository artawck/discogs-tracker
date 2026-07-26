'use strict';

require('../discogsLibPaths');

// Sourced directly from discogs-marketplace-api-nodejs's own country table
// (name -> ISO code), the same table it uses internally to translate a
// country into Discogs' "ships_from" query value. Reusing it guarantees our
// country picker and the library's own filtering agree on names and codes.
const DISCOGS_LIB_COUNTRY_TABLE = require('data/country.data').default;

/**
 * Names in the table above that the upstream library's own maintainer
 * scraped directly from Discogs' live seller-country <select> element (see
 * that library's data/country.data.ts) — i.e. these are verified-working
 * `ships_from` filter values, as opposed to the ISO 3166 short names that
 * make up the rest of the table.
 */
const DISCOGS_VERIFIED_ALIASES = [
  'Azerbaidjan', 'Bolivia', 'Bosnia-Herzegovina', 'Cape Verde', 'Czech Republic', 'East Timor',
  'Falkland Islands', 'Former Czechoslovakia', 'Former USSR', 'France (European Territory)',
  'French Guyana', 'Guadeloupe (French)', 'Guam (USA)', 'Guinea Bissau', 'Heard and McDonald Islands',
  'Iran', "Ivory Coast (Cote D'Ivoire)", 'Laos', 'Macau', 'Macedonia', 'Martinique (French)',
  'Micronesia', 'Netherlands Antilles', 'Neutral Zone', 'New Caledonia (French)', 'Pitcairn Island',
  'Polynesia (French)', 'Reunion (French)', 'S. Georgia & S. Sandwich Isls.', 'Saint Helena',
  'Saint Kitts & Nevis Anguilla', 'Saint Tome (Sao Tome) and Princi', 'Saint Vincent & Grenadines',
  'Slovak Republic', 'South Korea', 'Spain (Canary Islands)', 'Svalbard and Jan Mayen Islands',
  'Swaziland', 'Syria', 'Tadjikistan', 'Taiwan', 'Tanzania', 'United Kingdom', 'Northern Ireland',
  'United Kingdom (Channel Islands)', 'United States', 'USA Minor Outlying Islands',
  'Vatican City State', 'Venezuela', 'Vietnam', 'Virgin Islands (USA)', 'Wallis and Futuna Islands',
  'Yugoslavia', 'Zaire',
];

/**
 * Fixes a real bug in the upstream library: when it translates a country
 * code back into a `ships_from` query value, it does
 * `Object.keys(Country).find(key => code === Country[key])` — the FIRST
 * matching key, in insertion order. Since its table is built as
 * `{...CountryIso, ...CountryDiscogs}`, the ISO name always comes first for
 * any country that has both, so the library always sends the ISO name...
 * which the live discogs.com site frequently doesn't recognize (verified
 * directly: `ships_from=United Kingdom of Great Britain and Northern
 * Ireland` returns zero results server-side, `ships_from=United Kingdom`
 * works). This affects 51 of the ~300 country codes, including common ones
 * like US, GB, Taiwan and South Korea — not an edge case.
 *
 * The fix: reorder the *shared* table object in place (mutating it, not
 * replacing it, since other code — including the library itself — already
 * holds a reference to this exact object) so every ISO name that collides
 * with a verified alias moves to the end of iteration order. The alias,
 * untouched, then wins the `.find()` lookup. This only affects the
 * library's internal reverse (code -> name) lookup; forward lookups
 * (name -> code, used by codeFor() below) and the set of selectable names
 * (used by all()) are unaffected — nothing is added or removed, only
 * reordered.
 */
function preferVerifiedAliasesForReverseLookup(table) {
  const aliasCodes = new Set(DISCOGS_VERIFIED_ALIASES.map((name) => table[name]).filter(Boolean));
  const isoKeysToDemote = Object.keys(table).filter(
    (key) => !DISCOGS_VERIFIED_ALIASES.includes(key) && aliasCodes.has(table[key]),
  );
  for (const key of isoKeysToDemote) {
    const value = table[key];
    delete table[key];
    table[key] = value; // re-inserting moves it to the end of iteration order
  }
}

preferVerifiedAliasesForReverseLookup(DISCOGS_LIB_COUNTRY_TABLE);

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
