'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', '..', 'renderer', 'index.html');

/**
 * Loads the real renderer/index.html into jsdom and installs it as the
 * global document/window, so view classes (which reference `document`,
 * `window`, `getComputedStyle` as bare globals, same as they do in the real
 * browser-hosted renderer) work unmodified under Node's test runner.
 */
function installJsdom() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  // Node's own built-in `navigator` global is read-only; redefine it instead of assigning.
  Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
  global.getComputedStyle = window.getComputedStyle.bind(window);
  global.HTMLElement = window.HTMLElement;
  global.Node = window.Node;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  return dom;
}

function uninstallJsdom() {
  delete global.window;
  delete global.document;
  delete global.navigator;
  delete global.getComputedStyle;
  delete global.HTMLElement;
  delete global.Node;
  delete global.requestAnimationFrame;
}

module.exports = { installJsdom, uninstallJsdom };
