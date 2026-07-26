'use strict';

const { BrowserWindow, shell } = require('electron');
const path = require('path');

const PRELOAD_PATH = path.join(__dirname, '..', 'preload.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', '..', 'renderer', 'index.html');

/** Owns the single main BrowserWindow: creation, secure defaults, and messaging. */
class WindowManager {
  #window = null;

  /** Shows the window, creating it on first call, focusing it otherwise. */
  show() {
    if (this.#window) {
      this.#window.show();
      this.#window.focus();
      return;
    }

    this.#window = new BrowserWindow({
      width: 980,
      height: 680,
      title: 'Discogs Tracker',
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#window.loadFile(INDEX_HTML_PATH);
    this.#window.on('closed', () => {
      this.#window = null;
    });
    // Never allow this window to navigate to or open remote content.
    this.#window.webContents.on('will-navigate', (e) => e.preventDefault());
    this.#window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }

  get isOpen() {
    return this.#window !== null;
  }

  /** Sends an IPC event to the renderer, if the window currently exists. */
  send(channel, payload) {
    if (this.#window) this.#window.webContents.send(channel, payload);
  }

  /**
   * Hands a URL to the OS default browser, but only ever discogs.com links.
   * Scraped marketplace data should never be able to make us open an
   * arbitrary URL or scheme.
   */
  openExternalDiscogsLink(url) {
    try {
      const parsed = new URL(url);
      // A bare endsWith('discogs.com') check would also match
      // "evildiscogs.com" — require an exact host or a genuine subdomain.
      const isDiscogsHost = parsed.hostname === 'discogs.com' || parsed.hostname.endsWith('.discogs.com');
      if (parsed.protocol === 'https:' && isDiscogsHost) {
        shell.openExternal(url);
      }
    } catch {
      /* ignore malformed URLs */
    }
  }
}

module.exports = { WindowManager };
