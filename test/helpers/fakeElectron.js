'use strict';

/**
 * Injects a fake 'electron' module into Node's require cache so
 * main-process classes can be required and tested through their real,
 * unmodified public methods — no real Electron runtime needed.
 *
 * Must be called before requiring any file that itself requires 'electron'.
 * Node's CommonJS resolver caches modules by resolved absolute path, so
 * pre-populating require.cache at that path makes every subsequent
 * require('electron') (including from the modules under test) return this
 * fake instead of actually resolving the real package.
 */
function installFakeElectron() {
  const key = require.resolve('electron');

  const notificationInstances = [];
  class FakeNotification {
    static isSupported() {
      return FakeNotification._supported !== false;
    }
    constructor(options) {
      this.options = options;
      this._handlers = {};
      this.shown = false;
      notificationInstances.push(this);
    }
    on(event, cb) {
      this._handlers[event] = cb;
      return this;
    }
    show() {
      this.shown = true;
    }
    /** Test helper: simulate the user clicking the notification. */
    simulateClick() {
      if (this._handlers.click) this._handlers.click();
    }
  }
  FakeNotification._supported = true;
  FakeNotification.instances = notificationInstances;

  const shellCalls = [];
  const fakeShell = {
    openExternal: (url) => {
      shellCalls.push(url);
    },
    calls: shellCalls,
  };

  function makeFakeWebContents() {
    const handlers = {};
    const sentMessages = [];
    return {
      on: (event, cb) => {
        handlers[event] = cb;
      },
      setWindowOpenHandler: (fn) => {
        handlers.windowOpenHandler = fn;
      },
      send: (channel, payload) => {
        sentMessages.push({ channel, payload });
      },
      _handlers: handlers,
      _sentMessages: sentMessages,
    };
  }

  const browserWindowInstances = [];
  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = makeFakeWebContents();
      this._closedHandlers = [];
      // Real BrowserWindows are visible on construction unless { show: false }
      // is passed — WindowManager relies on this and never calls .show()
      // explicitly for a freshly-created window.
      this.shown = options?.show !== false;
      this.focused = false;
      this.loadedFile = null;
      browserWindowInstances.push(this);
    }
    show() {
      this.shown = true;
    }
    focus() {
      this.focused = true;
    }
    loadFile(path) {
      this.loadedFile = path;
    }
    on(event, cb) {
      if (event === 'closed') this._closedHandlers.push(cb);
    }
    /** Test helper: simulate the OS closing this window. */
    simulateClosed() {
      for (const cb of this._closedHandlers) cb();
    }
  }
  FakeBrowserWindow.instances = browserWindowInstances;

  const trayInstances = [];
  class FakeTray {
    constructor(icon) {
      this.icon = icon;
      this.toolTip = null;
      this.contextMenu = null;
      this._handlers = {};
      trayInstances.push(this);
    }
    setToolTip(text) {
      this.toolTip = text;
    }
    setContextMenu(menu) {
      this.contextMenu = menu;
    }
    on(event, cb) {
      this._handlers[event] = cb;
    }
  }
  FakeTray.instances = trayInstances;

  const fakeMenu = {
    buildFromTemplate: (template) => ({ template }),
  };

  const fakeNativeImage = {
    createFromNamedImage: () => ({ isEmpty: () => true }),
    createEmpty: () => ({ isEmpty: () => true }),
  };

  const ipcHandlers = new Map();
  const fakeIpcMain = {
    handle: (channel, fn) => {
      ipcHandlers.set(channel, fn);
    },
    handlers: ipcHandlers,
    /** Test helper: invoke a registered handler like Electron would. */
    invoke: (channel, ...args) => ipcHandlers.get(channel)(null, ...args),
  };

  const appHandlers = {};
  const fakeApp = {
    getPath: () => '/tmp/fake-user-data',
    on: (event, cb) => {
      appHandlers[event] = cb;
    },
    exit: (code) => {
      fakeApp.exitCalls.push(code);
    },
    exitCalls: [],
    setLoginItemSettings: (settings) => {
      fakeApp.loginItemSettings = settings;
    },
    _handlers: appHandlers,
  };

  const fakeElectron = {
    app: fakeApp,
    ipcMain: fakeIpcMain,
    shell: fakeShell,
    BrowserWindow: FakeBrowserWindow,
    Tray: FakeTray,
    Menu: fakeMenu,
    nativeImage: fakeNativeImage,
    Notification: FakeNotification,
  };

  require.cache[key] = {
    id: key,
    filename: key,
    loaded: true,
    exports: fakeElectron,
  };

  return fakeElectron;
}

/** Removes the fake 'electron' entry so a later real require('electron') (if any) isn't affected. */
function uninstallFakeElectron() {
  const key = require.resolve('electron');
  delete require.cache[key];
}

module.exports = { installFakeElectron, uninstallFakeElectron };
