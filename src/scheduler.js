'use strict';

/** Fires a callback once a day at a configurable time, rescheduling itself. */
class DailyScheduler {
  #getSettings;
  #onDue;
  #timer = null;

  constructor({ getSettings, onDue }) {
    this.#getSettings = getSettings;
    this.#onDue = onDue;
  }

  start() {
    this.#scheduleNext();
  }

  stop() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** Re-reads settings and reschedules; call after the check time changes. */
  reschedule() {
    this.stop();
    this.#scheduleNext();
  }

  nextRunAt() {
    const { checkHour, checkMinute } = this.#getSettings();
    const now = new Date();
    const next = new Date(now);
    next.setHours(checkHour, checkMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  #scheduleNext() {
    const delay = Math.max(1000, this.nextRunAt().getTime() - Date.now());
    this.#timer = setTimeout(async () => {
      try {
        await this.#onDue();
      } catch (err) {
        console.error('DailyScheduler: scheduled check failed unexpectedly', err);
      } finally {
        this.#scheduleNext();
      }
    }, delay);
  }
}

module.exports = { DailyScheduler };
