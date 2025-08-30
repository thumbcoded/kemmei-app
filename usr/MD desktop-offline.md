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
1. Add Electron skeleton
	- Add devDependencies: `electron`, `electron-builder`, `concurrently`, `electron-reload` (optional)
	- Add `electron/main.js` for Electron main process that loads `index.html` and creates IPC endpoints
2. Refactor `backend` into a local module
	- Convert `backend/server.js` to export functions instead of starting an Express server (e.g., init(storePath), getCards(filter), saveCard(card), getUser(id), createUser(user))
	- Keep an Express shim only if a lot of UI code uses fetch; otherwise replace fetch with IPC calls from renderer
3. Migrate models
	- Replace mongoose models in `backend/models` with a DAO layer backed by SQLite or lowdb. Keep same method names where possible to minimize UI changes.
4. Seed and data import
	- Create `scripts/seed-local.js` that reads `data/cards/*` and `API/api_cards_test.json` and writes to the embedded DB on first run (store a marker in app data dir)
5. Replace HTTP calls in renderer
	- Identify fetch/ajax in `js/*.js` and modify to call IPC methods (`window.api.invoke('getCards', {...})`) or use a preload exposing a `backend` API
6. Local auth/session
	- Implement local user store with salted+hashed passwords (use `bcryptjs` or `argon2`) stored in DB; session = in-memory currentUser in main process; optionally persist a small token if "remember me"
7. Packaging
	- Add `build` config in `package.json` for `electron-builder`; include UI files and `data/` folder
	- Test builds locally (Windows .exe first)

## Contract (small)
- Inputs: local UI events requesting data operations (cards, users, progress)
- Outputs: JS responses or IPC results; persistent storage in a single file in OS app-data folder
- Error modes: DB corruption (provide migration/repair), two-instance race (file locks/WAL), missing seed data

## Edge cases and mitigations
- Large dataset: prefer SQLite and implement pagination or virtualized lists
- Concurrency/multiple processes: avoid multiple instances; use file locking or SQLite WAL
- Data migration from Mongo: export JSON from Mongo and import via seed script; provide CLI `import-mongo-export.js`
- Sensitive data: encrypt DB or use OS-level protections; do not store plaintext passwords

## Quality gates and verification
- Build: run `npm run build:electron` (set up script) — PASS/FAIL
- Lint/typecheck: run project's linter if present; add ESLint if missing — PASS/FAIL
- Unit smoke test: tests for DAO layer (save/get card, user creation) using `jest` or `uvu` — PASS/FAIL
- Manual smoke: run packaged app and confirm UI loads, CRUD works, offline behavior correct

## Minimal next steps (practical immediate edits)
1. Add `package.json` scripts and install chosen DB binding + electron packages
2. Create `electron/main.js` and `electron/preload.js` with IPC stubs
3. Refactor `backend/server.js` into `backend/localApi.js` exporting functions
4. Implement seed script and first-run flow

## Notes and follow-ups
- Quick prototype path: use `lowdb` and expose APIs via IPC — fastest with minimal code changes.
- Production path: implement SQLite-backed DAOs, write a migration/import tool for existing data, add tests.
- Next: tell me which DB you prefer (SQLite or lowdb). I can then scaffold the Electron main/preload files and refactor `backend/server.js` into a local API in this repo.

--
Generated on: 2025-08-30



What I changed

Updated c:\Dox\SD\Kemmei-desktop\usr\MD desktop-offline.md with:
Goals, checklist, high-level plan
DB options and recommendation (SQLite/better-sqlite3 vs lowdb)
Concrete migration steps and minimal next actions
Contract, edge cases, quality gates, and follow-ups
What's next (pick one)

If you want a quick prototype: say "lowdb prototype" and I'll scaffold Electron main.js, preload.js, and a backend/localApi.js using lowdb, then wire renderer IPC and a seed script.
If you want production-ready persistence: say "SQLite" and I'll scaffold with better-sqlite3 DAOs, Electron bridge, and seed/import tooling.
Progress update: plan written and saved. Tell me which datastore you prefer (SQLite or lowdb) and I will begin scaffolding the Electron app and refactoring the backend in this repo.