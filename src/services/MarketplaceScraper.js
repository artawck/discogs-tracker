'use strict';

require('../discogsLibPaths');
const { DiscogsMarketplace } = require('discogs-marketplace-api-nodejs');
const { CountryCatalog } = require('./CountryCatalog');
const { DiscogsEntityType, ANY_COUNTRY } = require('../domain/constants');

// Security note on the headless browser this library launches:
// It runs Chromium with the OS sandbox disabled (needed for it to start
// reliably across environments) and applies a stealth plugin to get past
// Cloudflare's bot check on discogs.com. We accept that tradeoff rather than
// re-implementing the launch ourselves, because it's meaningfully mitigated
// here: for the "legacy" search mode used below, the library disables
// JavaScript entirely in the browsing context (javaScriptEnabled: false), so
// the page is fetched and parsed as static HTML — there's no script
// execution surface for a compromised/malicious page to exploit even
// without the sandbox. The browser only ever navigates to discogs.com.

const PAGE_SIZE = 100;
// A single release/master rarely has more than a few hundred live listings.
const RELEASE_MAX_PAGES = 5;
// A whole artist's or label's catalog can be large (a prolific band or a
// major label can have thousands of listings); this is a background daily
// check, so we can afford to paginate further, bounded only as a safety net
// against runaway cases.
const WIDE_MAX_PAGES = 50;
const WIDE_SCOPE_TYPES = new Set([DiscogsEntityType.ARTIST, DiscogsEntityType.LABEL]);

/** Scrapes current Discogs marketplace listings for a master/release/artist/label. */
class MarketplaceScraper {
  /**
   * Fetch current marketplace listings for a Discogs master, release, artist
   * or label, filtered by seller country where possible.
   *
   * Country filtering is done server-side via the library's `from` parameter,
   * which — despite its docs implying a country name — actually expects the
   * 2-letter ISO code and silently filters out nothing if given anything else
   * (verified directly against the live site). We resolve the tracking's
   * country name to that code via the library's own lookup table. If for some
   * reason a name doesn't resolve, we fall back to fetching everything and
   * filtering client-side, so a tracking never silently loses its country
   * filter.
   */
  async fetchListings({ discogsType, discogsId, country }) {
    const baseParams = this.#buildBaseParams(discogsType, discogsId);

    const wantCountry = country && country !== ANY_COUNTRY ? country.trim() : null;
    const code = wantCountry ? CountryCatalog.codeFor(wantCountry) : null;
    if (wantCountry && code) baseParams.from = code;

    const maxPages = WIDE_SCOPE_TYPES.has(discogsType) ? WIDE_MAX_PAGES : RELEASE_MAX_PAGES;
    const allItems = await this.#fetchAllPages(baseParams, maxPages);

    // Belt-and-suspenders: re-check country client-side too (cheap, and
    // covers the fallback case where we couldn't resolve a code above).
    //
    // Compare by ISO code, not by raw name string: CountryCatalog offers
    // both the ISO name and Discogs' own (differently worded) alias for the
    // same country — e.g. "United Kingdom of Great Britain and Northern
    // Ireland" (ISO) and "United Kingdom" (Discogs alias) both resolve to
    // "GB". Scraped listings only ever carry the Discogs-alias wording, so
    // comparing the picked name against it as a literal string would silently
    // zero out results whenever the user picked the ISO variant. A resolved
    // code is unambiguous either way.
    const filtered = wantCountry
      ? allItems.filter((item) => this.#itemMatchesCountry(item, wantCountry, code))
      : allItems;

    return filtered.map((item) => this.#normalizeItem(item));
  }

  #itemMatchesCountry(item, wantCountry, code) {
    if (code) return item.country?.code === code;
    return (item.country?.name || '').trim().toLowerCase() === wantCountry.toLowerCase();
  }

  #buildBaseParams(discogsType, discogsId) {
    const baseParams = { api: 'legacy', sort: 'listed,desc', limit: PAGE_SIZE };
    if (discogsType === DiscogsEntityType.MASTER) baseParams.masterId = discogsId;
    else if (discogsType === DiscogsEntityType.ARTIST) baseParams.artistId = discogsId;
    else if (discogsType === DiscogsEntityType.LABEL) baseParams.labelId = discogsId;
    else baseParams.releaseId = discogsId;
    return baseParams;
  }

  async #fetchAllPages(baseParams, maxPages) {
    const allItems = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const result = await DiscogsMarketplace.search({ ...baseParams, page });
      allItems.push(...result.items);
      if (page >= result.page.total) break;
    }
    return allItems;
  }

  #normalizeItem(item) {
    return {
      id: String(item.id),
      artist: (item.artists || []).map((a) => a.name).filter(Boolean).join(', ') || null,
      edition: item.release?.name || item.title,
      format: (item.formats || []).join(', '),
      releaseUrl: item.release?.url || null,
      listingUrl: item.url,
      price: item.price?.base || null,
      shipping: item.price?.shipping || null,
      condition: item.condition?.media?.full || null,
      sleeveCondition: item.condition?.sleeve?.full || null,
      label: (item.labels || []).map((l) => l.name).filter(Boolean).join(', ') || null,
      catno: (item.catnos || []).filter(Boolean).join(', ') || null,
      seller: item.seller?.name || null,
      country: item.country?.name || null,
      listedAt: item.listedAt,
    };
  }
}

module.exports = { MarketplaceScraper };
