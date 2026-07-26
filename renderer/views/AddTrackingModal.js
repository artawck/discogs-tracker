'use strict';

import { el, escapeHtml, makeFocusableListItem, wireModalKeyboard } from '../util/dom.js';

/**
 * The "Add tracking" modal: two mutually exclusive flows sharing one form.
 * Artist Mode resolves an artist, then optionally narrows to one album/edition.
 * Label Mode resolves a label directly; the whole catalog is tracked.
 */
export class AddTrackingModal {
  #app;

  constructor(app) {
    this.#app = app;
  }

  populateCountryDatalist() {
    const datalist = el('countryOptions');
    datalist.innerHTML = '';
    for (const country of this.#app.state.countries) {
      const opt = document.createElement('option');
      opt.value = country;
      datalist.appendChild(opt);
    }
  }

  wireEvents() {
    el('addTrackingBtn').addEventListener('click', () => this.open());
    el('cancelAddBtn').addEventListener('click', () => this.close());
    el('modeArtistBtn').addEventListener('click', () => this.#setMode('artist'));
    el('modeLabelBtn').addEventListener('click', () => this.#setMode('label'));
    el('searchArtistBtn').addEventListener('click', () => this.#searchArtist());
    el('searchAlbumBtn').addEventListener('click', () => this.#searchAlbum());
    el('searchLabelBtn').addEventListener('click', () => this.#searchLabel());
    el('confirmAddBtn').addEventListener('click', () => this.#confirm());

    el('albumInput').addEventListener('input', () => {
      // Any edit invalidates a previously picked album candidate, since it
      // no longer necessarily matches what's now typed.
      this.#app.state.addFlow.selectedAlbumKey = null;
      el('albumCandidateList').innerHTML = '';
      el('albumSearchStatus').textContent = '';
      this.#updateConfirmEnabled();
    });

    const enterTriggers = (id, fn) =>
      el(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          fn();
        }
      });
    enterTriggers('artistInput', () => this.#searchArtist());
    enterTriggers('albumInput', () => this.#searchAlbum());
    enterTriggers('labelInput', () => this.#searchLabel());

    wireModalKeyboard(el('addModal'), () => this.close());
  }

  open() {
    el('artistInput').value = '';
    el('artistInput').disabled = false;
    el('albumInput').value = '';
    el('labelInput').value = '';
    el('labelInput').disabled = false;
    el('countryInput').value = '';
    el('artistCandidateList').innerHTML = '';
    el('artistSearchStatus').textContent = '';
    el('albumCandidateList').innerHTML = '';
    el('albumSearchStatus').textContent = '';
    el('labelCandidateList').innerHTML = '';
    el('labelSearchStatus').textContent = '';
    el('selectedArtistBanner').classList.add('hidden');
    el('selectedLabelBanner').classList.add('hidden');
    el('afterArtistSection').classList.add('hidden');
    el('searchArtistBtn').classList.remove('hidden');
    el('searchLabelBtn').classList.remove('hidden');
    el('countrySection').classList.add('hidden');

    this.#app.state.resetAddFlow();
    this.#setMode('artist');
    this.#updateConfirmEnabled();
    el('addModal').classList.remove('hidden');
    el('artistInput').focus();
  }

  close() {
    el('addModal').classList.add('hidden');
  }

  #setMode(mode) {
    const { addFlow } = this.#app.state;
    addFlow.mode = mode;
    el('modeArtistBtn').classList.toggle('active', mode === 'artist');
    el('modeArtistBtn').setAttribute('aria-selected', String(mode === 'artist'));
    el('modeLabelBtn').classList.toggle('active', mode === 'label');
    el('modeLabelBtn').setAttribute('aria-selected', String(mode === 'label'));
    el('artistModeSection').classList.toggle('hidden', mode !== 'artist');
    el('labelModeSection').classList.toggle('hidden', mode !== 'label');
    el('countrySection').classList.toggle(
      'hidden',
      mode === 'artist' ? !addFlow.selectedArtist : !addFlow.selectedLabel,
    );
    this.#updateConfirmEnabled();
  }

  #updateConfirmEnabled() {
    const { addFlow } = this.#app.state;
    let ready;
    if (addFlow.mode === 'label') {
      ready = !!addFlow.selectedLabel;
    } else {
      const albumTyped = el('albumInput').value.trim() !== '';
      ready = !!addFlow.selectedArtist && (!albumTyped || !!addFlow.selectedAlbumKey);
    }
    el('confirmAddBtn').disabled = !ready;
  }

  async #searchArtist() {
    const app = this.#app;
    const artist = el('artistInput').value.trim();
    if (!artist) {
      el('artistSearchStatus').textContent = app.t('addModal.enterArtist');
      return;
    }
    el('artistSearchStatus').textContent = app.t('addModal.searching');
    el('artistCandidateList').innerHTML = '';
    try {
      const candidates = await app.api.searchArtists(artist);
      app.state.addFlow.artistCandidates = candidates;
      if (candidates.length === 0) {
        el('artistSearchStatus').textContent = app.t('addModal.noArtistMatches');
        return;
      }
      el('artistSearchStatus').textContent = app.t('addModal.matchesFound', { count: candidates.length });
      this.#renderArtistCandidates();
    } catch (err) {
      el('artistSearchStatus').textContent = err.message || app.t('addModal.searchFailed');
    }
  }

  #renderArtistCandidates() {
    const app = this.#app;
    const ul = el('artistCandidateList');
    ul.innerHTML = '';
    for (const candidate of app.state.addFlow.artistCandidates) {
      const li = document.createElement('li');
      li.className = 'candidate-item';
      li.innerHTML = `<div class="title">${escapeHtml(candidate.title)}</div>`;
      li.addEventListener('click', () => this.#selectArtist(candidate));
      makeFocusableListItem(li);
      ul.appendChild(li);
    }
  }

  #selectArtist(candidate) {
    const app = this.#app;
    const { addFlow } = app.state;
    addFlow.selectedArtist = candidate;
    addFlow.albumCandidates = [];
    addFlow.selectedAlbumKey = null;

    el('artistInput').disabled = true;
    el('searchArtistBtn').classList.add('hidden');
    el('artistCandidateList').innerHTML = '';
    el('artistSearchStatus').textContent = '';

    const banner = el('selectedArtistBanner');
    banner.classList.remove('hidden');
    banner.innerHTML = `<span>${escapeHtml(app.t('addModal.selectedArtist', { name: candidate.title }))}</span>`;
    const changeBtn = document.createElement('button');
    changeBtn.textContent = app.t('addModal.change');
    changeBtn.addEventListener('click', () => {
      addFlow.selectedArtist = null;
      el('artistInput').disabled = false;
      el('searchArtistBtn').classList.remove('hidden');
      banner.classList.add('hidden');
      el('afterArtistSection').classList.add('hidden');
      el('countrySection').classList.add('hidden');
      this.#updateConfirmEnabled();
    });
    banner.appendChild(changeBtn);

    el('afterArtistSection').classList.remove('hidden');
    el('countrySection').classList.remove('hidden');
    this.#updateConfirmEnabled();
  }

  async #searchAlbum() {
    const app = this.#app;
    const { addFlow } = app.state;
    const album = el('albumInput').value.trim();
    if (!addFlow.selectedArtist || !album) {
      el('albumSearchStatus').textContent = app.t('addModal.enterAlbum');
      return;
    }
    el('albumSearchStatus').textContent = app.t('addModal.searching');
    el('albumCandidateList').innerHTML = '';
    addFlow.selectedAlbumKey = null;
    this.#updateConfirmEnabled();
    try {
      const candidates = await app.api.searchAlbums(addFlow.selectedArtist.title, album);
      addFlow.albumCandidates = candidates;
      if (candidates.length === 0) {
        el('albumSearchStatus').textContent = app.t('addModal.noAlbumMatches');
        return;
      }
      el('albumSearchStatus').textContent = app.t('addModal.matchesFound', { count: candidates.length });
      this.#renderAlbumCandidates();
    } catch (err) {
      el('albumSearchStatus').textContent = err.message || app.t('addModal.searchFailed');
    }
  }

  #renderAlbumCandidates() {
    const app = this.#app;
    const { addFlow } = app.state;
    const ul = el('albumCandidateList');
    ul.innerHTML = '';
    for (const candidate of addFlow.albumCandidates) {
      const key = `${candidate.type}:${candidate.id}`;
      const li = document.createElement('li');
      li.className = 'candidate-item' + (key === addFlow.selectedAlbumKey ? ' selected' : '');
      const subtitle = `${candidate.type === 'master' ? app.t('addModal.allEditions') : app.t('addModal.singleRelease')} · ${candidate.year || app.t('addModal.yearUnknown')}${candidate.format ? ' · ' + escapeHtml(candidate.format) : ''}`;
      li.innerHTML = `
        <div class="title">${escapeHtml(candidate.title)}</div>
        <div class="sub">${subtitle}</div>
      `;
      li.addEventListener('click', () => {
        addFlow.selectedAlbumKey = key;
        this.#updateConfirmEnabled();
        this.#renderAlbumCandidates();
        el('albumCandidateList').querySelector('.candidate-item.selected')?.focus();
      });
      makeFocusableListItem(li);
      ul.appendChild(li);
    }
  }

  async #searchLabel() {
    const app = this.#app;
    const label = el('labelInput').value.trim();
    if (!label) {
      el('labelSearchStatus').textContent = app.t('addModal.enterLabel');
      return;
    }
    el('labelSearchStatus').textContent = app.t('addModal.searching');
    el('labelCandidateList').innerHTML = '';
    try {
      const candidates = await app.api.searchLabels(label);
      app.state.addFlow.labelCandidates = candidates;
      if (candidates.length === 0) {
        el('labelSearchStatus').textContent = app.t('addModal.noLabelMatches');
        return;
      }
      el('labelSearchStatus').textContent = app.t('addModal.matchesFound', { count: candidates.length });
      this.#renderLabelCandidates();
    } catch (err) {
      el('labelSearchStatus').textContent = err.message || app.t('addModal.searchFailed');
    }
  }

  #renderLabelCandidates() {
    const app = this.#app;
    const ul = el('labelCandidateList');
    ul.innerHTML = '';
    for (const candidate of app.state.addFlow.labelCandidates) {
      const li = document.createElement('li');
      li.className = 'candidate-item';
      li.innerHTML = `<div class="title">${escapeHtml(candidate.title)}</div>`;
      li.addEventListener('click', () => this.#selectLabel(candidate));
      makeFocusableListItem(li);
      ul.appendChild(li);
    }
  }

  #selectLabel(candidate) {
    const app = this.#app;
    const { addFlow } = app.state;
    addFlow.selectedLabel = candidate;

    el('labelInput').disabled = true;
    el('searchLabelBtn').classList.add('hidden');
    el('labelCandidateList').innerHTML = '';
    el('labelSearchStatus').textContent = '';

    const banner = el('selectedLabelBanner');
    banner.classList.remove('hidden');
    banner.innerHTML = `<span>${escapeHtml(app.t('addModal.selectedLabel', { name: candidate.title }))}</span>`;
    const changeBtn = document.createElement('button');
    changeBtn.textContent = app.t('addModal.change');
    changeBtn.addEventListener('click', () => {
      addFlow.selectedLabel = null;
      el('labelInput').disabled = false;
      el('searchLabelBtn').classList.remove('hidden');
      banner.classList.add('hidden');
      el('countrySection').classList.add('hidden');
      this.#updateConfirmEnabled();
    });
    banner.appendChild(changeBtn);

    el('countrySection').classList.remove('hidden');
    this.#updateConfirmEnabled();
  }

  #buildArtistModePayload() {
    const { addFlow } = this.#app.state;
    const artistCandidate = addFlow.selectedArtist;
    if (!artistCandidate) return null;

    const album = el('albumInput').value.trim();
    const albumCandidate = album
      ? addFlow.albumCandidates.find((c) => `${c.type}:${c.id}` === addFlow.selectedAlbumKey)
      : null;
    if (album && !albumCandidate) return null;

    const target = albumCandidate || artistCandidate;
    return {
      mode: 'artist',
      artist: artistCandidate.title,
      album,
      country: el('countryInput').value.trim() || 'Any',
      discogsType: target.type,
      discogsId: target.id,
      releaseTitle: target.title,
    };
  }

  #buildLabelModePayload() {
    const { addFlow } = this.#app.state;
    const labelCandidate = addFlow.selectedLabel;
    if (!labelCandidate) return null;

    return {
      mode: 'label',
      label: labelCandidate.title,
      country: el('countryInput').value.trim() || 'Any',
      discogsType: 'label',
      discogsId: labelCandidate.id,
      releaseTitle: labelCandidate.title,
    };
  }

  async #confirm() {
    const app = this.#app;
    const payload = app.state.addFlow.mode === 'label' ? this.#buildLabelModePayload() : this.#buildArtistModePayload();
    if (!payload) return;

    el('confirmAddBtn').disabled = true;
    el('confirmAddBtn').textContent = app.t('addModal.confirmAdding');
    try {
      app.state.trackings = await app.api.addTracking(payload);
      this.close();
      app.trackingList.render();
      const added = app.state.trackings[app.state.trackings.length - 1];
      app.state.selectedId = added.id;
      app.trackingList.render();
      app.trackingDetail.render();
    } catch (err) {
      app.showError(err.message || app.t('addModal.searchFailed'));
    } finally {
      el('confirmAddBtn').disabled = false;
      el('confirmAddBtn').textContent = app.t('addModal.confirm');
    }
  }
}
