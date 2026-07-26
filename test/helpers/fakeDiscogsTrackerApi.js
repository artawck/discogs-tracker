'use strict';

/**
 * Fake for the `window.discogsTracker` bridge that src/preload.js exposes.
 * The on*() registrants just collect callbacks so a test can invoke them
 * manually to simulate a main-process push event.
 */
function fakeApi(overrides = {}) {
  const listeners = { progress: [], trackingsUpdated: [], focusTracking: [], checkState: [] };
  const api = {
    getState: async () => ({ trackings: [], settings: {}, countries: [], nextRunAt: new Date().toISOString(), checkInProgress: false }),
    searchArtists: async () => [],
    searchAlbums: async () => [],
    searchLabels: async () => [],
    addTracking: async () => [],
    removeTracking: async () => [],
    reorderTrackings: async () => [],
    checkNow: async () => [],
    updateSettings: async () => ({ settings: {}, nextRunAt: new Date().toISOString() }),
    openLink: async () => {},
    onProgress: (cb) => listeners.progress.push(cb),
    onTrackingsUpdated: (cb) => listeners.trackingsUpdated.push(cb),
    onFocusTracking: (cb) => listeners.focusTracking.push(cb),
    onCheckState: (cb) => listeners.checkState.push(cb),
    ...overrides,
  };
  api._listeners = listeners;
  return api;
}

module.exports = { fakeApi };
