'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('a fresh AppState has sensible defaults', async () => {
  const { AppState } = await import('../../renderer/state/AppState.js');
  const state = new AppState();

  assert.deepEqual(state.trackings, []);
  assert.equal(state.selectedId, null);
  assert.equal(state.sidebarSortMode, 'custom');
  assert.deepEqual(state.sort, { col: null, dir: 'asc' });
  assert.equal(state.addFlow.mode, 'artist');
  assert.equal(state.addFlow.selectedArtist, null);
});

test('getSelectedTracking() returns the tracking matching selectedId', async () => {
  const { AppState } = await import('../../renderer/state/AppState.js');
  const state = new AppState();
  state.trackings = [{ id: 'a' }, { id: 'b' }];
  state.selectedId = 'b';

  assert.deepEqual(state.getSelectedTracking(), { id: 'b' });
});

test('getSelectedTracking() returns null when nothing is selected or the id does not match', async () => {
  const { AppState } = await import('../../renderer/state/AppState.js');
  const state = new AppState();
  state.trackings = [{ id: 'a' }];

  assert.equal(state.getSelectedTracking(), null);

  state.selectedId = 'missing';
  assert.equal(state.getSelectedTracking(), null);
});

test('resetAddFlow() clears any in-progress add-tracking selections', async () => {
  const { AppState } = await import('../../renderer/state/AppState.js');
  const state = new AppState();
  state.addFlow.mode = 'label';
  state.addFlow.selectedLabel = { id: 1, title: 'Warp' };
  state.addFlow.selectedArtist = { id: 2, title: 'Aphex Twin' };

  state.resetAddFlow();

  assert.equal(state.addFlow.mode, 'artist');
  assert.equal(state.addFlow.selectedLabel, null);
  assert.equal(state.addFlow.selectedArtist, null);
});
