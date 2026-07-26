'use strict';

import { el } from '../util/dom.js';

const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 300;

/** Drag-to-resize handle between the sidebar and the main panel. Persists the chosen width. */
export class SidebarResizer {
  #app;
  #dragging = false;

  constructor(app) {
    this.#app = app;
  }

  /** Applies a width immediately (e.g. on load, or live while dragging). */
  applyWidth(width) {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width || DEFAULT_WIDTH));
    document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);
    return clamped;
  }

  wireEvents() {
    const handle = el('sidebarResizeHandle');

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.#dragging = true;
      document.body.classList.add('resizing-sidebar');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.#dragging) return;
      // The sidebar starts flush against the left edge of the window, so
      // the cursor's viewport X position is the desired width directly.
      this.applyWidth(e.clientX);
    });

    window.addEventListener('mouseup', () => {
      if (!this.#dragging) return;
      this.#dragging = false;
      document.body.classList.remove('resizing-sidebar');
      this.#persistWidth();
    });
  }

  async #persistWidth() {
    const app = this.#app;
    const current = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'),
      10,
    );
    if (!Number.isFinite(current) || current === app.state.settings.sidebarWidth) return;

    const result = await app.api.updateSettings({ sidebarWidth: current });
    app.state.settings = result.settings;
  }
}
