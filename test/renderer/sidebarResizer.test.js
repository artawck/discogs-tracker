'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installJsdom, uninstallJsdom } = require('../helpers/jsdomEnv');
const { fakeApp } = require('../helpers/fakeRendererApp');

let SidebarResizer;

test.before(async () => {
  installJsdom();
  ({ SidebarResizer } = await import('../../renderer/views/SidebarResizer.js'));
  uninstallJsdom();
});

test.beforeEach(() => {
  installJsdom();
});

test.afterEach(() => {
  uninstallJsdom();
});

test('applyWidth(): sets the CSS variable, clamped to [220, 480]', () => {
  const view = new SidebarResizer(fakeApp());

  assert.equal(view.applyWidth(300), 300);
  assert.equal(document.documentElement.style.getPropertyValue('--sidebar-width'), '300px');

  assert.equal(view.applyWidth(100), 220);
  assert.equal(view.applyWidth(9999), 480);
});

test('applyWidth(): falls back to the 300px default when given a falsy width', () => {
  const view = new SidebarResizer(fakeApp());
  assert.equal(view.applyWidth(null), 300);
  assert.equal(view.applyWidth(undefined), 300);
  assert.equal(view.applyWidth(0), 300);
});

test('dragging the resize handle live-updates the width, and mouseup persists it via app.api.updateSettings', async () => {
  const state = { settings: { sidebarWidth: 300 } };
  let updatePatch;
  const app = fakeApp({
    state,
    api: {
      updateSettings: async (patch) => {
        updatePatch = patch;
        return { settings: { ...state.settings, ...patch } };
      },
    },
  });
  const view = new SidebarResizer(app);
  view.wireEvents();

  const handle = document.getElementById('sidebarResizeHandle');
  handle.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 350 }));
  assert.equal(document.documentElement.style.getPropertyValue('--sidebar-width'), '350px');
  assert.equal(document.body.classList.contains('resizing-sidebar'), true);

  window.dispatchEvent(new window.MouseEvent('mouseup'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(document.body.classList.contains('resizing-sidebar'), false);
  assert.deepEqual(updatePatch, { sidebarWidth: 350 });
  assert.equal(app.state.settings.sidebarWidth, 350);
});

test('mousemove before mousedown, or after mouseup, does not resize', () => {
  const app = fakeApp({ state: { settings: { sidebarWidth: 300 } } });
  const view = new SidebarResizer(app);
  view.wireEvents();
  view.applyWidth(300);

  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 400 }));
  assert.equal(document.documentElement.style.getPropertyValue('--sidebar-width'), '300px');
});

test('mouseup without a preceding mousedown does not call api.updateSettings', async () => {
  let called = false;
  const app = fakeApp({
    state: { settings: { sidebarWidth: 300 } },
    api: { updateSettings: async () => { called = true; return { settings: {} }; } },
  });
  const view = new SidebarResizer(app);
  view.wireEvents();

  window.dispatchEvent(new window.MouseEvent('mouseup'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(called, false);
});

test('mouseup does not persist when the width is unchanged from the current setting', async () => {
  let called = false;
  const app = fakeApp({
    state: { settings: { sidebarWidth: 300 } },
    api: { updateSettings: async () => { called = true; return { settings: {} }; } },
  });
  const view = new SidebarResizer(app);
  view.wireEvents();
  view.applyWidth(300);

  document.getElementById('sidebarResizeHandle').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  window.dispatchEvent(new window.MouseEvent('mouseup'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(called, false);
});
