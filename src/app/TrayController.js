'use strict';

const { Tray, Menu, nativeImage } = require('electron');

/** Owns the menu-bar/tray icon and its (language-aware) context menu. */
class TrayController {
  #i18n;
  #onOpen;
  #onCheckNow;
  #onQuit;
  #tray = null;

  constructor({ i18n, onOpen, onCheckNow, onQuit }) {
    this.#i18n = i18n;
    this.#onOpen = onOpen;
    this.#onCheckNow = onCheckNow;
    this.#onQuit = onQuit;
  }

  build() {
    const icon = nativeImage.createFromNamedImage('NSImageNameMultipleDocuments', [0, 0]);
    this.#tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    this.#tray.setToolTip('Discogs Tracker');
    this.#tray.on('click', () => this.#onOpen());
    this.refreshMenu();
  }

  /** Rebuilds the context menu; call again after the language changes. */
  refreshMenu() {
    if (!this.#tray) return;
    const menu = Menu.buildFromTemplate([
      { label: this.#i18n.t('tray.open'), click: () => this.#onOpen() },
      { label: this.#i18n.t('tray.checkNow'), click: () => this.#onCheckNow() },
      { type: 'separator' },
      { label: this.#i18n.t('tray.quit'), click: () => this.#onQuit() },
    ]);
    this.#tray.setContextMenu(menu);
  }
}

module.exports = { TrayController };
