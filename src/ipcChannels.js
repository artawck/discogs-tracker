'use strict';

/** Channel names shared between the main process and the preload bridge. */
const IpcChannels = Object.freeze({
  GET_STATE: 'get-state',
  SEARCH_ARTISTS: 'search-artists',
  SEARCH_ALBUMS: 'search-albums',
  SEARCH_LABELS: 'search-labels',
  ADD_TRACKING: 'add-tracking',
  REMOVE_TRACKING: 'remove-tracking',
  REORDER_TRACKINGS: 'reorder-trackings',
  CHECK_NOW: 'check-now',
  UPDATE_SETTINGS: 'update-settings',
  OPEN_LINK: 'open-link',

  // main -> renderer push events
  TRACKING_PROGRESS: 'tracking-progress',
  TRACKINGS_UPDATED: 'trackings-updated',
  FOCUS_TRACKING: 'focus-tracking',
  CHECK_STATE: 'check-state',
});

module.exports = { IpcChannels };
