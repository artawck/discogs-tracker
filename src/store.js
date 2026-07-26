'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TrackingMode, ANY_COUNTRY } = require('./domain/constants');

const DEFAULT_SETTINGS = {
  discogsToken: '',
  checkHour: 9,
  checkMinute: 1,
  launchAtLogin: false,
  theme: 'system',
  language: 'en',
  sidebarWidth: 300,
};

/** Persists settings and trackings to a JSON file in the app's userData dir. */
class Store {
  #dir;
  #file;
  #data;

  constructor(userDataDir) {
    this.#dir = userDataDir;
    this.#file = path.join(userDataDir, 'discogs-tracker-data.json');
    this.#data = this.#load();
  }

  getSettings() {
    return { ...this.#data.settings };
  }

  updateSettings(patch) {
    this.#data.settings = { ...this.#data.settings, ...patch };
    this.#save();
    return this.getSettings();
  }

  /** All trackings, sorted by their persisted manual sidebar order. */
  getTrackings() {
    return [...this.#data.trackings].sort((a, b) => a.order - b.order);
  }

  getTracking(id) {
    return this.#data.trackings.find((t) => t.id === id) || null;
  }

  addTracking({ mode, artist, album, label, country, discogsType, discogsId, releaseTitle }) {
    const tracking = {
      id: crypto.randomUUID(),
      mode: mode || TrackingMode.ARTIST,
      artist: artist || null,
      album: album || null,
      label: label || null,
      country: country || ANY_COUNTRY,
      discogsType,
      discogsId,
      releaseTitle,
      order: this.#nextOrder(),
      createdAt: new Date().toISOString(),
      lastCheckedAt: null,
      lastError: null,
      seenListingIds: [],
      items: [],
    };
    this.#data.trackings.push(tracking);
    this.#save();
    return tracking;
  }

  removeTracking(id) {
    this.#data.trackings = this.#data.trackings.filter((t) => t.id !== id);
    this.#save();
  }

  /** Persist a manual sidebar order given as a list of tracking ids. */
  reorderTrackings(orderedIds) {
    orderedIds.forEach((id, index) => {
      const tracking = this.getTracking(id);
      if (tracking) tracking.order = index;
    });
    this.#save();
    return this.getTrackings();
  }

  updateTrackingResult(id, { items, newItems, error }) {
    const tracking = this.getTracking(id);
    if (!tracking) return null;

    tracking.lastCheckedAt = new Date().toISOString();
    tracking.lastError = error || null;
    if (items) {
      tracking.items = items;
      const seen = new Set(tracking.seenListingIds);
      for (const item of items) seen.add(item.id);
      tracking.seenListingIds = Array.from(seen);
    }
    this.#save();
    return { tracking, newItems: newItems || [] };
  }

  #nextOrder() {
    const maxOrder = this.#data.trackings.reduce((max, t) => Math.max(max, t.order), -1);
    return maxOrder + 1;
  }

  #load() {
    try {
      const raw = fs.readFileSync(this.#file, 'utf8');
      const parsed = JSON.parse(raw);
      const trackings = Array.isArray(parsed.trackings) ? parsed.trackings : [];
      // Backfill `order` for trackings saved before manual sidebar ordering
      // existed, so they get a stable position instead of sorting to 0.
      trackings.forEach((t, i) => {
        if (typeof t.order !== 'number') t.order = i;
      });
      return {
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        trackings,
      };
    } catch {
      return { settings: { ...DEFAULT_SETTINGS }, trackings: [] };
    }
  }

  #save() {
    fs.mkdirSync(this.#dir, { recursive: true });
    const tmp = `${this.#file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.#data, null, 2), 'utf8');
    fs.renameSync(tmp, this.#file);
  }
}

module.exports = { Store, DEFAULT_SETTINGS };
