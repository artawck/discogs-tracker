'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeElectron, uninstallFakeElectron } = require('../helpers/fakeElectron');

let electron;
let WindowManager;

test.before(() => {
  electron = installFakeElectron();
  ({ WindowManager } = require('../../src/app/WindowManager'));
});

test.after(() => {
  uninstallFakeElectron();
});

test('show() creates a BrowserWindow with secure defaults on first call', () => {
  const wm = new WindowManager();
  assert.equal(wm.isOpen, false);

  wm.show();

  assert.equal(wm.isOpen, true);
  assert.equal(electron.BrowserWindow.instances.length, 1);
  const win = electron.BrowserWindow.instances[0];
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.shown, true);
});

test('show() re-shows and focuses the existing window instead of creating a second one', () => {
  const wm = new WindowManager();
  wm.show();
  const countAfterFirst = electron.BrowserWindow.instances.length;

  wm.show();

  assert.equal(electron.BrowserWindow.instances.length, countAfterFirst);
  assert.equal(electron.BrowserWindow.instances[countAfterFirst - 1].focused, true);
});

test('window becoming null after "closed" lets show() create a fresh window', () => {
  const wm = new WindowManager();
  wm.show();
  const first = electron.BrowserWindow.instances[electron.BrowserWindow.instances.length - 1];
  first.simulateClosed();
  assert.equal(wm.isOpen, false);

  wm.show();
  assert.equal(wm.isOpen, true);
});

test('send() delivers to the window webContents when open, and is a no-op when closed', () => {
  const wm = new WindowManager();
  wm.send('some-channel', { a: 1 }); // no window yet — must not throw

  wm.show();
  wm.send('some-channel', { a: 1 });
  const win = electron.BrowserWindow.instances[electron.BrowserWindow.instances.length - 1];
  assert.deepEqual(win.webContents._sentMessages, [{ channel: 'some-channel', payload: { a: 1 } }]);
});

test('openExternalDiscogsLink: accepts discogs.com and www.discogs.com', () => {
  const wm = new WindowManager();
  wm.openExternalDiscogsLink('https://discogs.com/release/123');
  wm.openExternalDiscogsLink('https://www.discogs.com/sell/item/456');
  assert.deepEqual(electron.shell.calls, [
    'https://discogs.com/release/123',
    'https://www.discogs.com/sell/item/456',
  ]);
});

test('openExternalDiscogsLink: rejects a hostname that merely ends with "discogs.com"', () => {
  const wm = new WindowManager();
  electron.shell.calls.length = 0;
  wm.openExternalDiscogsLink('https://evildiscogs.com/phish');
  wm.openExternalDiscogsLink('https://discogs.com.evil.com/');
  assert.deepEqual(electron.shell.calls, []);
});

test('openExternalDiscogsLink: rejects non-https and malformed URLs', () => {
  const wm = new WindowManager();
  electron.shell.calls.length = 0;
  wm.openExternalDiscogsLink('http://discogs.com/');
  wm.openExternalDiscogsLink('not a url');
  assert.deepEqual(electron.shell.calls, []);
});
