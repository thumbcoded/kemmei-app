# Make this app a serverless, Electron-wrapped standalone app — plan

**Goal:** convert the existing web + Node/Mongo backend into a single distributable Electron app that runs locally without an HTTP server and without a separate MongoDB process.

## Checklist (requirements extracted)
- Replace external HTTP server with an in-process local API or direct module calls
- Remove dependency on a running MongoDB instance; use an embedded or file-based DB with persistent storage
- Create an Electron wrapper that serves UI from local files and provides access to local storage via IPC or a preload API
- Migrate backend code (`backend/server.js`, `backend/models/*.js`) to run inside Electron main or preload context
- Packaging and cross-platform build instructions (using `electron-builder` or similar)
- Seed/import data from existing `data/` and `data/cards/` into the embedded store
- Local authentication and session handling without remote server
- Documentation and quality gates (build, lint, tests, smoke test)

## High-level plan
1) Choose an embedded datastore (tradeoffs below)
2) Refactor backend to be a local module (no express listener) that provides the same operations (CRUD) as functions or IPC handlers
3) Create an Electron app: main process loads UI (`index.html` etc.), sets up IPC handlers that call the local backend module
4) Migrate schema/models: convert `backend/models/*` (Mongoose-based) to the embedded DB API and add a migration/seed step to import existing JSON data
5) Implement local auth (hashed local users file or SQLite with encryption if needed)
6) Wire UI to talk to IPC instead of fetch/XHR; where easier, expose backend methods through a preload script to renderer
7) Package and sign using `electron-builder`; create scripts for development and production builds

## Embedded DB options (pick one)
- SQLite (recommended): single file DB, strong query support, concurrency via WAL, cross-platform, many node bindings. Use `better-sqlite3` for simple sync usage or `sqlite3` for async.
- lowdb (JSON file): easiest migration from current JSON/data folder; simple but less robust for large data and concurrency.
- NeDB / LokiJS: file-backed, Mongo-like API (NeDB is unmaintained but simple). LokiJS is fast in-memory with persistence options.
- Realm / LevelDB: heavier; choose if you need advanced sync/ACID guarantees.

**Recommendation:** SQLite (`better-sqlite3`) for production-quality persistence; use `lowdb` for a quick prototype.

## Concrete migration steps (developer-focused)
--
Generated on: 2025-09-01

What I changed

Updated c:\Dox\SD\Kemmei-desktop\usr\MD desktop-offline.md with: brief status and next steps reflecting recent implementation work (Electron IPC shim, local SQLite API, progress/unlock persistence, renderer URL updates).

Recent changes (delta)

- Disabled admin UI by default using a single global flag `window.ADMIN_ENABLED = false` (set in `js/shared-ui.js`). Admin JS now early-returns when disabled.
- Guarded admin helper calls in `js/titmgr.js` and made `js/dropdowns.js`'s `populateAdminFormDropdownsFromMaps` a no-op when admin is disabled. This keeps admin files present but inert.
- Added persistent progress/test-completion/unlock storage in `backend/localApi-sqlite.js` (tables: `progress`, `test_completions`, `unlocks`) and functions `saveProgress`, `saveTestCompletion`, `saveUserUnlock`, `getUserProgress`, `getTestCompletions`, `getUserUnlocks`, and `clearUserProgress`.
- Expanded `electron/main.js` to expose IPC handlers for saving/reading progress, test-completions and unlocks and extended the generic RPC router to accept GET/POST/PUT/DELETE for those endpoints.
- Rewrote many renderer fetch URLs to use relative `/api/...` so the preload fetch-to-IPC shim routes requests to the local API (files updated include `js/flashcards.js`, `js/progress.js`, `js/titmgr.js`, `js/dropdowns.js`, `js/concur.js`, `js/register.js`, etc.).
- Fixed and cleaned `js/progress.js` (syntax and logic issues), rebuilt progress-tree rendering to consume persisted progress/test-completion/unlock data from the local API.
- Seed/import tooling: `scripts/seed-local.js` imports `data/cards/*` into SQLite; seed previously reported 2811 cards imported.


## Work completed so far (delta)

- Created root `package.json` with Electron/dev scripts and seed/build tasks — DONE
- Scaffolded `electron/main.js` and `electron/preload.js` with a fetch-to-IPC shim so existing renderer fetch('/api/...') calls route to the local API — DONE
- Implemented a SQLite-backed local API at `backend/localApi-sqlite.js` (using `sqlite3` + `sqlite` wrapper) exposing init/getCards/getCard/saveCard/getUsers and added persistent tables for `progress`, `test_completions`, and `unlocks` — DONE
- Implemented persistence functions: `getUserProgress`, `saveProgress`, `getTestCompletions`, `saveTestCompletion`, `getUserUnlocks`, `saveUserUnlock`, and `clearUserProgress` — DONE
- Added IPC handlers in `electron/main.js` (explicit handlers and expanded generic RPC router) for progress/test-completions/user-unlocks read/write/delete — DONE
- Replaced renderer hardcoded backend URLs with relative `/api/...` so the preload fetch shim forwards calls to the local API (updated `js/flashcards.js`, `js/progress.js`, `js/titmgr.js`, `js/dropdowns.js`, `js/concur.js`, `js/register.js`, `js/admin.js`, etc.) — DONE
- Fixed `js/progress.js` syntax/logical errors introduced earlier and rebuilt progress rendering logic to use the persisted progress/test-completion/unlock data — DONE
- Added seed/import scripts and utilities: `scripts/seed-local.js` (imports `data/cards/*` into SQLite) — seed reported 2811 cards imported earlier — DONE
- Added small utility scripts used during development: `scripts/check-db.js`, `scripts/test-user.js`, `scripts/clear-current-user.js` — DONE
- Removed admin UI links/assets from the main app flow and updated references — DONE

## New feature tasks (WIP)

These remaining items need UI wiring/testing and are next:

1) First-page / username flow — mostly implemented (index/dashboard wiring present), verify end-to-end and tidy persistence: WIP (needs final UI polish and automated tests)
2) Deck completion wiring — ensure renderer writes progress and test-completion records via `/api/test-completions/:userId/:key` and `/api/user-progress/:userId` (some client code already calls these endpoints; verify all paths) — WIP
3) Full Progress page verification — exercise save/clear flows and confirm persistence after restart (manual smoke test + optional automated script) — WIP

## Quick notes
- DB location: app data folder (e.g., `C:\Users\<you>\.kemmei\kemmei-data.sqlite`) — seed created the DB and imported cards.
- No remaining hardcoded http://localhost:3000/api URLs in the repo; renderer now uses `/api/...` to route through the preload shim.

If you want, I can now:
- Add a small smoke-test script that programmatically saves/reads/clears progress and prints results — quick verification.
- Wire any missing client-side writes (test completions/unlocks) where the UI doesn't yet POST to the new endpoints.

Commit message suggestion (concise):
"desktop-offline: wire renderer to local IPC API; add SQLite progress/test-completion/unlock persistence and IPC handlers"

If you'd like a shorter message, use: "desktop-offline: add local API + progress persistence"
- Added `scripts/check-db.js` to quickly verify DB path, total cards, and sample records — DONE
- Started Electron locally (dev mode) and verified the DB via `check-db.js` (Electron may exit in headless CI; run on desktop to interact) — PARTIAL (Electron start attempted; GUI should open on your desktop)

## New feature tasks (WIP)

These are new, requested app-level behaviors to implement. Mark items as WIP now; check as DONE after implementation and verification.

1) First-page / login flow
	 - Requirement: Replace the existing multi-page registration/login flow with a single first page that only asks for a username.
	 - Behavior:
		 - The first page (previous `index.html` flow) presents a single input for username. No registration page.
		 - On submit, the username is stored in the local DB (users table) as the current user. Create user record if not exists.
		 - After entering username, the app immediately displays the Dashboard view.
		 - The username must influence per-user progress tracking across all pages (progress, flashcards, selectors state). Persist current user selection across app restarts.
		 - Admin functionality (admin page link and admin UI: card browser, title manager, Concur, etc.) will be removed entirely for this offline build.
	 - Tasks to implement:
		 - Add UI for the username-first page and wire submit to `localApi.saveUser` (or createUser).
		 - Persist currently active user in app settings (use `electron-store` or store small record in SQLite) and expose via preload API (window.api.getCurrentUser/getOrCreateUser).
		 - Update existing pages to read current user from `window.api` on load and adapt displayed progress/state.
		 - Remove admin links and admin-only UI from templates and code paths.
	 - Status: WIP

	## Admin UI removal — current status

	- Admin navigation and links removed from main UI (dashboard, concur back links) — DONE
	- Admin pages and assets deleted from the offline build: `admin.html`, `js/admin.js`, `css/admin.css` — DONE
	- Remaining admin-like modules (titmgr, dropdown helpers) left intact if referenced by other pages; will be removed later if not needed — WIP

2) Progress page behavior
	 - Requirement: The Progress page will show per-user best results for completed decks; completion may be recorded at subdomain/domain/title granularities.
	 - Behavior:
		 - When a user finishes any deck (subdomain, domain, or title), record the best result for that deck level for that user in the DB.
		 - The Progress page summarizes progress across all cert/domain/subdomain/title hierarchies showing best score/last-played timestamps.
		 - Progress should be queryable by UI selectors and persist per-user.
	 - Tasks to implement:
		 - Extend `localApi` to provide saveProgress(userId, deckId, level, score, metadata) and getProgress(userId, filter) operations.
		 - Update deck-completion logic in renderer to call `window.api.saveProgress(...)` when a deck is completed.
		 - Implement Progress page aggregation queries (best score per deck) and UI rendering.
	 - Status: WIP

## How items will be marked DONE

- Implemented code: UI + backend endpoints + preload APIs. 
- Seeded/testing: seed scripts updated if schema changed and seed re-run as needed.
- Manual verification: open app, log in as sample user, complete a deck, confirm Progress page updates and saved state after restart.

If you'd like, I can implement (1) first-page username flow now (UI + localApi changes + preload methods), then follow with (2) the progress endpoints and UI wiring. Tell me which to implement first and I'll start making the changes and run the app to verify.