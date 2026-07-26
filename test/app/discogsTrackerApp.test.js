'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { installFakeElectron, uninstallFakeElectron } = require('../helpers/fakeElectron');

let electron;
let DiscogsTrackerApp;
let IpcChannels;
let DiscogsMarketplace;
const originalSearch = {};
const originalFetch = global.fetch;

test.before(() => {
  electron = installFakeElectron();
  ({ DiscogsTrackerApp } = require('../../src/app/DiscogsTrackerApp'));
  ({ IpcChannels } = require('../../src/ipcChannels'));
  require('../../src/discogsLibPaths');
  ({ DiscogsMarketplace } = require('discogs-marketplace-api-nodejs'));
  originalSearch.fn = DiscogsMarketplace.search;
});

test.after(() => {
  uninstallFakeElectron();
});

let tmpDir;

test.beforeEach(async (t) => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'discogs-tracker-app-test-'));
  electron.app.getPath = () => tmpDir;
  electron.app.loginItemSettings = undefined;
  electron.BrowserWindow.instances.length = 0;
  electron.Tray.instances.length = 0;
  electron.Notification.instances.length = 0;
  electron.shell.calls.length = 0;
  electron.ipcMain.handlers.clear();
  DiscogsMarketplace.search = async () => ({ items: [], page: { total: 1 } });
  t.mock.timers.enable({ apis: ['setTimeout'] }); // keep DailyScheduler's real-time timer from ever firing in tests
});

test.afterEach(async () => {
  DiscogsMarketplace.search = originalSearch.fn;
  global.fetch = originalFetch;
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

function invoke(channel, ...args) {
  return electron.ipcMain.invoke(channel, ...args);
}

test('start(): builds the tray, shows the window, and registers every IPC handler', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  assert.equal(electron.Tray.instances.length, 1);
  assert.equal(electron.BrowserWindow.instances.length, 1);

  const requestChannels = [
    IpcChannels.GET_STATE,
    IpcChannels.SEARCH_ARTISTS,
    IpcChannels.SEARCH_ALBUMS,
    IpcChannels.SEARCH_LABELS,
    IpcChannels.ADD_TRACKING,
    IpcChannels.REMOVE_TRACKING,
    IpcChannels.REORDER_TRACKINGS,
    IpcChannels.CHECK_NOW,
    IpcChannels.UPDATE_SETTINGS,
    IpcChannels.OPEN_LINK,
  ];
  for (const channel of requestChannels) {
    assert.ok(electron.ipcMain.handlers.has(channel), `expected a handler for ${channel}`);
  }
});

test('start(): applies (or, on Linux, skips) the login-item setting', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  if (process.platform === 'linux') {
    assert.equal(electron.app.loginItemSettings, undefined);
  } else {
    assert.deepEqual(electron.app.loginItemSettings, { openAtLogin: false, openAsHidden: true });
  }
});

test('GET_STATE: returns trackings, settings, countries and nextRunAt', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  const state = await invoke(IpcChannels.GET_STATE);
  assert.deepEqual(state.trackings, []);
  assert.equal(state.settings.theme, 'system');
  assert.ok(state.countries.length > 100);
  assert.ok(state.nextRunAt);
  assert.equal(state.checkInProgress, false);
});

test('SEARCH_ARTISTS: rejects a missing artist name without calling the API', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();
  global.fetch = async () => {
    throw new Error('should not be called');
  };

  await assert.rejects(async () => invoke(IpcChannels.SEARCH_ARTISTS, {}), /Artist is required/);
});

test('SEARCH_ARTISTS: delegates to DiscogsApiClient on a valid request', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();
  global.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ results: [{ id: 1, title: 'Blur', thumb: null }] }),
  });

  const results = await invoke(IpcChannels.SEARCH_ARTISTS, { artist: 'Blur' });
  assert.equal(results[0].title, 'Blur');
});

test('SEARCH_ALBUMS: rejects when either artistName or album is missing', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  await assert.rejects(async () => invoke(IpcChannels.SEARCH_ALBUMS, { artistName: 'Blur' }), /required/);
  await assert.rejects(async () => invoke(IpcChannels.SEARCH_ALBUMS, { album: 'Blur' }), /required/);
});

test('SEARCH_LABELS: rejects a missing label name', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  await assert.rejects(async () => invoke(IpcChannels.SEARCH_LABELS, {}), /Label is required/);
});

test('ADD_TRACKING: rejects a malformed payload (bad discogsType/discogsId/mode) without persisting anything', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  await assert.rejects(() => invoke(IpcChannels.ADD_TRACKING, { discogsType: 'nonsense', discogsId: 1 }));
  await assert.rejects(() => invoke(IpcChannels.ADD_TRACKING, { discogsType: 'artist', discogsId: 'not-a-number' }));
  await assert.rejects(() => invoke(IpcChannels.ADD_TRACKING, { discogsType: 'artist', discogsId: 1, mode: 'bogus' }));

  const state = await invoke(IpcChannels.GET_STATE);
  assert.deepEqual(state.trackings, []);
});

test('ADD_TRACKING: persists a valid tracking and establishes its baseline immediately', async () => {
  DiscogsMarketplace.search = async () => ({ items: [{ id: 'x' }, { id: 'y' }], page: { total: 1 } });
  const app = new DiscogsTrackerApp();
  await app.start();

  const trackings = await invoke(IpcChannels.ADD_TRACKING, {
    mode: 'artist',
    artist: 'Boards of Canada',
    discogsType: 'artist',
    discogsId: 1,
    releaseTitle: 'Boards of Canada',
  });

  assert.equal(trackings.length, 1);
  assert.equal(trackings[0].baselineEstablished, true);
  assert.equal(trackings[0].items.length, 2);
  assert.equal(trackings[0].lastError, null);
});

test('ADD_TRACKING: a baseline check that fails still persists the tracking, with the error recorded', async () => {
  DiscogsMarketplace.search = async () => {
    throw new Error('scrape failed');
  };
  const app = new DiscogsTrackerApp();
  await app.start();

  const trackings = await invoke(IpcChannels.ADD_TRACKING, {
    mode: 'artist',
    artist: 'Boards of Canada',
    discogsType: 'artist',
    discogsId: 1,
    releaseTitle: 'Boards of Canada',
  });

  assert.equal(trackings.length, 1);
  assert.equal(trackings[0].baselineEstablished, false);
  assert.equal(trackings[0].lastError, 'scrape failed');
});

test('REMOVE_TRACKING: deletes a tracking and returns the remaining list', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();
  const [added] = await invoke(IpcChannels.ADD_TRACKING, {
    mode: 'artist',
    artist: 'A',
    discogsType: 'artist',
    discogsId: 1,
    releaseTitle: 'A',
  });

  const trackings = await invoke(IpcChannels.REMOVE_TRACKING, added.id);
  assert.deepEqual(trackings, []);
});

test('REORDER_TRACKINGS: persists the new order', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();
  await invoke(IpcChannels.ADD_TRACKING, { mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: 1, releaseTitle: 'A' });
  await invoke(IpcChannels.ADD_TRACKING, { mode: 'artist', artist: 'B', discogsType: 'artist', discogsId: 2, releaseTitle: 'B' });
  const state = await invoke(IpcChannels.GET_STATE);
  const [first, second] = state.trackings;

  const reordered = await invoke(IpcChannels.REORDER_TRACKINGS, [second.id, first.id]);
  assert.deepEqual(reordered.map((t) => t.artist), ['B', 'A']);
});

test('CHECK_NOW: sends CHECK_STATE(true) then CHECK_STATE(false), and TRACKINGS_UPDATED, to the open window', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();
  await invoke(IpcChannels.ADD_TRACKING, { mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: 1, releaseTitle: 'A' });

  const win = electron.BrowserWindow.instances[0];
  win.webContents._sentMessages.length = 0;

  await invoke(IpcChannels.CHECK_NOW);

  const channels = win.webContents._sentMessages.map((m) => m.channel);
  assert.deepEqual(channels.filter((c) => c === IpcChannels.CHECK_STATE), [IpcChannels.CHECK_STATE, IpcChannels.CHECK_STATE]);
  const checkStatePayloads = win.webContents._sentMessages.filter((m) => m.channel === IpcChannels.CHECK_STATE).map((m) => m.payload);
  assert.deepEqual(checkStatePayloads, [{ inProgress: true }, { inProgress: false }]);
  assert.ok(channels.includes(IpcChannels.TRACKINGS_UPDATED));
});

test('CHECK_NOW: a tracking with genuinely new items triggers a notification whose click focuses it', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();
  // Baseline check: sees item 'a' only.
  DiscogsMarketplace.search = async () => ({ items: [{ id: 'a' }], page: { total: 1 } });
  const [added] = await invoke(IpcChannels.ADD_TRACKING, {
    mode: 'artist',
    artist: 'Boards of Canada',
    discogsType: 'artist',
    discogsId: 1,
    releaseTitle: 'Boards of Canada',
  });

  // Second check: a genuinely new item 'b' appears alongside 'a'.
  DiscogsMarketplace.search = async () => ({ items: [{ id: 'a' }, { id: 'b' }], page: { total: 1 } });
  await invoke(IpcChannels.CHECK_NOW);

  assert.equal(electron.Notification.instances.length, 1);
  const win = electron.BrowserWindow.instances[0];
  win.webContents._sentMessages.length = 0;

  electron.Notification.instances[0].simulateClick();
  assert.equal(win.shown, true);
  const focusMsg = win.webContents._sentMessages.find((m) => m.channel === IpcChannels.FOCUS_TRACKING);
  assert.equal(focusMsg.payload, added.id);
});

test('CHECK_NOW: a concurrent second call is a no-op while a check is already in flight', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();
  await invoke(IpcChannels.ADD_TRACKING, { mode: 'artist', artist: 'A', discogsType: 'artist', discogsId: 1, releaseTitle: 'A' });

  let resolveSearch;
  let searchCallCount = 0;
  DiscogsMarketplace.search = () => {
    searchCallCount++;
    return new Promise((resolve) => {
      resolveSearch = resolve;
    });
  };

  const first = invoke(IpcChannels.CHECK_NOW);
  const second = invoke(IpcChannels.CHECK_NOW); // must return without waiting on the in-flight check
  await second;

  resolveSearch({ items: [], page: { total: 1 } });
  await first;

  assert.equal(searchCallCount, 1);
});

test('UPDATE_SETTINGS: persists the patch, reschedules, refreshes the tray, and returns the new nextRunAt', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  const result = await invoke(IpcChannels.UPDATE_SETTINGS, { checkHour: 20, checkMinute: 15, language: 'en' });

  assert.equal(result.settings.checkHour, 20);
  assert.equal(result.settings.checkMinute, 15);
  assert.ok(result.nextRunAt);

  const state = await invoke(IpcChannels.GET_STATE);
  assert.equal(state.settings.checkHour, 20);
});

test('UPDATE_SETTINGS: reapplies the login-item setting from the new value', async () => {
  if (process.platform === 'linux') return; // openAtLogin is not applied on Linux at all
  const app = new DiscogsTrackerApp();
  await app.start();

  await invoke(IpcChannels.UPDATE_SETTINGS, { launchAtLogin: true });
  assert.deepEqual(electron.app.loginItemSettings, { openAtLogin: true, openAsHidden: true });
});

test('OPEN_LINK: only allows navigating to discogs.com URLs', async () => {
  const app = new DiscogsTrackerApp();
  await app.start();

  await invoke(IpcChannels.OPEN_LINK, 'https://discogs.com/release/1');
  await invoke(IpcChannels.OPEN_LINK, 'https://evil.com/');

  assert.deepEqual(electron.shell.calls, ['https://discogs.com/release/1']);
});
