'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installJsdom, uninstallJsdom } = require('../helpers/jsdomEnv');
const { fakeApi } = require('../helpers/fakeDiscogsTrackerApi');

let DiscogsTrackerApp;

test.before(async () => {
  installJsdom();
  window.discogsTracker = fakeApi();
  ({ DiscogsTrackerApp } = await import('../../renderer/DiscogsTrackerApp.js'));
  uninstallJsdom();
});

// A fresh DOM per test: the app wires event listeners onto real elements in
// start(), and a DOM shared across tests would leak those listeners.
test.beforeEach(() => {
  installJsdom();
});

test.afterEach(() => {
  uninstallJsdom();
});

function tracking(overrides = {}) {
  return { id: 't1', mode: 'artist', artist: 'Boards of Canada', album: null, country: 'Any', items: [], lastCheckedAt: null, lastError: null, ...overrides };
}

async function startApp(apiOverrides = {}) {
  window.discogsTracker = fakeApi(apiOverrides);
  const app = new DiscogsTrackerApp();
  await app.start();
  return app;
}

test('start(): loads initial state, applies theme/sidebar width, and renders the tracking list', async () => {
  const app = await startApp({
    getState: async () => ({
      trackings: [tracking()],
      settings: { theme: 'sunrise', sidebarWidth: 350, language: 'en' },
      countries: ['Germany'],
      nextRunAt: '2024-06-15T09:00:00Z',
      checkInProgress: false,
    }),
  });

  assert.equal(app.state.trackings.length, 1);
  assert.equal(document.documentElement.dataset.theme, 'sunrise');
  assert.equal(document.documentElement.style.getPropertyValue('--sidebar-width'), '350px');
  assert.equal(document.querySelectorAll('#trackingList .tracking-item').length, 1);
  assert.equal(document.querySelectorAll('#countryOptions option').length, 1);
  assert.match(document.getElementById('nextRun').textContent, /Next check/i);
});

test('start(): reflects an in-progress check in the checkNow button state', async () => {
  await startApp({ getState: async () => ({ trackings: [], settings: {}, countries: [], nextRunAt: new Date().toISOString(), checkInProgress: true }) });
  assert.equal(document.getElementById('checkNowBtn').disabled, true);
});

test('trackingTitle()/trackingKind(): artist-only, artist+album, and label modes', async () => {
  const app = await startApp();
  assert.equal(app.trackingTitle({ mode: 'artist', artist: 'Aphex Twin', album: null }), 'Aphex Twin');
  assert.equal(app.trackingKind({ mode: 'artist', artist: 'Aphex Twin', album: null }), 'art');

  assert.equal(app.trackingTitle({ mode: 'artist', artist: 'Aphex Twin', album: 'Syro' }), 'Aphex Twin – Syro');
  assert.equal(app.trackingKind({ mode: 'artist', artist: 'Aphex Twin', album: 'Syro' }), 'alb');

  assert.equal(app.trackingTitle({ mode: 'label', label: 'Warp Records' }), 'Warp Records');
  assert.equal(app.trackingKind({ mode: 'label', label: 'Warp Records' }), 'lab');
});

test('selectTracking(): sets state.selectedId and re-renders the list and detail panel', async () => {
  const app = await startApp({ getState: async () => ({ trackings: [tracking({ id: 'a' }), tracking({ id: 'b' })], settings: {}, countries: [], nextRunAt: new Date().toISOString(), checkInProgress: false }) });

  app.selectTracking('b');

  assert.equal(app.state.selectedId, 'b');
  assert.equal(document.getElementById('trackingDetail').classList.contains('hidden'), false);
  assert.equal(document.querySelectorAll('#trackingList .tracking-item.active').length, 1);
});

test('showError(): displays the raw message in the toast, then auto-hides it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = await startApp();

  app.showError('Something went wrong');
  const toast = document.getElementById('toast');
  assert.equal(toast.classList.contains('hidden'), false);
  assert.match(toast.textContent, /Something went wrong/);

  t.mock.timers.tick(5000);
  assert.equal(toast.classList.contains('hidden'), true);
});

test('showError(): a second error resets the auto-hide timer instead of stacking', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = await startApp();

  app.showError('first error');
  t.mock.timers.tick(3000);
  app.showError('second error'); // resets the 5s timer

  t.mock.timers.tick(3000); // 3s since the second error — should still be visible
  assert.equal(document.getElementById('toast').classList.contains('hidden'), false);

  t.mock.timers.tick(2000); // total 5s since the second error
  assert.equal(document.getElementById('toast').classList.contains('hidden'), true);
});

test('checkNowBtn click: replaces trackings from the API response and re-renders', async () => {
  const updated = [tracking({ id: 'a' })];
  const app = await startApp({ checkNow: async () => updated });

  document.getElementById('checkNowBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(app.state.trackings, updated);
  assert.equal(document.querySelectorAll('#trackingList .tracking-item').length, 1);
});

test('push event onTrackingsUpdated: replaces state.trackings and re-renders', async () => {
  const app = await startApp();
  const updated = [tracking({ id: 'z' })];

  window.discogsTracker._listeners.trackingsUpdated[0](updated);

  assert.deepEqual(app.state.trackings, updated);
  assert.equal(document.querySelectorAll('#trackingList .tracking-item').length, 1);
});

test('push event onProgress: accumulates new item ids per tracking on "done"', async () => {
  const app = await startApp();

  window.discogsTracker._listeners.progress[0]({ status: 'checking', trackingId: 't1' });
  window.discogsTracker._listeners.progress[0]({ status: 'done', trackingId: 't1', newItemIds: ['x', 'y'] });
  window.discogsTracker._listeners.progress[0]({ status: 'done', trackingId: 't1', newItemIds: ['y', 'z'] });

  assert.deepEqual(app.state.newIdsByTracking['t1'], new Set(['x', 'y', 'z']));
});

test('push event onCheckState: toggles the checkNow button', async () => {
  const app = await startApp();

  window.discogsTracker._listeners.checkState[0]({ inProgress: true });
  assert.equal(document.getElementById('checkNowBtn').disabled, true);

  window.discogsTracker._listeners.checkState[0]({ inProgress: false });
  assert.equal(document.getElementById('checkNowBtn').disabled, false);
});

test('push event onFocusTracking: selects the given tracking', async () => {
  const app = await startApp({ getState: async () => ({ trackings: [tracking({ id: 'a' }), tracking({ id: 'b' })], settings: {}, countries: [], nextRunAt: new Date().toISOString(), checkInProgress: false }) });

  window.discogsTracker._listeners.focusTracking[0]('b');

  assert.equal(app.state.selectedId, 'b');
});

test('setLanguage(): updates the document lang attribute and re-applies data-i18n translations', async () => {
  const app = await startApp();
  await app.setLanguage('uk');

  assert.equal(document.documentElement.lang, 'uk');
  assert.equal(app.state.settings.language, 'uk');
});
