'use strict';

/**
 * Duck-typed fake for the `app` collaborator every renderer view class takes
 * in its constructor (real DiscogsTrackerApp wires window.discogsTracker,
 * i18next, and every other view together, which is too heavy to stand up
 * just to test one view in isolation) — mirrors the pattern already used for
 * main-process classes (e.g. TrackingChecker's fake store/scraper).
 */
function fakeApp(overrides = {}) {
  const app = {
    api: {},
    showError: () => {},
    applyTheme: () => {},
    setLanguage: async () => {},
    renderNextRun: () => {},
    t(key, vars) {
      return vars ? `${key}${JSON.stringify(vars)}` : key;
    },
    trackingTitle(tracking) {
      if (tracking.mode === 'label') return tracking.label;
      return tracking.album ? `${tracking.artist} – ${tracking.album}` : tracking.artist;
    },
    trackingKind(tracking) {
      if (tracking.mode === 'label') return 'lab';
      return tracking.album ? 'alb' : 'art';
    },
    ...overrides,
  };
  if (!overrides.trackingKindLabel) {
    app.trackingKindLabel = (tracking) => app.t(`tracking.kind.${app.trackingKind(tracking)}`);
  }
  app.trackingList = overrides.trackingList || { render: () => {} };
  app.trackingDetail = overrides.trackingDetail || { render: () => {}, renderSortIndicators: () => {} };
  return app;
}

module.exports = { fakeApp };
