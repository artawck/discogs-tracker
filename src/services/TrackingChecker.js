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
        const { tracking: updated, newItems } = await this.#checkOne(tracking);
        summaries.push({ tracking: updated, newItems, error: null });
        if (onProgress) onProgress({ tracking: updated, status: 'done', newItems });
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        console.error(`TrackingChecker: check failed for tracking ${tracking.id} (${tracking.releaseTitle})`, err);
        this.store.updateTrackingResult(tracking.id, { error: message });
        const current = this.store.getTracking(tracking.id);
        summaries.push({ tracking: current, newItems: [], error: message });
        if (onProgress) onProgress({ tracking: current, status: 'error', error: message });
      }
    }

    return summaries;
  }

  async runSingleCheck(trackingId) {
    const tracking = this.store.getTracking(trackingId);
    if (!tracking) throw new Error('Tracking not found');
    return this.#checkOne(tracking);
  }

  async #checkOne(tracking) {
    const isFirstCheck = tracking.lastCheckedAt === null;
    const items = await this.scraper.fetchListings({
      discogsType: tracking.discogsType,
      discogsId: tracking.discogsId,
      country: tracking.country,
    });

    const previouslySeen = new Set(tracking.seenListingIds);
    const newItems = isFirstCheck ? [] : items.filter((item) => !previouslySeen.has(item.id));

    const { tracking: updated } = this.store.updateTrackingResult(tracking.id, { items });
    return { tracking: updated, newItems };
  }
}

module.exports = { TrackingChecker };
