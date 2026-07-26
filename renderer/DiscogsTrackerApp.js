'use strict';

import { AppState } from './state/AppState.js';
import { TrackingListView } from './views/TrackingListView.js';
import { TrackingDetailView } from './views/TrackingDetailView.js';
import { AddTrackingModal } from './views/AddTrackingModal.js';
import { SettingsModal } from './views/SettingsModal.js';
import { SidebarResizer } from './views/SidebarResizer.js';
import { el } from './util/dom.js';
import { createI18n } from './i18n.js';

/** Renderer-side controller: owns shared state/i18n and wires the views together. */
export class DiscogsTrackerApp {
  api = window.discogsTracker;
  state = new AppState();
  /** Set in start(), once i18next has finished initializing. */
  i18n = null;

  trackingList = new TrackingListView(this);
  trackingDetail = new TrackingDetailView(this);
  addModal = new AddTrackingModal(this);
  settingsModal = new SettingsModal(this);
  sidebarResizer = new SidebarResizer(this);

  #toastTimer = null;

  t(key, vars) {
    return this.i18n.t(key, vars);
  }

  async start() {
    const initialState = await this.api.getState();
    this.state.trackings = initialState.trackings;
    this.state.settings = initialState.settings;
    this.state.countries = initialState.countries;

    this.i18n = await createI18n(this.state.settings.language || 'en');
    this.applyTheme(this.state.settings.theme);
    this.sidebarResizer.applyWidth(this.state.settings.sidebarWidth);
    await this.setLanguage(this.state.settings.language || 'en');
    this.renderNextRun(initialState.nextRunAt);
    this.setCheckingUI(!!initialState.checkInProgress);

    this.addModal.populateCountryDatalist();
    this.trackingList.render();
    this.#wireEvents();
    this.#wirePushEvents();
  }

  selectTracking(id) {
    this.state.selectedId = id;
    this.trackingList.render();
    this.trackingDetail.render();
  }

  applyTheme(theme) {
    document.documentElement.dataset.theme = theme || 'system';
  }

  async setLanguage(lang) {
    await this.i18n.changeLanguage(lang);
    this.state.settings.language = this.i18n.language;
    document.documentElement.lang = this.i18n.language;
    this.#applyTranslations();
  }

  renderNextRun(iso) {
    this.state.nextRunAt = iso;
    const date = new Date(iso).toLocaleString();
    el('nextRun').textContent = this.t('topbar.nextCheck', { date });
  }

  setCheckingUI(inProgress) {
    el('checkNowBtn').disabled = inProgress;
    el('checkNowBtn').textContent = inProgress ? this.t('checkNow.checking') : this.t('checkNow.idle');
  }

  /** Briefly surfaces an error to the user. message is shown as-is (not translated — see README's "Known limitations"). */
  showError(message) {
    const toast = el('toast');
    toast.textContent = this.t('common.error', { message });
    toast.classList.remove('hidden');
    if (this.#toastTimer) clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => toast.classList.add('hidden'), 5000);
  }

  trackingTitle(tracking) {
    if (tracking.mode === 'label') return tracking.label;
    return tracking.album ? `${tracking.artist} – ${tracking.album}` : tracking.artist;
  }

  /** 'art' | 'alb' | 'lab' — which kind badge a tracking should show. */
  trackingKind(tracking) {
    if (tracking.mode === 'label') return 'lab';
    return tracking.album ? 'alb' : 'art';
  }

  trackingKindLabel(tracking) {
    return this.t(`tracking.kind.${this.trackingKind(tracking)}`);
  }

  #applyTranslations() {
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = this.t(node.dataset.i18n);
    for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = this.t(node.dataset.i18nPlaceholder);
    for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = this.t(node.dataset.i18nTitle);

    this.setCheckingUI(el('checkNowBtn').disabled);
    if (this.state.nextRunAt) this.renderNextRun(this.state.nextRunAt);
    this.trackingDetail.renderSortIndicators();
    this.trackingList.render();
    if (this.state.selectedId) this.trackingDetail.render();
  }

  #wireEvents() {
    el('checkNowBtn').addEventListener('click', async () => {
      // Button state itself is driven entirely by the 'check-state' event
      // (fired for scheduled checks too, not just manual ones), not here.
      this.state.trackings = await this.api.checkNow();
      this.trackingList.render();
      if (this.state.selectedId) this.trackingDetail.render();
    });

    this.trackingList.wireEvents();
    this.trackingDetail.wireEvents();
    this.addModal.wireEvents();
    this.settingsModal.wireEvents();
    this.sidebarResizer.wireEvents();
  }

  #wirePushEvents() {
    this.api.onTrackingsUpdated((trackings) => {
      this.state.trackings = trackings;
      this.trackingList.render();
      if (this.state.selectedId) this.trackingDetail.render();
    });

    this.api.onProgress((evt) => {
      if (evt.status === 'done' && evt.newItemIds.length) {
        const set = this.state.newIdsByTracking[evt.trackingId] || new Set();
        for (const id of evt.newItemIds) set.add(id);
        this.state.newIdsByTracking[evt.trackingId] = set;
      }
    });

    this.api.onCheckState(({ inProgress }) => this.setCheckingUI(inProgress));

    this.api.onFocusTracking((id) => this.selectTracking(id));
  }
}
