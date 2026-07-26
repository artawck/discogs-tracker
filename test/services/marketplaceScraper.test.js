'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../../src/discogsLibPaths');
const { DiscogsMarketplace } = require('discogs-marketplace-api-nodejs');
const { MarketplaceScraper } = require('../../src/services/MarketplaceScraper');

const originalSearch = DiscogsMarketplace.search;

test.afterEach(() => {
  DiscogsMarketplace.search = originalSearch;
});

function rawItem(overrides = {}) {
  return {
    id: 1,
    artists: [{ name: 'Boards of Canada' }],
    release: { name: 'Geogaddi', url: 'https://discogs.com/release/1' },
    title: 'fallback title',
    formats: ['Vinyl', 'LP'],
    url: 'https://discogs.com/sell/item/1',
    price: { base: '$10', shipping: '$5' },
    condition: { media: { full: 'Near Mint (NM or M-)' }, sleeve: { full: 'Very Good (VG)' } },
    labels: [{ name: 'Warp' }],
    catnos: ['WARPLP1'],
    seller: { name: 'seller1' },
    country: { name: 'United Kingdom', code: 'GB' },
    listedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function onePageResult(items) {
  return { items, page: { total: 1 } };
}

test('fetchListings: normalizes items from a single page, release scope', async () => {
  const calls = [];
  DiscogsMarketplace.search = async (params) => {
    calls.push(params);
    return onePageResult([rawItem()]);
  };

  const scraper = new MarketplaceScraper();
  const items = await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'Any' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].releaseId, '1');
  assert.equal(calls[0].from, undefined);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    id: '1',
    artist: 'Boards of Canada',
    edition: 'Geogaddi',
    format: 'Vinyl, LP',
    releaseUrl: 'https://discogs.com/release/1',
    listingUrl: 'https://discogs.com/sell/item/1',
    price: '$10',
    shipping: '$5',
    condition: 'Near Mint (NM or M-)',
    sleeveCondition: 'Very Good (VG)',
    label: 'Warp',
    catno: 'WARPLP1',
    seller: 'seller1',
    country: 'United Kingdom',
    listedAt: '2024-01-01T00:00:00Z',
  });
});

test('fetchListings: master/artist/label ids are routed to their respective params', async () => {
  const calls = [];
  DiscogsMarketplace.search = async (params) => {
    calls.push(params);
    return onePageResult([]);
  };
  const scraper = new MarketplaceScraper();

  await scraper.fetchListings({ discogsType: 'master', discogsId: 'm1', country: 'Any' });
  await scraper.fetchListings({ discogsType: 'artist', discogsId: 'a1', country: 'Any' });
  await scraper.fetchListings({ discogsType: 'label', discogsId: 'l1', country: 'Any' });

  assert.equal(calls[0].masterId, 'm1');
  assert.equal(calls[1].artistId, 'a1');
  assert.equal(calls[2].labelId, 'l1');
});

test('fetchListings: a resolvable country name is sent server-side as a code, and results are trusted', async () => {
  const calls = [];
  DiscogsMarketplace.search = async (params) => {
    calls.push(params);
    return onePageResult([rawItem({ country: { name: 'United Kingdom', code: 'GB' } })]);
  };
  const scraper = new MarketplaceScraper();

  const items = await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'United Kingdom' });

  assert.equal(calls[0].from, 'GB');
  assert.equal(items.length, 1);
});

test('fetchListings: server-side filter results are still re-checked client-side by country code', async () => {
  DiscogsMarketplace.search = async () =>
    onePageResult([
      rawItem({ id: 1, country: { name: 'United Kingdom', code: 'GB' } }),
      rawItem({ id: 2, country: { name: 'Germany', code: 'DE' } }),
    ]);
  const scraper = new MarketplaceScraper();

  const items = await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'United Kingdom' });

  assert.deepEqual(items.map((i) => i.id), ['1']);
});

test('fetchListings: an unresolvable country name falls back to client-side name filtering', async () => {
  DiscogsMarketplace.search = async (params) => {
    assert.equal(params.from, undefined); // no code found -> no server-side filter param
    return onePageResult([
      rawItem({ id: 1, country: { name: 'Neverland', code: undefined } }),
      rawItem({ id: 2, country: { name: 'Germany', code: 'DE' } }),
    ]);
  };
  const scraper = new MarketplaceScraper();

  const items = await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'Neverland' });

  assert.deepEqual(items.map((i) => i.id), ['1']);
});

test('fetchListings: "Any" country applies no filtering at all', async () => {
  DiscogsMarketplace.search = async () =>
    onePageResult([rawItem({ id: 1, country: { name: 'Germany', code: 'DE' } })]);
  const scraper = new MarketplaceScraper();

  const items = await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'Any' });
  assert.equal(items.length, 1);
});

test('fetchListings: paginates a release scope up to its 5-page cap', async () => {
  let calls = 0;
  DiscogsMarketplace.search = async (params) => {
    calls++;
    return { items: [rawItem({ id: params.page })], page: { total: 10 } }; // claims more pages than the cap allows
  };
  const scraper = new MarketplaceScraper();

  const items = await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'Any' });
  assert.equal(calls, 5);
  assert.equal(items.length, 5);
});

test('fetchListings: paginates an artist/label scope up to its 50-page cap', async () => {
  let calls = 0;
  DiscogsMarketplace.search = async (params) => {
    calls++;
    return { items: [rawItem({ id: params.page })], page: { total: 999 } };
  };
  const scraper = new MarketplaceScraper();

  await scraper.fetchListings({ discogsType: 'artist', discogsId: '1', country: 'Any' });
  assert.equal(calls, 50);
});

test('fetchListings: stops paginating early once the reported total page count is reached', async () => {
  let calls = 0;
  DiscogsMarketplace.search = async (params) => {
    calls++;
    return { items: [rawItem({ id: params.page })], page: { total: 2 } };
  };
  const scraper = new MarketplaceScraper();

  await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'Any' });
  assert.equal(calls, 2);
});

test('fetchListings: missing optional fields normalize to null/empty rather than throwing', async () => {
  DiscogsMarketplace.search = async () =>
    onePageResult([
      {
        id: 42,
        artists: [],
        release: null,
        title: 'Standalone Title',
        formats: [],
        url: 'https://discogs.com/sell/item/42',
        price: {},
        condition: {},
        labels: [],
        catnos: [],
        seller: null,
        country: null,
        listedAt: null,
      },
    ]);
  const scraper = new MarketplaceScraper();

  const items = await scraper.fetchListings({ discogsType: 'release', discogsId: '1', country: 'Any' });
  assert.deepEqual(items[0], {
    id: '42',
    artist: null,
    edition: 'Standalone Title',
    format: '',
    releaseUrl: null,
    listingUrl: 'https://discogs.com/sell/item/42',
    price: null,
    shipping: null,
    condition: null,
    sleeveCondition: null,
    label: null,
    catno: null,
    seller: null,
    country: null,
    listedAt: null,
  });
});
