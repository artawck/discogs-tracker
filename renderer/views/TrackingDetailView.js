'use strict';

import { el, escapeHtml } from '../util/dom.js';

const CONDITION_RANK = [
  ['Mint (M)', 8],
  ['Near Mint (NM or M-)', 7],
  ['Near Mint', 7],
  ['Very Good Plus (VG+)', 6],
  ['Very Good (VG)', 5],
  ['Good Plus (G+)', 4],
  ['Good (G)', 3],
  ['Fair (F)', 2],
  ['Poor (P)', 1],
  ['Generic', 0],
];

function conditionRank(str) {
  // null (not -1) for missing/unrecognized: the sort comparator's
  // "missing values sort last" check tests for null/undefined/'', and -1 is
  // a real (falsy-but-not-missing) rank that would sort as worse than even
  // "Poor (P)" instead of being pushed to the end like every other column.
  if (!str) return null;
  const hit = CONDITION_RANK.find(([key]) => str.includes(key));
  return hit ? hit[1] : null;
}

function priceValue(str) {
  if (!str) return null;
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

const SORTERS = {
  artist: (item) => (item.artist || '').toLowerCase(),
  edition: (item) => (item.edition || '').toLowerCase(),
  price: priceValue,
  condition: (item) => conditionRank(item.condition),
  sleeveCondition: (item) => conditionRank(item.sleeveCondition),
  label: (item) => (item.label || '').toLowerCase(),
  catno: (item) => (item.catno || '').toLowerCase(),
  seller: (item) => (item.seller || '').toLowerCase(),
  country: (item) => (item.country || '').toLowerCase(),
};

/** Renders the selected tracking's header, metadata, and sortable listings table. */
export class TrackingDetailView {
  #app;

  constructor(app) {
    this.#app = app;
  }

  wireEvents() {
    const { state } = this.#app;
    for (const th of document.querySelectorAll('#listingsHeaderRow th.sortable')) {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (state.sort.col === col) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort = { col, dir: 'asc' };
        }
        this.render();
      });
    }

    el('removeTrackingBtn').addEventListener('click', async () => {
      const { state, api } = this.#app;
      if (!state.selectedId) return;
      state.trackings = await api.removeTracking(state.selectedId);
      state.selectedId = null;
      this.#app.trackingList.render();
      this.render();
    });
  }

  render() {
    const app = this.#app;
    const tracking = app.state.getSelectedTracking();
    el('emptyState').classList.toggle('hidden', !!tracking);
    el('trackingDetail').classList.toggle('hidden', !tracking);
    if (!tracking) return;

    const kind = app.trackingKind(tracking);
    el('detailTitle').innerHTML =
      `<span class="kind-badge kind-badge--${kind}">${escapeHtml(app.trackingKindLabel(tracking))}</span> ` +
      escapeHtml(app.trackingTitle(tracking));
    const lastChecked = tracking.lastCheckedAt
      ? new Date(tracking.lastCheckedAt).toLocaleString()
      : app.t('detail.never');
    el('detailMeta').textContent = app.t('detail.meta', { country: tracking.country, date: lastChecked });

    const errorEl = el('detailError');
    if (tracking.lastError) {
      errorEl.textContent = app.t('detail.lastCheckFailed', { error: tracking.lastError });
      errorEl.classList.remove('hidden');
    } else {
      errorEl.classList.add('hidden');
    }

    this.renderSortIndicators();
    this.#renderRows(tracking);
  }

  renderSortIndicators() {
    const app = this.#app;
    for (const th of document.querySelectorAll('#listingsHeaderRow th.sortable')) {
      const col = th.dataset.col;
      const arrow = app.state.sort.col === col ? (app.state.sort.dir === 'asc' ? '▲' : '▼') : '';
      th.innerHTML = `${escapeHtml(app.t('table.' + col))}<span class="arrow">${arrow}</span>`;
    }
  }

  #sortedItems(items) {
    const { col, dir } = this.#app.state.sort;
    if (!col) return items;
    const keyFn = SORTERS[col];
    const sign = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = keyFn(a);
      const bv = keyFn(b);
      const aMissing = av === null || av === undefined || av === '';
      const bMissing = bv === null || bv === undefined || bv === '';
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1; // missing values always sort last
      if (bMissing) return -1;
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
  }

  #renderRows(tracking) {
    const app = this.#app;
    const body = el('listingsBody');
    body.innerHTML = '';
    const newIds = app.state.newIdsByTracking[tracking.id] || new Set();

    for (const item of this.#sortedItems(tracking.items)) {
      const tr = document.createElement('tr');
      if (newIds.has(item.id)) tr.classList.add('is-new');
      tr.innerHTML = `
        <td>${escapeHtml(item.artist || '—')}</td>
        <td>${escapeHtml(item.edition)}${item.format ? `<div class="muted">${escapeHtml(item.format)}</div>` : ''}</td>
        <td>${escapeHtml(item.price || '—')}${item.shipping ? `<div class="muted">+ ${escapeHtml(item.shipping)} shipping</div>` : ''}</td>
        <td>${escapeHtml(item.condition || '—')}</td>
        <td>${escapeHtml(item.sleeveCondition || '—')}</td>
        <td>${escapeHtml(item.label || '—')}</td>
        <td>${escapeHtml(item.catno || '—')}</td>
        <td>${escapeHtml(item.seller || '—')}</td>
        <td>${escapeHtml(item.country || '—')}</td>
        <td><a href="#" data-url="${encodeURI(item.listingUrl)}" class="open-link">${escapeHtml(app.t('table.view'))}</a></td>
      `;
      body.appendChild(tr);
    }
    el('noListings').classList.toggle('hidden', tracking.items.length !== 0);

    for (const a of body.querySelectorAll('.open-link')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        app.api.openLink(a.dataset.url);
      });
    }
  }
}
