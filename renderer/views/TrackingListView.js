'use strict';

import { el, escapeHtml } from '../util/dom.js';

/** Renders the sidebar tracking list: sorting, selection, remove, drag-and-drop reorder. */
export class TrackingListView {
  #app;

  constructor(app) {
    this.#app = app;
  }

  wireEvents() {
    el('sidebarSortMode').addEventListener('change', (e) => {
      this.#app.state.sidebarSortMode = e.target.value;
      this.render();
    });
  }

  render() {
    const ul = el('trackingList');
    ul.innerHTML = '';
    for (const tracking of this.#sortedTrackings()) {
      ul.appendChild(this.#buildItem(tracking));
    }
  }

  #sortedTrackings() {
    const { state } = this.#app;
    const list = [...state.trackings];
    switch (state.sidebarSortMode) {
      case 'name':
        return list.sort((a, b) =>
          this.#app.trackingTitle(a).toLowerCase().localeCompare(this.#app.trackingTitle(b).toLowerCase()),
        );
      case 'country':
        return list.sort((a, b) => (a.country || '').localeCompare(b.country || ''));
      case 'items':
        return list.sort((a, b) => b.items.length - a.items.length);
      case 'custom':
      default:
        return list; // already in stored `order` from the main process
    }
  }

  #buildItem(tracking) {
    const app = this.#app;
    const { state } = app;
    const li = document.createElement('li');
    li.className = 'tracking-item' + (tracking.id === state.selectedId ? ' active' : '');
    li.draggable = true;

    const newCount = (state.newIdsByTracking[tracking.id] || new Set()).size;
    const kind = app.trackingKind(tracking);
    li.innerHTML = `
      <div class="tracking-item-info">
        <div class="title">
          <span class="kind-badge kind-badge--${kind}">${escapeHtml(app.trackingKindLabel(tracking))}</span>
          ${escapeHtml(app.trackingTitle(tracking))}${newCount ? `<span class="badge">${escapeHtml(app.t('sidebar.newBadge', { count: newCount }))}</span>` : ''}
        </div>
        <div class="sub">${escapeHtml(tracking.country)} · ${escapeHtml(app.t('sidebar.listingsCount', { count: tracking.items.length }))}</div>
      </div>
      <button class="remove-icon" title="${escapeHtml(app.t('sidebar.removeTracking'))}" aria-label="${escapeHtml(app.t('sidebar.removeTracking'))}">🗑</button>
    `;

    li.addEventListener('click', () => app.selectTracking(tracking.id));
    li.querySelector('.remove-icon').addEventListener('click', async (e) => {
      e.stopPropagation();
      state.trackings = await app.api.removeTracking(tracking.id);
      if (state.selectedId === tracking.id) state.selectedId = null;
      this.render();
      app.trackingDetail.render();
    });

    this.#wireDragAndDrop(li, tracking);
    return li;
  }

  #wireDragAndDrop(li, tracking) {
    const { state } = this.#app;

    li.addEventListener('dragstart', (e) => {
      state.dragTrackingId = tracking.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tracking.id);
      requestAnimationFrame(() => li.classList.add('dragging'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (state.dragTrackingId === tracking.id) return;
      const rect = li.getBoundingClientRect();
      const isBefore = e.clientY - rect.top < rect.height / 2;
      li.classList.toggle('drag-over-top', isBefore);
      li.classList.toggle('drag-over-bottom', !isBefore);
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const position = li.classList.contains('drag-over-bottom') ? 'after' : 'before';
      this.#handleDrop(tracking.id, position);
    });
    li.addEventListener('dragend', () => {
      state.dragTrackingId = null;
      this.#clearDragIndicators();
    });
  }

  #clearDragIndicators() {
    for (const li of el('trackingList').querySelectorAll('.tracking-item')) {
      li.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    }
  }

  async #handleDrop(targetId, position) {
    const { state, api } = this.#app;
    const draggedId = state.dragTrackingId;
    this.#clearDragIndicators();
    if (!draggedId || draggedId === targetId) return;

    const currentIds = this.#sortedTrackings().map((t) => t.id);
    const withoutDragged = currentIds.filter((id) => id !== draggedId);
    const targetIndex = withoutDragged.indexOf(targetId);
    const insertAt = position === 'after' ? targetIndex + 1 : targetIndex;
    withoutDragged.splice(insertAt, 0, draggedId);

    state.sidebarSortMode = 'custom';
    el('sidebarSortMode').value = 'custom';
    state.trackings = await api.reorderTrackings(withoutDragged);
    this.render();
  }
}
