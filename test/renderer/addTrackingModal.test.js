'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installJsdom, uninstallJsdom } = require('../helpers/jsdomEnv');
const { fakeApp } = require('../helpers/fakeRendererApp');

let AddTrackingModal;
let AppState;

test.before(async () => {
  installJsdom();
  ({ AddTrackingModal } = await import('../../renderer/views/AddTrackingModal.js'));
  ({ AppState } = await import('../../renderer/state/AppState.js'));
  uninstallJsdom();
});

test.beforeEach(() => {
  installJsdom();
});

test.afterEach(() => {
  uninstallJsdom();
});

function makeModal(overrides = {}) {
  const state = overrides.state || new AppState();
  state.countries = overrides.countries || ['Germany', 'United Kingdom'];
  const app = fakeApp({ state, ...overrides.app });
  const modal = new AddTrackingModal(app);
  return { modal, app, state };
}

test('populateCountryDatalist(): fills the <datalist> with one <option> per country', () => {
  const { modal } = makeModal({ countries: ['Germany', 'United Kingdom', 'Japan'] });
  modal.populateCountryDatalist();

  const options = [...document.querySelectorAll('#countryOptions option')].map((o) => o.value);
  assert.deepEqual(options, ['Germany', 'United Kingdom', 'Japan']);
});

test('open(): resets the form, shows the modal, and focuses the artist input', () => {
  const { modal, state } = makeModal();
  document.getElementById('artistInput').value = 'leftover';
  document.getElementById('addModal').classList.add('hidden');

  modal.open();

  assert.equal(document.getElementById('artistInput').value, '');
  assert.equal(document.getElementById('addModal').classList.contains('hidden'), false);
  assert.equal(document.activeElement, document.getElementById('artistInput'));
  assert.equal(state.addFlow.mode, 'artist');
  assert.equal(document.getElementById('confirmAddBtn').disabled, true);
});

test('close(): hides the modal', () => {
  const { modal } = makeModal();
  document.getElementById('addModal').classList.remove('hidden');
  modal.close();
  assert.equal(document.getElementById('addModal').classList.contains('hidden'), true);
});

test('wireEvents(): the "Add tracking" button opens the modal', () => {
  const { modal } = makeModal();
  modal.wireEvents();
  document.getElementById('addTrackingBtn').click();
  assert.equal(document.getElementById('addModal').classList.contains('hidden'), false);
});

test('wireEvents(): switching to Label Mode toggles sections and the active tab state', () => {
  const { modal } = makeModal();
  modal.wireEvents();
  modal.open();

  document.getElementById('modeLabelBtn').click();

  assert.equal(document.getElementById('labelModeSection').classList.contains('hidden'), false);
  assert.equal(document.getElementById('artistModeSection').classList.contains('hidden'), true);
  assert.equal(document.getElementById('modeLabelBtn').classList.contains('active'), true);
  assert.equal(document.getElementById('modeLabelBtn').getAttribute('aria-selected'), 'true');
  assert.equal(document.getElementById('modeArtistBtn').classList.contains('active'), false);
});

test('artist search: shows a prompt and does not call the API when the input is empty', async () => {
  let called = false;
  const { modal } = makeModal({ app: { api: { searchArtists: async () => { called = true; return []; } } } });
  modal.wireEvents();
  modal.open();

  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();

  assert.equal(called, false);
  assert.match(document.getElementById('artistSearchStatus').textContent, /addModal\.enterArtist/);
});

test('artist search: renders candidates on success, and picking one shows the selected banner', async () => {
  const candidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  const { modal, state } = makeModal({ app: { api: { searchArtists: async (q) => { assert.equal(q, 'Boards of Canada'); return candidates; } } } });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';

  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  const items = document.querySelectorAll('#artistCandidateList .candidate-item');
  assert.equal(items.length, 1);
  assert.match(items[0].textContent, /Boards of Canada/);

  items[0].click();

  assert.deepEqual(state.addFlow.selectedArtist, candidates[0]);
  assert.equal(document.getElementById('artistInput').disabled, true);
  assert.equal(document.getElementById('selectedArtistBanner').classList.contains('hidden'), false);
  assert.equal(document.getElementById('afterArtistSection').classList.contains('hidden'), false);
  assert.equal(document.getElementById('countrySection').classList.contains('hidden'), false);
  assert.equal(document.getElementById('confirmAddBtn').disabled, false); // no album typed -> ready as-is
});

test('artist search: shows a "no matches" message when the API returns an empty list', async () => {
  const { modal } = makeModal({ app: { api: { searchArtists: async () => [] } } });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Nonexistent';

  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.match(document.getElementById('artistSearchStatus').textContent, /addModal\.noArtistMatches/);
  assert.equal(document.querySelectorAll('#artistCandidateList .candidate-item').length, 0);
});

test('artist search: shows the error message on API failure', async () => {
  const { modal } = makeModal({ app: { api: { searchArtists: async () => { throw new Error('rate limited'); } } } });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Blur';

  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(document.getElementById('artistSearchStatus').textContent, 'rate limited');
});

test('the "Change" button on the selected-artist banner reverts artist selection', async () => {
  const candidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  const { modal, state } = makeModal({ app: { api: { searchArtists: async () => candidates } } });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';
  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#artistCandidateList .candidate-item').click();

  document.querySelector('#selectedArtistBanner button').click();

  assert.equal(state.addFlow.selectedArtist, null);
  assert.equal(document.getElementById('artistInput').disabled, false);
  assert.equal(document.getElementById('selectedArtistBanner').classList.contains('hidden'), true);
  assert.equal(document.getElementById('afterArtistSection').classList.contains('hidden'), true);
  assert.equal(document.getElementById('confirmAddBtn').disabled, true);
});

test('confirm is disabled while an album is typed but no album candidate has been picked yet', async () => {
  const candidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  const { modal } = makeModal({ app: { api: { searchArtists: async () => candidates } } });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';
  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#artistCandidateList .candidate-item').click();

  document.getElementById('albumInput').value = 'Geo';
  document.getElementById('albumInput').dispatchEvent(new window.Event('input'));

  assert.equal(document.getElementById('confirmAddBtn').disabled, true);
});

test('album search: renders candidates, and picking one enables confirm and marks it selected', async () => {
  const artistCandidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  const albumCandidates = [
    { id: 10, type: 'master', title: 'Geogaddi', year: 2002, format: 'Vinyl', country: 'UK', thumb: null },
  ];
  const { modal, state } = makeModal({
    app: {
      api: {
        searchArtists: async () => artistCandidates,
        searchAlbums: async (artistName, album) => {
          assert.equal(artistName, 'Boards of Canada');
          assert.equal(album, 'Geogaddi');
          return albumCandidates;
        },
      },
    },
  });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';
  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#artistCandidateList .candidate-item').click();

  document.getElementById('albumInput').value = 'Geogaddi';
  document.getElementById('searchAlbumBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  const items = document.querySelectorAll('#albumCandidateList .candidate-item');
  assert.equal(items.length, 1);
  items[0].click();

  assert.equal(state.addFlow.selectedAlbumKey, 'master:10');
  assert.equal(document.getElementById('confirmAddBtn').disabled, false);
  assert.equal(document.querySelector('#albumCandidateList .candidate-item').classList.contains('selected'), true);
});

test('editing the album input after picking a candidate clears the selection and disables confirm again', async () => {
  const artistCandidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  const albumCandidates = [{ id: 10, type: 'master', title: 'Geogaddi', year: 2002, format: '', country: null, thumb: null }];
  const { modal, state } = makeModal({
    app: { api: { searchArtists: async () => artistCandidates, searchAlbums: async () => albumCandidates } },
  });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';
  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#artistCandidateList .candidate-item').click();
  document.getElementById('albumInput').value = 'Geogaddi';
  document.getElementById('searchAlbumBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#albumCandidateList .candidate-item').click();
  assert.equal(document.getElementById('confirmAddBtn').disabled, false);

  document.getElementById('albumInput').value = 'Geogaddi (2)';
  document.getElementById('albumInput').dispatchEvent(new window.Event('input'));

  assert.equal(state.addFlow.selectedAlbumKey, null);
  assert.equal(document.getElementById('confirmAddBtn').disabled, true);
  assert.equal(document.querySelectorAll('#albumCandidateList .candidate-item').length, 0);
});

test('label search + select: enables confirm and shows the label banner', async () => {
  const labelCandidates = [{ id: 5, type: 'label', title: 'Warp Records', thumb: null }];
  const { modal, state } = makeModal({ app: { api: { searchLabels: async () => labelCandidates } } });
  modal.wireEvents();
  modal.open();
  document.getElementById('modeLabelBtn').click();
  document.getElementById('labelInput').value = 'Warp';

  document.getElementById('searchLabelBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#labelCandidateList .candidate-item').click();

  assert.deepEqual(state.addFlow.selectedLabel, labelCandidates[0]);
  assert.equal(document.getElementById('labelInput').disabled, true);
  assert.equal(document.getElementById('countrySection').classList.contains('hidden'), false);
  assert.equal(document.getElementById('confirmAddBtn').disabled, false);
});

test('confirm (artist mode, no album): calls api.addTracking with the artist candidate, then closes and selects the new tracking', async () => {
  const artistCandidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  const newTrackings = [{ id: 'new-id', mode: 'artist', artist: 'Boards of Canada' }];
  let addedPayload;
  let selectCalls = 0;
  const trackingListRenders = [];
  const { modal, state, app } = makeModal({
    app: {
      api: {
        searchArtists: async () => artistCandidates,
        addTracking: async (payload) => {
          addedPayload = payload;
          return newTrackings;
        },
      },
      trackingList: { render: () => trackingListRenders.push('render') },
      trackingDetail: { render: () => {}, renderSortIndicators: () => {} },
    },
  });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';
  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#artistCandidateList .candidate-item').click();
  document.getElementById('countryInput').value = 'United Kingdom';

  document.getElementById('confirmAddBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(addedPayload, {
    mode: 'artist',
    artist: 'Boards of Canada',
    album: '',
    country: 'United Kingdom',
    discogsType: 'artist',
    discogsId: 1,
    releaseTitle: 'Boards of Canada',
  });
  assert.equal(document.getElementById('addModal').classList.contains('hidden'), true);
  assert.equal(state.selectedId, 'new-id');
  assert.deepEqual(state.trackings, newTrackings);
  assert.equal(document.getElementById('confirmAddBtn').disabled, false);
});

test('confirm: an empty country field defaults the payload country to "Any"', async () => {
  const artistCandidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  let addedPayload;
  const { modal } = makeModal({
    app: { api: { searchArtists: async () => artistCandidates, addTracking: async (p) => { addedPayload = p; return [{ id: 'x' }]; } } },
  });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';
  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#artistCandidateList .candidate-item').click();

  document.getElementById('confirmAddBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(addedPayload.country, 'Any');
});

test('confirm (label mode): builds the label payload', async () => {
  const labelCandidates = [{ id: 5, type: 'label', title: 'Warp Records', thumb: null }];
  let addedPayload;
  const { modal } = makeModal({
    app: { api: { searchLabels: async () => labelCandidates, addTracking: async (p) => { addedPayload = p; return [{ id: 'x' }]; } } },
  });
  modal.wireEvents();
  modal.open();
  document.getElementById('modeLabelBtn').click();
  document.getElementById('labelInput').value = 'Warp';
  document.getElementById('searchLabelBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#labelCandidateList .candidate-item').click();

  document.getElementById('confirmAddBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(addedPayload, {
    mode: 'label',
    label: 'Warp Records',
    country: 'Any',
    discogsType: 'label',
    discogsId: 5,
    releaseTitle: 'Warp Records',
  });
});

test('confirm: a failed addTracking surfaces the error via app.showError() and re-enables the button', async () => {
  const artistCandidates = [{ id: 1, type: 'artist', title: 'Boards of Canada', thumb: null }];
  let errorMessage;
  const { modal } = makeModal({
    app: {
      api: { searchArtists: async () => artistCandidates, addTracking: async () => { throw new Error('add failed'); } },
      showError: (msg) => (errorMessage = msg),
    },
  });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Boards of Canada';
  document.getElementById('searchArtistBtn').click();
  await Promise.resolve();
  await Promise.resolve();
  document.querySelector('#artistCandidateList .candidate-item').click();

  document.getElementById('confirmAddBtn').click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errorMessage, 'add failed');
  assert.equal(document.getElementById('addModal').classList.contains('hidden'), false);
  assert.equal(document.getElementById('confirmAddBtn').disabled, false);
});

test('pressing Enter in the artist input triggers a search', async () => {
  let called = false;
  const { modal } = makeModal({ app: { api: { searchArtists: async () => { called = true; return []; } } } });
  modal.wireEvents();
  modal.open();
  document.getElementById('artistInput').value = 'Blur';

  document.getElementById('artistInput').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(called, true);
});
