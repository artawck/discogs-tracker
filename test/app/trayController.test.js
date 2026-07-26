'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeElectron, uninstallFakeElectron } = require('../helpers/fakeElectron');
const { fakeI18n } = require('../helpers/fakeI18n');

let TrayController;

test.before(() => {
  installFakeElectron();
  ({ TrayController } = require('../../src/app/TrayController'));
});

test.after(() => {
  uninstallFakeElectron();
});

function make(overrides = {}) {
  const calls = { open: 0, checkNow: 0, quit: 0 };
  const tray = new TrayController({
    i18n: fakeI18n(),
    onOpen: () => calls.open++,
    onCheckNow: () => calls.checkNow++,
    onQuit: () => calls.quit++,
    ...overrides,
  });
  return { tray, calls };
}

test('refreshMenu() before build() is a no-op (no tray yet)', () => {
  const { tray } = make();
  assert.doesNotThrow(() => tray.refreshMenu());
});

test('build() creates the tray icon, sets a tooltip, and wires a menu', () => {
  const electron = require('electron');
  const { tray } = make();
  tray.build();

  assert.equal(electron.Tray.instances.length, 1);
  const trayInstance = electron.Tray.instances[0];
  assert.equal(trayInstance.toolTip, 'Discogs Tracker');
  assert.ok(trayInstance.contextMenu);
});

test('clicking the tray icon invokes onOpen', () => {
  const electron = require('electron');
  const { tray, calls } = make();
  tray.build();
  const trayInstance = electron.Tray.instances[electron.Tray.instances.length - 1];
  trayInstance._handlers.click();
  assert.equal(calls.open, 1);
});

test('the context menu template invokes the right callbacks for open/checkNow/quit', () => {
  const electron = require('electron');
  const { tray, calls } = make();
  tray.build();
  const trayInstance = electron.Tray.instances[electron.Tray.instances.length - 1];
  const template = trayInstance.contextMenu.template;

  assert.equal(template.length, 4);
  template[0].click();
  template[1].click();
  template[3].click();
  assert.deepEqual(calls, { open: 1, checkNow: 1, quit: 1 });
  assert.equal(template[2].type, 'separator');
});

test('refreshMenu() rebuilds the context menu using current i18n translations', () => {
  const electron = require('electron');
  const { tray } = make();
  tray.build();
  const trayInstance = electron.Tray.instances[electron.Tray.instances.length - 1];

  const before = trayInstance.contextMenu.template[0].label;
  assert.match(before, /tray\.open/);

  tray.refreshMenu();
  const after = trayInstance.contextMenu.template[0].label;
  assert.equal(after, before);
});
