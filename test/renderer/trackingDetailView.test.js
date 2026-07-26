'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installJsdom, uninstallJsdom } = require('../helpers/jsdomEnv');
const { fakeApp } = require('../helpers/fakeRendererApp');

let TrackingDetailView;
let AppState;

test.before(async () => {
  installJsdom(); // only to resolve the dynamic imports below; each test gets its own fresh DOM
  ({ TrackingDetailView } = await import('../../renderer/views/TrackingDetailView.js'));
  ({ AppState } = await import('../../renderer/state/AppState.js'));
  uninstallJsdom();
});

// A fresh DOM per test: view classes attach event listeners to real elements
// in wireEvents(), and a DOM shared across tests would leak those listeners
// (stale closures from earlier tests firing on later tests' clicks).
test.beforeEach(() => {
  installJsdom();
});

test.afterEach(() => {
  uninstallJsdom();
});

function tracking(overrides = {}) {
  return {
    id: 't1',
    mode: 'artist',
    artist: 'Boards of Canada',
    album: null,
    country: 'Any',
    lastCheckedAt: null,
    lastError: null,
    items: [],
    ...overrides,
  };
}

function item(overrides = {}) {
  return {
    id: 'i1',
    artist: 'Boards of Canada',
    edition: 'Geogaddi',
    format: 'Vinyl',
    price: '$10',
    shipping: null,
    condition: 'Near Mint (NM or M-)',
    sleeveCondition: 'Very Good (VG)',
    label: 'Warp',
    catno: 'WARPLP1',
    seller: 'seller1',
    country: 'UK',
    listingUrl: 'https://discogs.com/sell/item/1',
    ...overrides,
  };
}

test('render(): with nothing selected, shows the empty state and hides the detail panel', () => {
  const state = new AppState();
  new TrackingDetailView(fakeApp({ state })).render();

  assert.equal(document.getElementById('emptyState').classList.contains('hidden'), false);
  assert.equal(document.getElementById('trackingDetail').classList.contains('hidden'), true);
});

test('render(): with a tracking selected, shows the panel with title, meta and rows', () => {
  const state = new AppState();
  state.trackings = [tracking({ items: [item({ id: 'a' }), item({ id: 'b' })] })];
  state.selectedId = 't1';
  new TrackingDetailView(fakeApp({ state })).render();

  assert.equal(document.getElementById('emptyState').classList.contains('hidden'), true);
  assert.equal(document.getElementById('trackingDetail').classList.contains('hidden'), false);
  assert.match(document.getElementById('detailTitle').innerHTML, /Boards of Canada/);
  assert.equal(document.querySelectorAll('#listingsBody tr').length, 2);
  assert.equal(document.getElementById('noListings').classList.contains('hidden'), true);
});

test('render(): an empty items list shows the "no listings" message', () => {
  const state = new AppState();
  state.trackings = [tracking({ items: [] })];
  state.selectedId = 't1';
  new TrackingDetailView(fakeApp({ state })).render();

  assert.equal(document.getElementById('noListings').classList.contains('hidden'), false);
});

test('render(): shows the last-check error banner when lastError is set', () => {
  const state = new AppState();
  state.trackings = [tracking({ lastError: 'scrape failed' })];
  state.selectedId = 't1';
  new TrackingDetailView(fakeApp({ state })).render();

  const err = document.getElementById('detailError');
  assert.equal(err.classList.contains('hidden'), false);
  assert.match(err.textContent, /scrape failed/);
});

test('render(): rows for items newly seen this session get the "is-new" class', () => {
  const state = new AppState();
  state.trackings = [tracking({ items: [item({ id: 'a' }), item({ id: 'b' })] })];
  state.selectedId = 't1';
  state.newIdsByTracking['t1'] = new Set(['b']);
  new TrackingDetailView(fakeApp({ state })).render();

  const rows = document.querySelectorAll('#listingsBody tr');
  assert.equal(rows[0].classList.contains('is-new'), false);
  assert.equal(rows[1].classList.contains('is-new'), true);
});

test('clicking a sortable header sorts ascending, then descending on a second click', () => {
  const state = new AppState();
  state.trackings = [
    tracking({
      items: [item({ id: 'a', seller: 'zeta' }), item({ id: 'b', seller: 'alpha' }), item({ id: 'c', seller: 'mid' })],
    }),
  ];
  state.selectedId = 't1';
  const view = new TrackingDetailView(fakeApp({ state }));
  view.wireEvents();
  view.render();

  const sellerHeader = document.querySelector('#listingsHeaderRow th[data-col="seller"]');
  sellerHeader.click();
  let sellers = [...document.querySelectorAll('#listingsBody tr')].map((tr) => tr.querySelector('td:nth-child(8)').textContent);
  assert.deepEqual(sellers, ['alpha', 'mid', 'zeta']);
  assert.deepEqual(state.sort, { col: 'seller', dir: 'asc' });

  sellerHeader.click();
  sellers = [...document.querySelectorAll('#listingsBody tr')].map((tr) => tr.querySelector('td:nth-child(8)').textContent);
  assert.deepEqual(sellers, ['zeta', 'mid', 'alpha']);
  assert.deepEqual(state.sort, { col: 'seller', dir: 'desc' });
});

test('sorting by price parses numeric values and pushes non-numeric/missing ones last', () => {
  const state = new AppState();
  state.trackings = [
    tracking({
      items: [
        item({ id: 'a', price: '20' }),
        item({ id: 'b', price: '5' }),
        item({ id: 'c', price: '10' }),
        item({ id: 'd', price: null }),
        item({ id: 'e', price: '$3' }), // parseFloat can't parse a leading '$' — treated as missing too
      ],
    }),
  ];
  state.selectedId = 't1';
  const view = new TrackingDetailView(fakeApp({ state }));
  view.wireEvents();
  view.render();

  document.querySelector('#listingsHeaderRow th[data-col="price"]').click();
  const order = [...document.querySelectorAll('#listingsBody tr')].map((tr) => tr.querySelector('td:nth-child(3)').textContent);
  assert.deepEqual(order, ['5', '10', '20', '—', '$3']);
});

test('sorting by condition ranks known values and pushes unrecognized/missing values last', () => {
  const state = new AppState();
  state.trackings = [
    tracking({
      items: [
        item({ id: 'a', condition: 'Good (G)' }),
        item({ id: 'b', condition: null }),
        item({ id: 'c', condition: 'Mint (M)' }),
        item({ id: 'd', condition: 'Some Unknown Grade' }),
      ],
    }),
  ];
  state.selectedId = 't1';
  const view = new TrackingDetailView(fakeApp({ state }));
  view.wireEvents();
  view.render();

  document.querySelector('#listingsHeaderRow th[data-col="condition"]').click();
  const order = [...document.querySelectorAll('#listingsBody tr')].map((tr) => tr.querySelector('td:nth-child(4)').textContent);
  // Sort rank treats an unrecognized condition string the same as a missing
  // one (both push to the end), but row rendering only substitutes the em
  // dash for a falsy value — the unrecognized string still displays as-is.
  assert.deepEqual(order, ['Good (G)', 'Mint (M)', '—', 'Some Unknown Grade']);
});

test('renderSortIndicators(): shows an arrow only on the active sort column', () => {
  const state = new AppState();
  state.trackings = [tracking()];
  state.selectedId = 't1';
  state.sort = { col: 'seller', dir: 'desc' };
  new TrackingDetailView(fakeApp({ state })).render();

  const sellerHeader = document.querySelector('#listingsHeaderRow th[data-col="seller"]');
  const artistHeader = document.querySelector('#listingsHeaderRow th[data-col="artist"]');
  assert.match(sellerHeader.querySelector('.arrow').textContent, /▼/);
  assert.equal(artistHeader.querySelector('.arrow').textContent, '');
});

test('clicking the "open link" anchor delegates to app.api.openLink with the item URL, not real navigation', () => {
  const state = new AppState();
  state.trackings = [tracking({ items: [item({ id: 'a', listingUrl: 'https://discogs.com/sell/item/99' })] })];
  state.selectedId = 't1';
  let openedUrl;
  new TrackingDetailView(fakeApp({ state, api: { openLink: (url) => (openedUrl = url) } })).render();

  document.querySelector('.open-link').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(openedUrl, 'https://discogs.com/sell/item/99');
});

test('clicking "Remove" clears selection and re-renders both list and detail', async () => {
  const state = new AppState();
  state.trackings = [tracking()];
  state.selectedId = 't1';
  let removedId;
  const listRenderCalls = [];
  const app = fakeApp({
    state,
    api: { removeTracking: async (id) => { removedId = id; return []; } },
    trackingList: { render: () => listRenderCalls.push('render') },
  });
  const view = new TrackingDetailView(app);
  view.wireEvents();
  view.render();

  document.getElementById('removeTrackingBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(removedId, 't1');
  assert.equal(state.selectedId, null);
  assert.deepEqual(listRenderCalls, ['render']);
  assert.equal(document.getElementById('trackingDetail').classList.contains('hidden'), true);
});
