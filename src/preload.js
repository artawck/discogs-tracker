'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Channel names are duplicated here rather than imported from
// ./ipcChannels.js: this preload script runs in Electron's sandboxed
// preload context (sandbox: true on the BrowserWindow), whose polyfilled
// require() only resolves a fixed allowlist of built-ins (e.g. 'electron')
// and cannot load arbitrary local relative files. The main process (which
// isn't sandboxed) uses ./ipcChannels.js as the source of truth; keep these
// string literals in sync with it if a channel name ever changes.
contextBridge.exposeInMainWorld('discogsTracker', {
  getState: () => ipcRenderer.invoke('get-state'),
  searchArtists: (artist) => ipcRenderer.invoke('search-artists', { artist }),
  searchAlbums: (artistName, album) => ipcRenderer.invoke('search-albums', { artistName, album }),
  searchLabels: (label) => ipcRenderer.invoke('search-labels', { label }),
  addTracking: (payload) => ipcRenderer.invoke('add-tracking', payload),
  removeTracking: (id) => ipcRenderer.invoke('remove-tracking', id),
  reorderTrackings: (orderedIds) => ipcRenderer.invoke('reorder-trackings', orderedIds),
  checkNow: () => ipcRenderer.invoke('check-now'),
  updateSettings: (patch) => ipcRenderer.invoke('update-settings', patch),
  openLink: (url) => ipcRenderer.invoke('open-link', url),
  onProgress: (cb) => ipcRenderer.on('tracking-progress', (_e, data) => cb(data)),
  onTrackingsUpdated: (cb) => ipcRenderer.on('trackings-updated', (_e, data) => cb(data)),
  onFocusTracking: (cb) => ipcRenderer.on('focus-tracking', (_e, id) => cb(id)),
  onCheckState: (cb) => ipcRenderer.on('check-state', (_e, data) => cb(data)),
});
