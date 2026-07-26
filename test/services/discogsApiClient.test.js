'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DiscogsApiClient } = require('../../src/services/DiscogsApiClient');

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

function makeStore(token) {
  return { getSettings: () => ({ discogsToken: token }) };
}

function fakeFetchJson(status, body) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    };
  };
  fn.calls = calls;
  return fn;
}

test('searchArtists: builds the correct query and maps candidates', async () => {
  const fetchFn = fakeFetchJson(200, {
    results: [{ id: 1, title: 'Blur (2)', thumb: 'x.jpg' }],
  });
  global.fetch = fetchFn;
  const client = new DiscogsApiClient(makeStore());

  const results = await client.searchArtists('Blur');

  const url = new URL(fetchFn.calls[0].url);
  assert.equal(url.searchParams.get('q'), 'Blur');
  assert.equal(url.searchParams.get('type'), 'artist');
  assert.deepEqual(results, [{ id: 1, type: 'artist', title: 'Blur (2)', year: null, format: '', country: null, thumb: 'x.jpg' }]);
});

test('searchLabels: builds the correct query and maps candidates', async () => {
  const fetchFn = fakeFetchJson(200, { results: [{ id: 5, title: 'Warp Records', thumb: null }] });
  global.fetch = fetchFn;
  const client = new DiscogsApiClient(makeStore());

  const results = await client.searchLabels('Warp');

  const url = new URL(fetchFn.calls[0].url);
  assert.equal(url.searchParams.get('type'), 'label');
  assert.deepEqual(results, [{ id: 5, type: 'label', title: 'Warp Records', year: null, format: '', country: null, thumb: null }]);
});

test('search requests include the stored Discogs token when present', async () => {
  const fetchFn = fakeFetchJson(200, { results: [] });
  global.fetch = fetchFn;
  const client = new DiscogsApiClient(makeStore('secret-token'));

  await client.searchArtists('Blur');

  const url = new URL(fetchFn.calls[0].url);
  assert.equal(url.searchParams.get('token'), 'secret-token');
});

test('search requests omit the token param entirely when none is stored', async () => {
  const fetchFn = fakeFetchJson(200, { results: [] });
  global.fetch = fetchFn;
  const client = new DiscogsApiClient(makeStore(undefined));

  await client.searchArtists('Blur');

  const url = new URL(fetchFn.calls[0].url);
  assert.equal(url.searchParams.has('token'), false);
});

test('a 429 response raises a rate-limit-specific error', async () => {
  global.fetch = fakeFetchJson(429, {});
  const client = new DiscogsApiClient(makeStore());

  await assert.rejects(() => client.searchArtists('Blur'), /rate limit/);
});

test('a non-ok response raises a generic error including the status code', async () => {
  global.fetch = fakeFetchJson(500, {});
  const client = new DiscogsApiClient(makeStore());

  await assert.rejects(() => client.searchArtists('Blur'), /500/);
});

test('searchArtists deduplicates results sharing the same id', async () => {
  global.fetch = fakeFetchJson(200, {
    results: [
      { id: 1, title: 'Blur', thumb: null },
      { id: 1, title: 'Blur', thumb: null },
      { id: 2, title: 'Blur (2)', thumb: null },
    ],
  });
  const client = new DiscogsApiClient(makeStore());

  const results = await client.searchArtists('Blur');
  assert.equal(results.length, 2);
});

test('searchAlbums: prefers master-type results and strips no artist prefix from them', async () => {
  let call = 0;
  global.fetch = async (url) => {
    call++;
    const u = new URL(url);
    assert.equal(u.searchParams.get('type'), 'master');
    return { status: 200, ok: true, json: async () => ({ results: [{ id: 10, title: 'Geogaddi', year: 2002, format: ['Vinyl'], country: 'UK', thumb: null }] }) };
  };
  const client = new DiscogsApiClient(makeStore());

  const results = await client.searchAlbums('Boards of Canada', 'Geogaddi');

  assert.equal(call, 1);
  assert.deepEqual(results, [
    { id: 10, type: 'master', title: 'Geogaddi', year: 2002, format: 'Vinyl', country: 'UK', thumb: null },
  ]);
});

test('searchAlbums: falls back to release search, grouping master_id hits and standalone releases', async () => {
  let call = 0;
  global.fetch = async (url) => {
    call++;
    const u = new URL(url);
    if (u.searchParams.get('type') === 'master') {
      return { status: 200, ok: true, json: async () => ({ results: [] }) };
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({
        results: [
          { id: 100, master_id: 55, title: 'Boards of Canada - Geogaddi', year: 2002, format: ['Vinyl'], country: 'UK', thumb: null },
          { id: 101, master_id: 55, title: 'Boards of Canada - Geogaddi', year: 2003, format: ['CD'], country: 'US', thumb: null },
          { id: 200, title: 'Boards of Canada - Rare 7"', year: 2004, format: ['Vinyl'], country: 'UK', thumb: null },
        ],
      }),
    };
  };
  const client = new DiscogsApiClient(makeStore());

  const results = await client.searchAlbums('Boards of Canada', 'Geogaddi');

  assert.equal(call, 2);
  assert.deepEqual(results, [
    { id: 55, type: 'master', title: 'Geogaddi', year: 2002, format: 'Vinyl', country: 'UK', thumb: null },
    { id: 200, type: 'release', title: 'Rare 7"', year: 2004, format: 'Vinyl', country: 'UK', thumb: null },
  ]);
});

test('searchAlbums: only strips the "Artist - " prefix, not an unrelated leading string', async () => {
  global.fetch = async (url) => {
    const u = new URL(url);
    if (u.searchParams.get('type') === 'master') return { status: 200, ok: true, json: async () => ({ results: [] }) };
    return {
      status: 200,
      ok: true,
      json: async () => ({
        results: [{ id: 300, title: 'Some Other Artist - Geogaddi', year: 2002, format: [], country: null, thumb: null }],
      }),
    };
  };
  const client = new DiscogsApiClient(makeStore());

  const results = await client.searchAlbums('Boards of Canada', 'Geogaddi');
  assert.equal(results[0].title, 'Some Other Artist - Geogaddi');
});
