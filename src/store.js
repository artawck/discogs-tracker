'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
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

  async updateSettings(patch) {
    this.#data.settings = { ...this.#data.settings, ...patch };
    await this.#save();
    return this.getSettings();
  }

  /** All trackings, sorted by their persisted manual sidebar order. */
  getTrackings() {
    return [...this.#data.trackings].sort((a, b) => a.order - b.order);
  }

  getTracking(id) {
    return this.#data.trackings.find((t) => t.id === id) || null;
  }

  async addTracking({ mode, artist, album, label, country, discogsType, discogsId, releaseTitle }) {
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
      // True once a check has successfully completed at least once (even if
      // it found zero items). Distinct from lastCheckedAt, which is also set
      // on failed attempts — see TrackingChecker for why that distinction
      // matters (a failed *first* check must not look like a baseline).
      baselineEstablished: false,
      seenListingIds: [],
      items: [],
    };
    this.#data.trackings.push(tracking);
    await this.#save();
    return tracking;
  }

  async removeTracking(id) {
    this.#data.trackings = this.#data.trackings.filter((t) => t.id !== id);
    await this.#save();
  }

  /** Persist a manual sidebar order given as a list of tracking ids. */
  async reorderTrackings(orderedIds) {
    orderedIds.forEach((id, index) => {
      const tracking = this.getTracking(id);
      if (tracking) tracking.order = index;
    });
    await this.#save();
    return this.getTrackings();
  }

  /** Returns null if the tracking no longer exists (e.g. removed mid-check). */
  async updateTrackingResult(id, { items, newItems, error }) {
    const tracking = this.getTracking(id);
    if (!tracking) return null;

    tracking.lastCheckedAt = new Date().toISOString();
    tracking.lastError = error || null;
    if (items) {
      tracking.baselineEstablished = true;
      tracking.items = items;
      const seen = new Set(tracking.seenListingIds);
      for (const item of items) seen.add(item.id);
      tracking.seenListingIds = Array.from(seen);
    }
    await this.#save();
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
      trackings.forEach((t, i) => {
        // Backfill `order` for trackings saved before manual sidebar ordering
        // existed, so they get a stable position instead of sorting to 0.
        if (typeof t.order !== 'number') t.order = i;
        // Backfill `baselineEstablished` for trackings saved before it
        // existed. Treat "has been checked before" as "has a baseline" so
        // existing listings aren't all reported as new the next run.
        if (typeof t.baselineEstablished !== 'boolean') t.baselineEstablished = t.lastCheckedAt !== null;
      });
      return {
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        trackings,
      };
    } catch {
      return { settings: { ...DEFAULT_SETTINGS }, trackings: [] };
    }
  }

  async #save() {
    await fsp.mkdir(this.#dir, { recursive: true });
    const tmp = `${this.#file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(this.#data, null, 2), 'utf8');
    await fsp.rename(tmp, this.#file);
  }
}

module.exports = { Store, DEFAULT_SETTINGS };
