'use strict';

function blankAddFlow() {
  return {
    mode: 'artist',
    selectedArtist: null,
    artistCandidates: [],
    albumCandidates: [],
    selectedAlbumKey: null,
    selectedLabel: null,
    labelCandidates: [],
  };
}

/** All mutable renderer UI state, in one place. */
export class AppState {
  trackings = [];
  settings = {};
  countries = [];
  selectedId = null;
  nextRunAt = null;
  /** trackingId -> Set of listing ids to highlight as new, this session only. */
  newIdsByTracking = {};
  /** Current listings-table sort. */
  sort = { col: null, dir: 'asc' };
  sidebarSortMode = 'custom';
  dragTrackingId = null;
  addFlow = blankAddFlow();

  getSelectedTracking() {
    return this.trackings.find((t) => t.id === this.selectedId) || null;
  }

  resetAddFlow() {
    this.addFlow = blankAddFlow();
  }
}
