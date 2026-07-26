'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installJsdom, uninstallJsdom } = require('../helpers/jsdomEnv');
const { fakeApp } = require('../helpers/fakeRendererApp');

let TrackingListView;
let AppState;

test.before(async () => {
  installJsdom(); // only to resolve the dynamic imports below; each test gets its own fresh DOM
  ({ TrackingListView } = await import('../../renderer/views/TrackingListView.js'));
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
  return { id: 't1', mode: 'artist', artist: 'Boards of Canada', album: null, country: 'Any', items: [], ...overrides };
}

test('render(): renders one <li> per tracking, in state order for the "custom" sort mode', () => {
  const state = new AppState();
  state.trackings = [tracking({ id: 'a', artist: 'A' }), tracking({ id: 'b', artist: 'B' })];
  const app = fakeApp({ state });
  const view = new TrackingListView(app);

  view.render();

  const items = document.querySelectorAll('#trackingList .tracking-item');
  assert.equal(items.length, 2);
  assert.match(items[0].textContent, /A/);
  assert.match(items[1].textContent, /B/);
});

test('render(): marks the selected tracking with the "active" class', () => {
  const state = new AppState();
  state.trackings = [tracking({ id: 'a' }), tracking({ id: 'b' })];
  state.selectedId = 'b';
  const view = new TrackingListView(fakeApp({ state }));

  view.render();

  const items = document.querySelectorAll('#trackingList .tracking-item');
  assert.equal(items[0].classList.contains('active'), false);
  assert.equal(items[1].classList.contains('active'), true);
});

test('render(): sorts by name/country/items when sidebarSortMode requests it', () => {
  const state = new AppState();
  state.trackings = [
    tracking({ id: 'a', artist: 'Zeta', country: 'UK', items: [{ id: 1 }] }),
    tracking({ id: 'b', artist: 'Alpha', country: 'DE', items: [{ id: 1 }, { id: 2 }] }),
  ];
  const view = new TrackingListView(fakeApp({ state }));

  state.sidebarSortMode = 'name';
  view.render();
  assert.match(document.querySelectorAll('#trackingList .tracking-item')[0].textContent, /Alpha/);

  state.sidebarSortMode = 'country';
  view.render();
  assert.match(document.querySelectorAll('#trackingList .tracking-item')[0].textContent, /Alpha/); // DE < UK

  state.sidebarSortMode = 'items';
  view.render();
  assert.match(document.querySelectorAll('#trackingList .tracking-item')[0].textContent, /Alpha/); // 2 items > 1
});

test('clicking a tracking item selects it', () => {
  const state = new AppState();
  state.trackings = [tracking({ id: 'a' })];
  let selected;
  const app = fakeApp({ state, selectTracking: (id) => (selected = id) });
  new TrackingListView(app).render();

  document.querySelector('#trackingList .tracking-item').click();
  assert.equal(selected, 'a');
});

test('clicking the remove icon removes the tracking without selecting it (stopPropagation)', async () => {
  const state = new AppState();
  state.trackings = [tracking({ id: 'a' })];
  state.selectedId = 'a';
  let selectCalls = 0;
  const detailRenderCalls = [];
  const app = fakeApp({
    state,
    selectTracking: () => selectCalls++,
    api: { removeTracking: async (id) => { assert.equal(id, 'a'); return []; } },
    trackingDetail: { render: () => detailRenderCalls.push('render'), renderSortIndicators: () => {} },
  });
  const view = new TrackingListView(app);
  view.render();

  document.querySelector('#trackingList .remove-icon').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(selectCalls, 0);
  assert.deepEqual(state.trackings, []);
  assert.equal(state.selectedId, null);
  assert.deepEqual(detailRenderCalls, ['render']);
});

test('remove failure surfaces the error via app.showError() instead of throwing', async () => {
  const state = new AppState();
  state.trackings = [tracking({ id: 'a' })];
  let errorMessage;
  const app = fakeApp({
    state,
    showError: (msg) => (errorMessage = msg),
    api: { removeTracking: async () => { throw new Error('network error'); } },
  });
  new TrackingListView(app).render();

  document.querySelector('#trackingList .remove-icon').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errorMessage, 'network error');
});

test('wireEvents(): changing the sort-mode select re-renders using the new mode', () => {
  const state = new AppState();
  state.trackings = [
    tracking({ id: 'a', artist: 'Zeta' }),
    tracking({ id: 'b', artist: 'Alpha' }),
  ];
  const view = new TrackingListView(fakeApp({ state }));
  view.wireEvents();
  view.render();
  assert.match(document.querySelectorAll('#trackingList .tracking-item')[0].textContent, /Zeta/);

  const select = document.getElementById('sidebarSortMode');
  select.value = 'name';
  select.dispatchEvent(new window.Event('change'));

  assert.equal(state.sidebarSortMode, 'name');
  assert.match(document.querySelectorAll('#trackingList .tracking-item')[0].textContent, /Alpha/);
});

test('drag-and-drop: dropping a tracking after another persists the new order via api.reorderTrackings', async () => {
  const state = new AppState();
  state.trackings = [tracking({ id: 'a' }), tracking({ id: 'b' }), tracking({ id: 'c' })];
  let reorderedIds;
  const app = fakeApp({
    state,
    api: {
      reorderTrackings: async (ids) => {
        reorderedIds = ids;
        return ids.map((id) => tracking({ id }));
      },
    },
  });
  const view = new TrackingListView(app);
  view.render();

  const items = document.querySelectorAll('#trackingList .tracking-item');
  const [itemA, , itemC] = items;

  const dragStartEvent = new window.Event('dragstart', { bubbles: true });
  dragStartEvent.dataTransfer = { effectAllowed: null, setData: () => {} };
  itemA.dispatchEvent(dragStartEvent);

  itemC.classList.add('drag-over-bottom');
  const dropEvent = new window.Event('drop', { bubbles: true, cancelable: true });
  itemC.dispatchEvent(dropEvent);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(reorderedIds, ['b', 'c', 'a']);
});
