'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installJsdom, uninstallJsdom } = require('../helpers/jsdomEnv');
const { fakeApp } = require('../helpers/fakeRendererApp');

let SettingsModal;

test.before(async () => {
  installJsdom();
  ({ SettingsModal } = await import('../../renderer/views/SettingsModal.js'));
  uninstallJsdom();
});

test.beforeEach(() => {
  installJsdom();
});

test.afterEach(() => {
  uninstallJsdom();
});

function settings(overrides = {}) {
  return {
    discogsToken: '',
    checkHour: 9,
    checkMinute: 1,
    launchAtLogin: false,
    theme: 'system',
    language: 'en',
    sidebarWidth: 300,
    ...overrides,
  };
}

test('open(): populates every field from app.state.settings and shows the modal', () => {
  const state = { settings: settings({ discogsToken: 'tok', checkHour: 14, checkMinute: 5, launchAtLogin: true, theme: 'sunrise', language: 'uk' }) };
  const modal = new SettingsModal(fakeApp({ state }));
  document.getElementById('settingsModal').classList.add('hidden');

  modal.open();

  assert.equal(document.getElementById('tokenInput').value, 'tok');
  assert.equal(document.getElementById('checkTimeInput').value, '14:05');
  assert.equal(document.getElementById('launchAtLoginInput').checked, true);
  assert.equal(document.getElementById('themeSelect').value, 'sunrise');
  assert.equal(document.getElementById('languageSelect').value, 'uk');
  assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), false);
  assert.equal(document.activeElement, document.getElementById('tokenInput'));
});

test('open(): falls back to sensible defaults for an empty/missing settings object', () => {
  const state = { settings: {} };
  const modal = new SettingsModal(fakeApp({ state }));
  modal.open();

  assert.equal(document.getElementById('tokenInput').value, '');
  assert.equal(document.getElementById('checkTimeInput').value, '09:00');
  assert.equal(document.getElementById('launchAtLoginInput').checked, false);
  assert.equal(document.getElementById('themeSelect').value, 'system');
  assert.equal(document.getElementById('languageSelect').value, 'en');
});

test('close(): hides the modal', () => {
  const modal = new SettingsModal(fakeApp({ state: { settings: settings() } }));
  document.getElementById('settingsModal').classList.remove('hidden');
  modal.close();
  assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), true);
});

test('wireEvents(): the settings button opens the modal', () => {
  const modal = new SettingsModal(fakeApp({ state: { settings: settings() } }));
  modal.wireEvents();
  document.getElementById('settingsBtn').click();
  assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), false);
});

test('wireEvents(): the cancel button closes the modal', () => {
  const modal = new SettingsModal(fakeApp({ state: { settings: settings() } }));
  modal.wireEvents();
  modal.open();
  document.getElementById('cancelSettingsBtn').click();
  assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), true);
});

test('save(): sends the token/check-time/launch-at-login patch, updates state, refreshes nextRun, and closes', async () => {
  const state = { settings: settings() };
  let patch;
  const nextRunCalls = [];
  const app = fakeApp({
    state,
    api: {
      updateSettings: async (p) => {
        patch = p;
        return { settings: { ...state.settings, ...p }, nextRunAt: '2024-01-01T09:00:00Z' };
      },
    },
    renderNextRun: (iso) => nextRunCalls.push(iso),
  });
  const modal = new SettingsModal(app);
  modal.wireEvents();
  modal.open();

  document.getElementById('tokenInput').value = '  my-token  ';
  document.getElementById('checkTimeInput').value = '20:30';
  document.getElementById('launchAtLoginInput').checked = true;

  document.getElementById('saveSettingsBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(patch, { discogsToken: 'my-token', checkHour: 20, checkMinute: 30, launchAtLogin: true });
  assert.equal(state.settings.discogsToken, 'my-token');
  assert.deepEqual(nextRunCalls, ['2024-01-01T09:00:00Z']);
  assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), true);
});

test('save(): an unparseable check time falls back to 09:00', async () => {
  let patch;
  const app = fakeApp({
    state: { settings: settings() },
    api: { updateSettings: async (p) => { patch = p; return { settings: {}, nextRunAt: '2024-01-01T00:00:00Z' }; } },
  });
  const modal = new SettingsModal(app);
  modal.wireEvents();
  modal.open();
  document.getElementById('checkTimeInput').value = '';

  document.getElementById('saveSettingsBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(patch.checkHour, 9);
  assert.equal(patch.checkMinute, 0);
});

test('save(): a failed update surfaces the error and leaves the modal open', async () => {
  let errorMessage;
  const app = fakeApp({
    state: { settings: settings() },
    api: { updateSettings: async () => { throw new Error('save failed'); } },
    showError: (msg) => (errorMessage = msg),
  });
  const modal = new SettingsModal(app);
  modal.wireEvents();
  modal.open();

  document.getElementById('saveSettingsBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errorMessage, 'save failed');
  assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), false);
});

test('pressing Enter in the token or check-time input triggers save', async () => {
  let saveCalls = 0;
  const app = fakeApp({
    state: { settings: settings() },
    api: { updateSettings: async () => { saveCalls++; return { settings: {}, nextRunAt: '2024-01-01T00:00:00Z' }; } },
  });
  const modal = new SettingsModal(app);
  modal.wireEvents();
  modal.open();

  document.getElementById('tokenInput').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(saveCalls, 1);
});

test('changing the theme select applies the theme immediately and persists it', async () => {
  const state = { settings: settings() };
  let applyThemeCalls = [];
  let patch;
  const app = fakeApp({
    state,
    applyTheme: (theme) => applyThemeCalls.push(theme),
    api: { updateSettings: async (p) => { patch = p; return { settings: { ...state.settings, ...p } }; } },
  });
  const modal = new SettingsModal(app);
  modal.wireEvents();
  modal.open();

  document.getElementById('themeSelect').value = 'sunrise';
  document.getElementById('themeSelect').dispatchEvent(new window.Event('change'));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(applyThemeCalls, ['sunrise']);
  assert.deepEqual(patch, { theme: 'sunrise' });
  assert.equal(state.settings.theme, 'sunrise');
});

test('theme update failure surfaces the error via app.showError()', async () => {
  let errorMessage;
  const app = fakeApp({
    state: { settings: settings() },
    api: { updateSettings: async () => { throw new Error('theme save failed'); } },
    showError: (msg) => (errorMessage = msg),
  });
  const modal = new SettingsModal(app);
  modal.wireEvents();
  modal.open();

  document.getElementById('themeSelect').value = 'sunrise';
  document.getElementById('themeSelect').dispatchEvent(new window.Event('change'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errorMessage, 'theme save failed');
});

test('changing the language select calls app.setLanguage() then persists the resulting language', async () => {
  const state = { settings: settings() };
  const setLanguageCalls = [];
  let patch;
  const app = fakeApp({
    state,
    setLanguage: async (lang) => {
      setLanguageCalls.push(lang);
      state.settings.language = lang; // mirrors what the real DiscogsTrackerApp.setLanguage() would do
    },
    api: { updateSettings: async (p) => { patch = p; return { settings: { ...state.settings, ...p } }; } },
  });
  const modal = new SettingsModal(app);
  modal.wireEvents();
  modal.open();

  document.getElementById('languageSelect').value = 'uk';
  document.getElementById('languageSelect').dispatchEvent(new window.Event('change'));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(setLanguageCalls, ['uk']);
  assert.deepEqual(patch, { language: 'uk' });
});

test('Escape closes the modal (wireModalKeyboard integration)', () => {
  const modal = new SettingsModal(fakeApp({ state: { settings: settings() } }));
  modal.wireEvents();
  modal.open();

  document.getElementById('settingsModal').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

  assert.equal(document.getElementById('settingsModal').classList.contains('hidden'), true);
});
