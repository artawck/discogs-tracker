'use strict';

const { DiscogsEntityType } = require('../domain/constants');

const API_BASE = 'https://api.discogs.com';
const USER_AGENT = 'DiscogsTracker/1.0 (+desktop marketplace tracker; personal use)';

/** Thin client over Discogs' official, documented /database/search endpoint. */
class DiscogsApiClient {
  constructor(store) {
    this.store = store;
  }

  /**
   * Find candidate Discogs artists matching a name, so the user can pick the
   * exact one (Discogs disambiguates same-named artists, e.g. "Blur (2)").
   */
  async searchArtists(artist) {
    const body = await this.#search({ q: artist, type: DiscogsEntityType.ARTIST, per_page: '10', page: '1' });
    return this.#dedupedCandidates(body.results, (r) => this.#candidate(r, DiscogsEntityType.ARTIST));
  }

  /**
   * Find candidate Discogs labels matching a name, so the user can pick the
   * exact one (Discogs disambiguates same-named labels too).
   */
  async searchLabels(label) {
    const body = await this.#search({ q: label, type: DiscogsEntityType.LABEL, per_page: '10', page: '1' });
    return this.#dedupedCandidates(body.results, (r) => this.#candidate(r, DiscogsEntityType.LABEL));
  }

  /**
   * Resolve an album to candidate Discogs master/release entries, scoped to
   * an already-confirmed artist name. Masters are always preferred over a
   * specific pressing, since a master aggregates listings across every
   * edition. If a direct master-type search finds nothing, we still avoid
   * defaulting to an arbitrary single pressing: release-type results carry
   * their own master_id when they belong to one, so those get collapsed into
   * that master instead. Only genuinely master-less releases are offered as
   * individual "release" candidates.
   */
  async searchAlbums(artistName, album) {
    const masterBody = await this.#search({
      artist: artistName,
      release_title: album,
      type: DiscogsEntityType.MASTER,
      per_page: '10',
      page: '1',
    });
    if (masterBody.results?.length) {
      return this.#dedupedCandidates(masterBody.results, (r) => this.#releaseLikeCandidate(r, DiscogsEntityType.MASTER));
    }

    const releaseBody = await this.#search({
      artist: artistName,
      release_title: album,
      type: DiscogsEntityType.RELEASE,
      per_page: '25',
      page: '1',
    });

    const masters = new Map(); // master_id -> candidate
    const standaloneReleases = new Map(); // release id -> candidate
    for (const r of releaseBody.results || []) {
      if (r.master_id) {
        if (!masters.has(r.master_id)) {
          masters.set(
            r.master_id,
            this.#releaseLikeCandidate({ ...r, id: r.master_id }, DiscogsEntityType.MASTER, artistName),
          );
        }
      } else if (!standaloneReleases.has(r.id)) {
        standaloneReleases.set(r.id, this.#releaseLikeCandidate(r, DiscogsEntityType.RELEASE, artistName));
      }
    }
    return [...masters.values(), ...standaloneReleases.values()];
  }

  async #search(params) {
    const qs = new URLSearchParams(params);
    const token = this.store.getSettings().discogsToken;
    if (token) qs.set('token', token);

    const res = await fetch(`${API_BASE}/database/search?${qs.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.status === 429) {
      throw new Error('Discogs API rate limit reached. Wait a minute and try again.');
    }
    if (!res.ok) {
      throw new Error(`Discogs search failed (${res.status}).`);
    }
    return res.json();
  }

  /** Candidate for a plain artist/label search hit: title used as-is. */
  #candidate(r, type) {
    return { id: r.id, type, title: r.title, year: null, format: '', country: null, thumb: r.thumb || null };
  }

  /**
   * Candidate for a master/release search hit. Only strips the "Artist - "
   * prefix when an artistName is given: direct master-type search results
   * are already just the album title, but release-type results (and the
   * masters we derive from them) come back as "Artist - Title".
   */
  #releaseLikeCandidate(r, type, artistName) {
    return {
      id: r.id,
      type,
      title: artistName ? DiscogsApiClient.#stripArtistPrefix(r.title, artistName) : r.title,
      year: r.year || null,
      format: Array.isArray(r.format) ? r.format.join(', ') : '',
      country: r.country || null,
      thumb: r.thumb || null,
    };
  }

  #dedupedCandidates(results, mapFn) {
    const seen = new Set();
    return (results || []).filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).map(mapFn);
  }

  static #stripArtistPrefix(title, artistName) {
    const prefix = `${artistName} - `;
    return title.startsWith(prefix) ? title.slice(prefix.length) : title;
  }
}

module.exports = { DiscogsApiClient };
