'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CountryCatalog } = require('../../src/services/CountryCatalog');

test('all() returns a non-empty, alphabetically sorted list of country names', () => {
  const names = CountryCatalog.all();
  assert.ok(names.length > 100);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
});

test('codeFor() resolves a plain country name to its ISO code', () => {
  assert.equal(CountryCatalog.codeFor('Germany'), 'DE');
});

test('codeFor() returns undefined for an unknown name', () => {
  assert.equal(CountryCatalog.codeFor('Not A Real Country'), undefined);
});

test('verified Discogs aliases are present and resolve to a code', () => {
  for (const alias of ['United Kingdom', 'United States', 'South Korea', 'Taiwan']) {
    assert.ok(CountryCatalog.codeFor(alias), `expected a code for ${alias}`);
  }
});

test('reverse (code -> verified alias) lookup prefers the Discogs-verified name over the ISO name', () => {
  // Reproduces the library's own reverse-lookup algorithm: the first key
  // (in the table's current iteration order) whose value matches the code.
  const table = require('data/country.data').default;
  const gbCode = CountryCatalog.codeFor('United Kingdom');
  const reverseMatch = Object.keys(table).find((key) => table[key] === gbCode);
  assert.equal(reverseMatch, 'United Kingdom');

  const usCode = CountryCatalog.codeFor('United States');
  const usReverseMatch = Object.keys(table).find((key) => table[key] === usCode);
  assert.equal(usReverseMatch, 'United States');
});
