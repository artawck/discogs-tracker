'use strict';

export function el(id) {
  return document.getElementById(id);
}

export function escapeHtml(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Makes a non-native element (e.g. a candidate <li>) keyboard-activatable like a button. */
export function makeFocusableListItem(li) {
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      li.click();
    }
  });
}

/** Escape closes the modal; Tab/Shift+Tab is trapped among its focusable children. */
export function wireModalKeyboard(modalEl, closeFn) {
  modalEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFn();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = Array.from(
      modalEl.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]'),
    ).filter((node) => node.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
