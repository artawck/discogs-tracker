'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TrackingChecker } = require('../../src/services/TrackingChecker');

function makeTracking(overrides = {}) {
  return {
    id: 't1',
    releaseTitle: 'Some Release',
    discogsType: 'release',
    discogsId: '123',
    country: 'Any',
    baselineEstablished: false,
    seenListingIds: [],
    ...overrides,
  };
}

/** Fake store: in-memory list of trackings + recorded updateTrackingResult calls. */
function makeStore(trackings) {
  const calls = [];
  return {
    trackings,
    calls,
    getTrackings() {
      return this.trackings;
    },
    getTracking(id) {
      return this.trackings.find((t) => t.id === id);
    },
    async updateTrackingResult(id, patch) {
      calls.push({ id, patch });
      const idx = this.trackings.findIndex((t) => t.id === id);
      if (idx === -1) return null; // simulates "removed while in flight"
      const updated = { ...this.trackings[idx], ...patch, baselineEstablished: true };
      if (patch.items) {
        updated.seenListingIds = patch.items.map((i) => i.id);
      }
      this.trackings[idx] = updated;
      return { tracking: updated, newItems: [] };
    },
  };
}

function makeScraper(itemsOrFn) {
  return {
    calls: [],
    async fetchListings(params) {
      this.calls.push(params);
      if (typeof itemsOrFn === 'function') return itemsOrFn(params);
      return itemsOrFn;
    },
  };
}

test('runAllChecks: first check establishes a baseline and reports no new items', async () => {
  const tracking = makeTracking();
  const store = makeStore([tracking]);
  const scraper = makeScraper([{ id: 'a' }, { id: 'b' }]);
  const checker = new TrackingChecker(store, scraper);

  const summaries = await checker.runAllChecks();

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].error, null);
  assert.deepEqual(summaries[0].newItems, []);
  assert.equal(store.calls[0].patch.items.length, 2);
});

test('runAllChecks: a subsequent check reports only items not seen before', async () => {
  const tracking = makeTracking({ baselineEstablished: true, seenListingIds: ['a'] });
  const store = makeStore([tracking]);
  const scraper = makeScraper([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const checker = new TrackingChecker(store, scraper);

  const summaries = await checker.runAllChecks();

  assert.deepEqual(
    summaries[0].newItems.map((i) => i.id),
    ['b', 'c']
  );
});

test('runAllChecks: one tracking failing does not stop the rest, and records the error', async () => {
  const good = makeTracking({ id: 'good' });
  const bad = makeTracking({ id: 'bad' });
  const store = makeStore([bad, good]);
  let callCount = 0;
  const scraper = makeScraper(() => {
    callCount++;
    if (callCount === 1) throw new Error('scrape failed'); // fails for the first tracking checked ("bad")
    return [{ id: 'x' }];
  });
  const checker = new TrackingChecker(store, scraper);

  const summaries = await checker.runAllChecks();

  assert.equal(summaries.length, 2);
  const badSummary = summaries.find((s) => s.tracking.id === 'bad');
  const goodSummary = summaries.find((s) => s.tracking.id === 'good');
  assert.equal(badSummary.error, 'scrape failed');
  assert.equal(goodSummary.error, null);
});

test('runAllChecks: calls onProgress with checking/done for a successful check', async () => {
  const tracking = makeTracking();
  const store = makeStore([tracking]);
  const scraper = makeScraper([{ id: 'a' }]);
  const checker = new TrackingChecker(store, scraper);

  const events = [];
  await checker.runAllChecks({ onProgress: (evt) => events.push(evt.status) });

  assert.deepEqual(events, ['checking', 'done']);
});

test('runAllChecks: calls onProgress with checking/error for a failing check', async () => {
  const tracking = makeTracking();
  const store = makeStore([tracking]);
  const scraper = {
    async fetchListings() {
      throw new Error('boom');
    },
  };
  const checker = new TrackingChecker(store, scraper);

  const events = [];
  await checker.runAllChecks({ onProgress: (evt) => events.push(evt.status) });

  assert.deepEqual(events, ['checking', 'error']);
});

test('runAllChecks: a tracking removed mid-flight (store returns null) is silently skipped', async () => {
  const tracking = makeTracking();
  const store = makeStore([tracking]);
  store.updateTrackingResult = async () => null;
  const scraper = makeScraper([{ id: 'a' }]);
  const checker = new TrackingChecker(store, scraper);

  const summaries = await checker.runAllChecks();
  assert.deepEqual(summaries, []);
});

test('runSingleCheck: throws when the tracking does not exist', async () => {
  const store = makeStore([]);
  const scraper = makeScraper([]);
  const checker = new TrackingChecker(store, scraper);

  await assert.rejects(() => checker.runSingleCheck('missing'), /Tracking not found/);
});

test('runSingleCheck: returns the updated tracking and new items', async () => {
  const tracking = makeTracking({ baselineEstablished: true, seenListingIds: ['a'] });
  const store = makeStore([tracking]);
  const scraper = makeScraper([{ id: 'a' }, { id: 'b' }]);
  const checker = new TrackingChecker(store, scraper);

  const result = await checker.runSingleCheck('t1');
  assert.deepEqual(
    result.newItems.map((i) => i.id),
    ['b']
  );
});
