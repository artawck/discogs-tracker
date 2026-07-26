'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { Store, DEFAULT_SETTINGS } = require('../src/store');

let dir;

test.beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'discogs-tracker-store-test-'));
});

test.afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

test('a fresh store (no existing file) starts with default settings and no trackings', () => {
  const store = new Store(dir);
  assert.deepEqual(store.getSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(store.getTrackings(), []);
});

test('updateSettings() merges the patch and persists it to disk', async () => {
  const store = new Store(dir);
  const updated = await store.updateSettings({ checkHour: 14, theme: 'dark' });

  assert.equal(updated.checkHour, 14);
  assert.equal(updated.theme, 'dark');
  assert.equal(updated.checkMinute, DEFAULT_SETTINGS.checkMinute); // untouched fields survive the merge

  const reloaded = new Store(dir);
  assert.equal(reloaded.getSettings().checkHour, 14);
  assert.equal(reloaded.getSettings().theme, 'dark');
});

test('addTracking() assigns an id, defaults, and increasing order', async () => {
  const store = new Store(dir);
  const t1 = await store.addTracking({ mode: 'artist', artist: 'Boards of Canada', discogsType: 'artist', discogsId: '1', releaseTitle: 'Boards of Canada' });
  const t2 = await store.addTracking({ mode: 'artist', artist: 'Aphex Twin', discogsType: 'artist', discogsId: '2', releaseTitle: 'Aphex Twin' });

  assert.ok(t1.id);
  assert.notEqual(t1.id, t2.id);
  assert.equal(t1.order, 0);
  assert.equal(t2.order, 1);
  assert.equal(t1.country, 'Any');
  assert.equal(t1.baselineEstablished, false);
  assert.deepEqual(t1.seenListingIds, []);
  assert.deepEqual(t1.items, []);
  assert.equal(t1.lastCheckedAt, null);
});

test('getTrackings() returns trackings sorted by persisted order, not insertion order', async () => {
  const store = new Store(dir);
  await store.addTracking({ mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: '1', releaseTitle: 'A' });
  await store.addTracking({ mode: 'artist', artist: 'B', discogsType: 'artist', discogsId: '2', releaseTitle: 'B' });
  const [first] = store.getTrackings();
  await store.reorderTrackings([store.getTrackings()[1].id, first.id]);

  const order = store.getTrackings().map((t) => t.artist);
  assert.deepEqual(order, ['B', 'A']);
});

test('removeTracking() deletes it and persists the removal', async () => {
  const store = new Store(dir);
  const t1 = await store.addTracking({ mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: '1', releaseTitle: 'A' });
  await store.addTracking({ mode: 'artist', artist: 'B', discogsType: 'artist', discogsId: '2', releaseTitle: 'B' });

  await store.removeTracking(t1.id);

  assert.equal(store.getTracking(t1.id), null);
  const reloaded = new Store(dir);
  assert.equal(reloaded.getTrackings().length, 1);
  assert.equal(reloaded.getTrackings()[0].artist, 'B');
});

test('updateTrackingResult(): first successful check sets baselineEstablished and items/seenListingIds', async () => {
  const store = new Store(dir);
  const t1 = await store.addTracking({ mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: '1', releaseTitle: 'A' });

  const result = await store.updateTrackingResult(t1.id, { items: [{ id: 'x' }, { id: 'y' }] });

  assert.equal(result.tracking.baselineEstablished, true);
  assert.deepEqual(result.tracking.items, [{ id: 'x' }, { id: 'y' }]);
  assert.deepEqual(new Set(result.tracking.seenListingIds), new Set(['x', 'y']));
  assert.equal(result.tracking.lastError, null);
  assert.ok(result.tracking.lastCheckedAt);
});

test('updateTrackingResult(): seenListingIds accumulate across checks instead of being replaced', async () => {
  const store = new Store(dir);
  const t1 = await store.addTracking({ mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: '1', releaseTitle: 'A' });

  await store.updateTrackingResult(t1.id, { items: [{ id: 'x' }] });
  const second = await store.updateTrackingResult(t1.id, { items: [{ id: 'y' }] });

  assert.deepEqual(new Set(second.tracking.seenListingIds), new Set(['x', 'y']));
});

test('updateTrackingResult(): a failed check records the error but does not touch baseline/items', async () => {
  const store = new Store(dir);
  const t1 = await store.addTracking({ mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: '1', releaseTitle: 'A' });

  const result = await store.updateTrackingResult(t1.id, { error: 'network error' });

  assert.equal(result.tracking.lastError, 'network error');
  assert.equal(result.tracking.baselineEstablished, false);
  assert.deepEqual(result.tracking.items, []);
});

test('updateTrackingResult(): returns null when the tracking no longer exists', async () => {
  const store = new Store(dir);
  const result = await store.updateTrackingResult('nonexistent-id', { items: [] });
  assert.equal(result, null);
});

test('reorderTrackings() ignores unknown ids without throwing', async () => {
  const store = new Store(dir);
  const t1 = await store.addTracking({ mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: '1', releaseTitle: 'A' });
  await assert.doesNotReject(() => store.reorderTrackings(['unknown-id', t1.id]));
});

test('a corrupt/unreadable data file falls back to defaults instead of throwing', async () => {
  fs.writeFileSync(path.join(dir, 'discogs-tracker-data.json'), '{ not valid json', 'utf8');
  const store = new Store(dir);
  assert.deepEqual(store.getSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(store.getTrackings(), []);
});

test('loading an old data file backfills a missing `order` field using array index', async () => {
  const file = path.join(dir, 'discogs-tracker-data.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      settings: {},
      trackings: [
        { id: 'a', artist: 'A', lastCheckedAt: null },
        { id: 'b', artist: 'B', lastCheckedAt: null },
      ],
    }),
    'utf8'
  );

  const store = new Store(dir);
  const trackings = store.getTrackings();
  assert.equal(trackings.find((t) => t.id === 'a').order, 0);
  assert.equal(trackings.find((t) => t.id === 'b').order, 1);
});

test('loading an old data file backfills `baselineEstablished` from whether it was ever checked', async () => {
  const file = path.join(dir, 'discogs-tracker-data.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      settings: {},
      trackings: [
        { id: 'checked', artist: 'A', lastCheckedAt: '2024-01-01T00:00:00Z' },
        { id: 'never-checked', artist: 'B', lastCheckedAt: null },
      ],
    }),
    'utf8'
  );

  const store = new Store(dir);
  assert.equal(store.getTracking('checked').baselineEstablished, true);
  assert.equal(store.getTracking('never-checked').baselineEstablished, false);
});

test('save() creates the userData directory if it does not exist yet, and writes atomically (no leftover .tmp file)', async () => {
  const nested = path.join(dir, 'nested', 'userData');
  const store = new Store(nested);
  await store.updateSettings({ checkHour: 5 });

  assert.equal(fs.existsSync(path.join(nested, 'discogs-tracker-data.json')), true);
  assert.equal(fs.existsSync(path.join(nested, 'discogs-tracker-data.json.tmp')), false);
});
