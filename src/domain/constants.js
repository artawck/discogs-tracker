'use strict';

/** What a Discogs search result / tracking target resolves to. */
const DiscogsEntityType = Object.freeze({
  MASTER: 'master',
  RELEASE: 'release',
  ARTIST: 'artist',
  LABEL: 'label',
});

/** Which "Add tracking" flow the user is in. */
const TrackingMode = Object.freeze({
  ARTIST: 'artist',
  LABEL: 'label',
});

/** Sentinel stored/compared when no seller-country filter is set. */
const ANY_COUNTRY = 'Any';

module.exports = { DiscogsEntityType, TrackingMode, ANY_COUNTRY };
