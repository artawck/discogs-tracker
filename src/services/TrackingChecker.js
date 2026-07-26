'use strict';

/**
 * Runs marketplace checks for trackings, diffing fresh results against what
 * was seen before so callers can tell what's genuinely new.
 */
class TrackingChecker {
  constructor(store, scraper) {
    this.store = store;
    this.scraper = scraper;
  }

  /**
   * Checks every tracking in the store and returns a summary of what's new
   * per tracking. A tracking's very first check establishes a baseline
   * (nothing is reported as "new" yet, since those items already existed
   * before tracking started). One tracking's failure doesn't stop the rest.
   */
  async runAllChecks({ onProgress } = {}) {
    const summaries = [];

    for (const tracking of this.store.getTrackings()) {
      try {
        if (onProgress) onProgress({ tracking, status: 'checking' });
        const result = await this.#checkOne(tracking);
        if (!result) continue; // tracking was removed while this check was in flight
        summaries.push({ tracking: result.tracking, newItems: result.newItems, error: null });
        if (onProgress) onProgress({ tracking: result.tracking, status: 'done', newItems: result.newItems });
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        console.error(`TrackingChecker: check failed for tracking ${tracking.id} (${tracking.releaseTitle})`, err);
        const updateResult = await this.store.updateTrackingResult(tracking.id, { error: message });
        if (!updateResult) continue; // tracking was removed while this check was in flight
        summaries.push({ tracking: updateResult.tracking, newItems: [], error: message });
        if (onProgress) onProgress({ tracking: updateResult.tracking, status: 'error', error: message });
      }
    }

    return summaries;
  }

  async runSingleCheck(trackingId) {
    const tracking = this.store.getTracking(trackingId);
    if (!tracking) throw new Error('Tracking not found');
    const result = await this.#checkOne(tracking);
    if (!result) throw new Error('Tracking not found');
    return result;
  }

  /** Returns null if the tracking was removed while its scrape was in flight. */
  async #checkOne(tracking) {
    const isFirstCheck = !tracking.baselineEstablished;
    const items = await this.scraper.fetchListings({
      discogsType: tracking.discogsType,
      discogsId: tracking.discogsId,
      country: tracking.country,
    });

    const previouslySeen = new Set(tracking.seenListingIds);
    const newItems = isFirstCheck ? [] : items.filter((item) => !previouslySeen.has(item.id));

    const result = await this.store.updateTrackingResult(tracking.id, { items });
    if (!result) return null;
    return { tracking: result.tracking, newItems };
  }
}

module.exports = { TrackingChecker };
