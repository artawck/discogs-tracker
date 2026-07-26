# Discogs Tracker

A macOS desktop app that watches the Discogs marketplace for new listings matching artists, albums, or labels you care about, and notifies you when new ones show up.

## Features

- **Two tracking modes**
  - **Artist Mode** — track everything a specific artist sells, or narrow it down to one album/edition.
  - **Label Mode** — track a whole record label's catalog.
- **Seller country filtering**, resolved server-side against Discogs' own country list.
- **Daily automated checks** at a configurable time, plus a manual "Check now".
- **Native OS notifications** when new listings appear, with a click-through to the tracking.
- **Sortable, resizable, drag-to-reorder** tracking list.
- **Six themes** (System Default, Sundown, Sunrise, Blue Lagoon, Sex on the Beach, Green Mexico) plus English/Ukrainian localization, both switchable live from Settings.
- Keyboard-navigable modals (Escape to close, Tab trapped inside, Enter to trigger the relevant action).
- Launch-at-login support, so the daily check runs unattended.

## How it works

Discogs' official, documented API (`api.discogs.com`) only exposes an aggregate "number of items for sale" and a lowest price per release — it doesn't support browsing individual listings or filtering by seller country. To get real per-listing data (price, condition, seller, ship-from country, direct link), this app uses [`discogs-marketplace-api-nodejs`](https://github.com/KirianCaumes/Discogs-Marketplace-API-NodeJS), which drives a headless Chromium (via Playwright) to read the same data the discogs.com website itself uses. This is unofficial and undocumented by Discogs, so it's inherently more fragile than a sanctioned API — it could break if Discogs changes their site.

Two things worth knowing about this dependency, in case you're evaluating or maintaining this codebase:

- Its headless browser runs with the OS sandbox disabled to start reliably across environments. This is mitigated by the fact that the scraping mode used here (`api: 'legacy'`) also disables JavaScript entirely in the browsing context, and the browser only ever navigates to discogs.com — see `src/services/MarketplaceScraper.js` for the full reasoning.
- Its published npm package has a packaging bug (unresolved TypeScript path-alias `require()` calls in its compiled output). `src/discogsLibPaths.js` works around it via `NODE_PATH`, without patching the installed package.

Everything else — resolving an artist/album/label to a Discogs ID, and search — goes through the official, documented `api.discogs.com` REST API.

## Requirements

To *run* the packaged app: macOS (the packaged build targets `arm64`; Windows/Linux targets are configured in `package.json` but untested). No separate Node.js install needed — Electron bundles its own runtime.

To *build* it from source: [Node.js](https://nodejs.org/) 20+.

## Getting started

```bash
npm install        # also downloads a headless Chromium via Playwright (~550MB)
npm start           # run in development mode
npm run dist        # build a standalone Discogs Tracker.app in dist/
```

The packaged app is unsigned (no Apple Developer certificate), so macOS Gatekeeper will warn on first launch — right-click → Open once to clear it.

## Configuration

Everything is set from the ⚙ Settings panel in the app itself:

| Setting | Notes |
|---|---|
| Discogs personal access token | Optional. Raises the search rate limit from 25 to 60 requests/minute. Get one at discogs.com/settings/developers. |
| Daily check time | When the automated check runs. |
| Launch at login | Registers the app as a macOS login item so the daily check runs even if you never open it manually. |
| Theme | Applies immediately, no save needed. |
| Language | English or Ukrainian; applies immediately across the UI, notifications, and the tray menu. |

Settings and trackings are stored as JSON in the app's userData directory (`~/Library/Application Support/Discogs Tracker/discogs-tracker-data.json` on macOS).

## Project structure

```
src/                       Electron main process (Node/CommonJS)
  main.js                    bootstrap: creates DiscogsTrackerApp, starts it
  app/
    DiscogsTrackerApp.js       top-level orchestrator: lifecycle, IPC handlers
    WindowManager.js           BrowserWindow creation and secure defaults
    TrayController.js          menu-bar icon and context menu
    NotificationService.js     OS notification building
  services/
    DiscogsApiClient.js        official api.discogs.com search
    MarketplaceScraper.js      unofficial marketplace listing scrape (see above)
    TrackingChecker.js         diffs fresh listings against what's already been seen
    CountryCatalog.js          Discogs country name <-> ISO code lookup
  domain/constants.js          shared enums (entity types, tracking modes)
  store.js                     JSON persistence
  scheduler.js                 daily check timer
  i18n.js                      main-process i18next instance
  ipcChannels.js                shared IPC channel name constants
  preload.js                    contextBridge, sandboxed

renderer/                  Renderer process (ES modules, no bundler)
  app.js                     bootstrap: creates DiscogsTrackerApp, starts it
  DiscogsTrackerApp.js        renderer-side controller
  state/AppState.js            UI state
  views/                       TrackingListView, TrackingDetailView, AddTrackingModal,
                                SettingsModal, SidebarResizer
  util/dom.js                   small DOM helpers
  i18n.js                       renderer-side i18next instance
  translations.json             shared EN/UK dictionary (used by both processes)
```

The main process and renderer are separate JS runtimes (Node vs. sandboxed Chromium), so each initializes its own `i18next` instance from the same `renderer/translations.json`. Note: Electron's sandboxed preload context (`sandbox: true`) can only `require()` a fixed allowlist of built-ins, not arbitrary local files — that's why `preload.js` inlines its IPC channel name strings instead of importing `ipcChannels.js` like the rest of the main process does.

## Known limitations

- Marketplace data depends on an unofficial scraping method (see above) — if Discogs changes their site, checks may start failing until the upstream library is updated.
- A handful of rare backend error messages (Discogs rate-limit/network failures) are only shown in English regardless of the selected language.
- Unsigned build: no Apple notarization.

## License

MIT — see [LICENSE](./LICENSE).

## Acknowledgments

- [`discogs-marketplace-api-nodejs`](https://github.com/KirianCaumes/Discogs-Marketplace-API-NodeJS) (MIT) for marketplace scraping.
- [`i18next`](https://www.i18next.com/) (MIT) for localization.
