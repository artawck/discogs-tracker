'use strict';

const { app, ipcMain } = require('electron');

const { Store } = require('../store');
const { DailyScheduler } = require('../scheduler');
const { CountryCatalog } = require('../services/CountryCatalog');
const { DiscogsApiClient } = require('../services/DiscogsApiClient');
const { MarketplaceScraper } = require('../services/MarketplaceScraper');
const { TrackingChecker } = require('../services/TrackingChecker');
const { WindowManager } = require('./WindowManager');
const { TrayController } = require('./TrayController');
const { NotificationService } = require('./NotificationService');
const { IpcChannels } = require('../ipcChannels');
const { initI18n } = require('../i18n');
const { DiscogsEntityType, TrackingMode } = require('../domain/constants');

/** Top-level controller that wires every service together and owns app lifecycle. */
class DiscogsTrackerApp {
  #store;
  #i18n;
  #discogsApi;
  #scraper;
  #checker;
  #notifications;
  #windowManager;
  #tray;
  #scheduler;
  #checkInProgress = false;

  async start() {
    this.#store = new Store(app.getPath('userData'));
    this.#i18n = await initI18n(this.#store.getSettings().language);
    this.#discogsApi = new DiscogsApiClient(this.#store);
    this.#scraper = new MarketplaceScraper();
    this.#checker = new TrackingChecker(this.#store, this.#scraper);
    this.#notifications = new NotificationService(this.#i18n);
    this.#windowManager = new WindowManager();
    this.#tray = new TrayController({
      i18n: this.#i18n,
      onOpen: () => this.#windowManager.show(),
      onCheckNow: () => this.#performCheck(),
      onQuit: () => app.exit(0),
    });

    this.#registerIpcHandlers();
    this.#tray.build();
    this.#windowManager.show();
    this.#applyLoginItemSetting();

    this.#scheduler = new DailyScheduler({
      getSettings: () => this.#store.getSettings(),
      onDue: () => this.#performCheck(),
    });
    this.#scheduler.start();

    app.on('activate', () => this.#windowManager.show());
  }

  async #performCheck() {
    if (this.#checkInProgress) return;
    this.#checkInProgress = true;
    this.#windowManager.send(IpcChannels.CHECK_STATE, { inProgress: true });

    try {
      const summaries = await this.#checker.runAllChecks({
        onProgress: (evt) => this.#windowManager.send(IpcChannels.TRACKING_PROGRESS, this.#serializeProgress(evt)),
      });

      for (const { tracking, newItems, error } of summaries) {
        if (error) continue;
        this.#notifications.notifyNewListings(tracking, newItems, () => {
          this.#windowManager.show();
          this.#windowManager.send(IpcChannels.FOCUS_TRACKING, tracking.id);
        });
      }

      this.#windowManager.send(IpcChannels.TRACKINGS_UPDATED, this.#store.getTrackings());
      return summaries;
    } finally {
      this.#checkInProgress = false;
      this.#windowManager.send(IpcChannels.CHECK_STATE, { inProgress: false });
    }
  }

  #serializeProgress(evt) {
    return {
      trackingId: evt.tracking.id,
      status: evt.status,
      newItemIds: evt.newItems ? evt.newItems.map((i) => i.id) : [],
      error: evt.error || null,
    };
  }

  #applyLoginItemSetting() {
    if (process.platform === 'linux') return; // not supported
    app.setLoginItemSettings({ openAtLogin: !!this.#store.getSettings().launchAtLogin, openAsHidden: true });
  }

  /**
   * The renderer is expected to only ever send well-formed payloads (built
   * from a resolved search candidate), but the IPC boundary is still a trust
   * boundary: reject anything malformed here rather than letting a bad
   * discogsId/discogsType silently persist and fail on every future check.
   */
  #validateAddTrackingPayload(payload) {
    const validTypes = Object.values(DiscogsEntityType);
    if (!payload || !validTypes.includes(payload.discogsType)) {
      throw new Error(`discogsType must be one of: ${validTypes.join(', ')}.`);
    }
    if (typeof payload.discogsId !== 'number' || !Number.isFinite(payload.discogsId)) {
      throw new Error('discogsId is required and must be a number.');
    }
    const validModes = Object.values(TrackingMode);
    if (payload.mode !== undefined && !validModes.includes(payload.mode)) {
      throw new Error(`mode must be one of: ${validModes.join(', ')}.`);
    }
  }

  #registerIpcHandlers() {
    ipcMain.handle(IpcChannels.GET_STATE, () => ({
      trackings: this.#store.getTrackings(),
      settings: this.#store.getSettings(),
      countries: CountryCatalog.all(),
      nextRunAt: this.#scheduler.nextRunAt().toISOString(),
      checkInProgress: this.#checkInProgress,
    }));

    ipcMain.handle(IpcChannels.SEARCH_ARTISTS, (_e, { artist }) => {
      if (!artist) throw new Error('Artist is required.');
      return this.#discogsApi.searchArtists(artist);
    });

    ipcMain.handle(IpcChannels.SEARCH_ALBUMS, (_e, { artistName, album }) => {
      if (!artistName || !album) throw new Error('Artist and album are required.');
      return this.#discogsApi.searchAlbums(artistName, album);
    });

    ipcMain.handle(IpcChannels.SEARCH_LABELS, (_e, { label }) => {
      if (!label) throw new Error('Label is required.');
      return this.#discogsApi.searchLabels(label);
    });

    ipcMain.handle(IpcChannels.ADD_TRACKING, async (_e, payload) => {
      this.#validateAddTrackingPayload(payload);
      const tracking = await this.#store.addTracking(payload);
      // Establish baseline immediately so the user sees results right away.
      try {
        await this.#checker.runSingleCheck(tracking.id);
      } catch (err) {
        console.error(`DiscogsTrackerApp: baseline check failed for new tracking ${tracking.id}`, err);
        await this.#store.updateTrackingResult(tracking.id, { error: err.message });
      }
      return this.#store.getTrackings();
    });

    ipcMain.handle(IpcChannels.REMOVE_TRACKING, async (_e, id) => {
      await this.#store.removeTracking(id);
      return this.#store.getTrackings();
    });

    ipcMain.handle(IpcChannels.REORDER_TRACKINGS, (_e, orderedIds) => this.#store.reorderTrackings(orderedIds));

    ipcMain.handle(IpcChannels.CHECK_NOW, async () => {
      await this.#performCheck();
      return this.#store.getTrackings();
    });

    ipcMain.handle(IpcChannels.UPDATE_SETTINGS, async (_e, patch) => {
      const settings = await this.#store.updateSettings(patch);
      await this.#i18n.changeLanguage(settings.language);
      this.#scheduler.reschedule();
      this.#applyLoginItemSetting();
      this.#tray.refreshMenu();
      return { settings, nextRunAt: this.#scheduler.nextRunAt().toISOString() };
    });

    ipcMain.handle(IpcChannels.OPEN_LINK, (_e, url) => this.#windowManager.openExternalDiscogsLink(url));
  }
}

module.exports = { DiscogsTrackerApp };
