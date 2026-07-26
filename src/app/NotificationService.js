'use strict';

const { Notification } = require('electron');
const { TrackingMode, ANY_COUNTRY } = require('../domain/constants');

/** Builds and shows native OS notifications for newly-found listings. */
class NotificationService {
  #i18n;

  constructor(i18n) {
    this.#i18n = i18n;
  }

  /** Shows one notification summarizing a tracking's new listings, if any support exists. */
  notifyNewListings(tracking, newItems, onClick) {
    if (!Notification.isSupported() || newItems.length === 0) return;

    const label = this.#trackingLabel(tracking);
    const first = newItems[0];
    const price = first.price || this.#i18n.t('notif.priceNA');
    const body =
      newItems.length === 1
        ? this.#i18n.t('notif.bodySingle', { edition: first.edition, price })
        : this.#i18n.t('notif.bodyMultiple', { count: newItems.length, edition: first.edition, price });

    const notification = new Notification({ title: this.#i18n.t('notif.title', { label }), body });
    if (onClick) notification.on('click', onClick);
    notification.show();
  }

  #trackingLabel(tracking) {
    const base =
      tracking.mode === TrackingMode.LABEL
        ? `${tracking.label} ${this.#i18n.t('tracking.labelSuffix')}`
        : tracking.album
          ? `${tracking.artist} – ${tracking.album}`
          : `${tracking.artist} ${this.#i18n.t('tracking.allReleases')}`;
    return tracking.country && tracking.country !== ANY_COUNTRY ? `${base} (${tracking.country})` : base;
  }
}

module.exports = { NotificationService };
