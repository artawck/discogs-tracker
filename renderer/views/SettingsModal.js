'use strict';

import { el, wireModalKeyboard } from '../util/dom.js';

/** Settings modal. Theme and language apply live; the rest saves on demand. */
export class SettingsModal {
  #app;

  constructor(app) {
    this.#app = app;
  }

  wireEvents() {
    const app = this.#app;

    el('settingsBtn').addEventListener('click', () => this.open());
    el('cancelSettingsBtn').addEventListener('click', () => this.close());
    el('saveSettingsBtn').addEventListener('click', () => this.#save());

    const enterTriggers = (id, fn) =>
      el(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          fn();
        }
      });
    enterTriggers('tokenInput', () => this.#save());
    enterTriggers('checkTimeInput', () => this.#save());

    // Theme and language are live preferences: apply immediately and persist
    // right away, independent of the Save button used for the other fields.
    el('themeSelect').addEventListener('change', async (e) => {
      const theme = e.target.value;
      app.applyTheme(theme);
      const result = await app.api.updateSettings({ theme });
      app.state.settings = result.settings;
    });
    el('languageSelect').addEventListener('change', async (e) => {
      await app.setLanguage(e.target.value);
      const result = await app.api.updateSettings({ language: app.state.settings.language });
      app.state.settings = result.settings;
    });

    wireModalKeyboard(el('settingsModal'), () => this.close());
  }

  open() {
    const { settings } = this.#app.state;
    el('tokenInput').value = settings.discogsToken || '';
    const h = String(settings.checkHour ?? 9).padStart(2, '0');
    const m = String(settings.checkMinute ?? 0).padStart(2, '0');
    el('checkTimeInput').value = `${h}:${m}`;
    el('launchAtLoginInput').checked = !!settings.launchAtLogin;
    el('themeSelect').value = settings.theme || 'system';
    el('languageSelect').value = settings.language || 'en';
    el('settingsModal').classList.remove('hidden');
    el('tokenInput').focus();
  }

  close() {
    el('settingsModal').classList.add('hidden');
  }

  async #save() {
    const app = this.#app;
    const [h, m] = el('checkTimeInput').value.split(':').map((n) => parseInt(n, 10));
    const patch = {
      discogsToken: el('tokenInput').value.trim(),
      checkHour: Number.isFinite(h) ? h : 9,
      checkMinute: Number.isFinite(m) ? m : 0,
      launchAtLogin: el('launchAtLoginInput').checked,
    };
    const result = await app.api.updateSettings(patch);
    app.state.settings = result.settings;
    app.renderNextRun(result.nextRunAt);
    this.close();
  }
}
