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

What I changed (packaging & recent work)

This file was updated to reflect packaging and build work completed while converting the app into a single distributable Electron binary.

- Removed the hard native `sqlite3` packaging failure path by switching to a pure-wasm SQLite runtime for the packaged app (`sql.js`). This avoids compiling native addons during `electron-builder`.
- Added a `backend/localApi-sqljs.js` implementation that mirrors the `localApi-sqlite.js` API but uses `sql.js` (WASM) and persists the DB file to the user app-data folder.
- Updated `electron/main.js` to prefer the `localApi-sqljs.js` implementation when present (fallback to the sqlite native module during development).
- Updated `package.json` build config to include an `asarUnpack` entry for `node_modules/sql.js/dist/sql-wasm.wasm` so the WASM binary is accessible at runtime inside the packaged app.
- Added a minimal production menu (only File/Help/Quit) in `electron/main.js` when `app.isPackaged` is true so end-users don't see developer menus; dev runs still keep the full menu.
- Built the app with `electron-builder` and produced:
	- `build/kemmei-electron Setup 0.1.0.exe` (NSIS installer)
	- `build/win-unpacked/kemmei-electron.exe` (unpacked app you can run directly)
- Cleared user data during testing by deleting the app data folder (e.g., `%USERPROFILE%\.kemmei`) so the packaged app starts with a clean DB.
- Updated `.gitignore` to exclude `build/` and large binary artifacts; do not commit installers or unpacked builds to git (GitHub limits >100MB).

Why this matters

- The `sql.js` approach keeps the app fully self-contained without requiring native module compilation on the build machine or end-user machine.
- Unpacked binary (`win-unpacked`) is useful for manual testing; the installer provides one-time installation behavior (but note NSIS options control oneClick/perMachine).

How to run the packaged app locally

- Run unpacked binary (fast iteration):
	- `build\win-unpacked\kemmei-electron.exe`
- Or run the installer once, then launch from Start Menu / desktop shortcut.

How to rebuild (quick)

1) Ensure dev dependencies are installed:
	 - `npm install`
2) Rebuild the installer and unpacked app:
	 - `npm run build`
3) If a previous `build/win-unpacked` is in use by a running process, stop the app and remove `build/win-unpacked` before rebuilding (Access Denied locks common).

Notes on committing/build artifacts

- Keep `build/` in `.gitignore` (we added that). Do not commit installers or unpacked apps to the repo. Use GitHub Releases or an artifact store for distributed binaries.
- If `build/` was already checked in, stop tracking with:
	- `git rm -r --cached build`
	- `git commit -m "remove build artifacts from repo"`
	- `git push`

Recent changes (delta)

- Disabled admin UI by default using a single global flag `window.ADMIN_ENABLED = false` (set in `js/shared-ui.js`). Admin JS now early-returns when disabled.
- Guarded admin helper calls in `js/titmgr.js` and made `js/dropdowns.js`'s `populateAdminFormDropdownsFromMaps` a no-op when admin is disabled. This keeps admin files present but inert.
- Added persistent progress/test-completion/unlock storage in `backend/localApi-sqlite.js` (tables: `progress`, `test_completions`, `unlocks`) and functions `saveProgress`, `saveTestCompletion`, `saveUserUnlock`, `getUserProgress`, `getTestCompletions`, `getUserUnlocks`, and `clearUserProgress`.
- Expanded `electron/main.js` to expose IPC handlers for saving/reading progress, test-completions and unlocks and extended the generic RPC router to accept GET/POST/PUT/DELETE for those endpoints.
- Rewrote many renderer fetch URLs to use relative `/api/...` so the preload fetch-to-IPC shim routes requests to the local API (files updated include `js/flashcards.js`, `js/progress.js`, `js/titmgr.js`, `js/dropdowns.js`, `js/concur.js`, `js/register.js`, etc.).
- Fixed and cleaned `js/progress.js` (syntax and logic issues), rebuilt progress-tree rendering to consume persisted progress/test-completion/unlock data from the local API.
- Seed/import tooling: `scripts/seed-local.js` imports `data/cards/*` into SQLite; seed previously reported 2811 cards imported.
 - UI: changed flashcards navigation so the right-side 'Next' button shows "Finish" on the final card and is recolored green for emphasis (files: `js/flashcards.js`, `css/flashcards.css`).
 - Progress UI: replaced native/title tooltips on progress indicators with a single floating tooltip manager to avoid duplicate tooltips and clipping; removed tooltips on subdomains until unlock schema is settled (files: `js/progress.js`, `css/shared-ui.css`).

Recent UI tweaks

- Flashcards "Next" button: when the current card is the last card in the active deck the button label now reads "Finish" and uses a green `.btn.finish` style so users clearly see they're at the end of the deck. This is implemented in `js/flashcards.js` and styled in `css/flashcards.css`.

- Progress tooltips: progress indicators and unlock buttons no longer use native `title` tooltips (which caused duplicate native browser tooltips and layout clipping). Instead, `data-tooltip` + `.has-tooltip` are used with a floating tooltip manager that appends a single `.progress-tooltip` element to `document.body` and positions it to avoid clipping. Subdomain tooltips were removed for now until we finalize the unlock schema. Files: `js/progress.js`, `css/shared-ui.css`.


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

## Recent UI fixes (toggle overlap / scrollbar)

- Problem: the floating dark-mode toggle could overlap the Mode/Difficulty controls at narrow widths; hiding it previously left a tiny reserved area that caused a horizontal scrollbar at the narrow limit.
- Fix implemented: `js/flashcards.js` overlap watcher was updated to (1) conservatively detect overlap, (2) add the existing fade class (`.hidden-by-overlap`) and then set `display: none` after the hide transition so the toggle no longer reserves layout space. On reveal the code restores `display` before removing the hidden class so the reveal animates correctly.
- Defensive CSS: `css/flashcards.css` now includes a defensive selector to ensure `display:none` is respected and `body.flashcards-page { overflow-x: hidden; }` was added to prevent platform-specific sub-pixel rounding producing a tiny scrollbar.
- Files changed (UI fix delta):
	- `js/flashcards.js` — added display:none cleanup after transition and ensured reveal restores display before animating.
	- `css/flashcards.css` — defensive `display:none` rule and `overflow-x: hidden` for `.flashcards-page`.

- Verification: manual interactive verification performed by shrinking the window to the previously failing breakpoint — toggle hides, no horizontal scrollbar appears, and normal layouts at wider widths are unchanged (confirmed locally).

- Notes / next steps:
	- If you prefer a purely CSS solution or a different UX (smaller inline icon, move toggle into header), I can implement that instead; current approach is conservative and preserves the animation.
	- If any platform shows a subtle scrollbar, we can tune the overlap buffer (in `js/flashcards.js`) or replace the page-level overflow guard with a more targeted layout tweak.

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

## Recent interactive fixes (progress & flashcards)

- Prefer IPC over network when running under file://: renderer pages now use the preload API (`window.api.*`) where available and only fall back to network fetch on http(s). This eliminated file:///api/... errors when running the packaged/electron build.
- Normalized card payload handling in `js/flashcards.js` so cards returned from the local SQLite API (which contain `content` + `metadata`) render correctly in the UI.
- Fixed Casual/Test-mode ReferenceError by declaring `testStartData` at module scope and guarded test-only logic.
- Implemented save helpers used by the renderer (`saveProgress`, `saveTestCompletion`, `saveUserUnlock`) and added an event dispatch (`CustomEvent('kemmei:testSaved')`) after a save so other pages (Progress) refresh in response.
- Reworked `js/progress.js` percent-indicator logic to avoid incorrect parent-level propagation:
	- Replaced permissive substring matching with strict token-based matching of stored keys (cert:domain:sub:difficulty).
	- Ensured flashcard-derived percents only apply when the stored entry's difficulty token matches the requested difficulty (so an Easy result doesn't show up on Medium/Hard indicators).
	- Fixed a refactor-induced ReferenceError (`normalizeKeyPart`) and removed remaining dangling references.

These changes were tested interactively: running a subdomain Test (2.2) now only updates the intended subdomain/difficulty indicator and does not overwrite parent-level percents.

## Unlocking policy (decision needed)

We still need to decide the unlocking rule for progressing domain -> next difficulty. Options and recommendation:

- Option A — Domain Test Only: require an explicit domain-level Test-mode result (key: `cert:domain:all:difficulty`) with score >= 90%.
	- Pros: ensures integrated mastery; simple and strict.
	- Cons: burdensome for large domains (many cards) and may discourage learners.

- Option B — Aggregated Subdomain Mastery: allow unlocking if the weighted average of subdomain-level results (by card-count) meets the threshold (e.g., >= 90%), plus safeguards: at least X% coverage (suggest 80% by card-count) and no subdomain below a minimum (suggest 70%).
	- Pros: practical; supports chunked learning and incremental progress.
	- Cons: requires additional bookkeeping (card counts) and careful thresholds to avoid gaming.

- Recommendation (practical hybrid): support both — unlock when either:
	1) A domain-level Test (cert:domain:all:difficulty) >= 90% is recorded; OR
	2) Aggregated subdomain mastery meets thresholds (weighted average >= 90%, coverage >= 80%, per-subdomain minimum >= 70%).

This hybrid balances pedagogy with usability: learners who want to prove integrated knowledge can take the domain test; learners who study subdomains can earn the unlock by demonstrating mastery across the parts.

Implementation notes:
- Use `testCompletions` (cert:domain:sub:difficulty) as authoritative when available; fall back to `userProgress` flashcard-derived percents when needed.
- Compute weights from card counts in `data/cards/*` or maintain card-count metadata in `domainmap`.
- Persist unlocks using the existing `saveUserUnlock(userId, key, payload)` API.
- Add telemetry when an unlock is granted indicating which rule was used (domain-test vs aggregated) so thresholds can be tuned.

If you want, I can implement the hybrid decision logic now and wire it into the unlock-button handlers and an admin toggle to pick strict vs hybrid behavior.

## Update: 2025-09-04 — recent edits and next steps

Recent edits (what we did)
- Instrumented flashcards to record per-card session data (seen + correct) and include `cardIds` / `correctCardIds` plus `touchedAt`/`completedAt` when the renderer saves progress. File: `js/flashcards.js`.
- Fixed the Progress page "Clear All Progress" confirm handler so it resolves the current userId before calling the local API. File: `js/progress.js`.
- Simplified the Dashboard: removed the "Your stats" header and all deck/card aggregation and counts from the dashboard UI and code. Dashboard now shows only streak + longest-streak. Files: `dashboard.html`, `js/dashboard.js`.
- Server PATCH handler updated to merge incoming `cardIds`/`correctCardIds`/timestamps into stored progress records so server-mode saves preserve arrays. File: `backend/server.js`.
- Cleaned temporary test/debug scripts used during investigation (replaced `scripts/dump-progress.js` and `scripts/test-clear-progress.js` contents with placeholders).

What remains intact (important)
- Test-mode results and the best-result recording logic were not removed — Test completions are still saved (and merged) in the same `test_completions` flow and remain authoritative for formal Test-mode mastery reports.
- Casual/session progress is still written by the renderer; the data is preserved but currently not surfaced on the simplified dashboard.

Why the dashboard sometimes showed nothing
- In one run I confirmed the local SQLite `progress` table had no rows for the inspected user (so the dashboard had nothing to aggregate). This means the app may be writing to a different persistence in your environment (server-mode) or the user simply had no local progress. To validate quickly you can either run an Electron session and finish a deck (writes to local DB) or I can insert a sample progress row into the local SQLite DB for testing.

Next things to come back to (deferred)
- Re-enable or redesign detailed card/deck statistics UI (per-subdomain/domain/title counts and unique-card metrics) and decide exactly which metrics to store and surface.
- Decide final unlock rules and implement the hybrid aggregation logic (domain-level test OR aggregated subdomain mastery) and persist unlocks via `saveUserUnlock`.
- Optionally remove or keep the temporary global DevTools helpers exposed by `js/flashcards.js` (they're useful for debugging but can be removed before release).
- Add a small automated smoke-test that exercises save/read/clear progress flows end-to-end against the local SQLite DB.

If you'd like, I can now create a tiny smoke-test that saves a sample progress row and then reads it back (so you can commit and run the test before packaging). Otherwise the file is ready and you can commit.

## Update: 2025-09-22 — recent fixes and diagnostics cleanup

Summary of targeted fixes and cleanup performed on 2025-09-22:

- Flashcards initial-selection and defaults
	- Fixed a race/format issue where backend defaults (domain id like `1.0`) didn't match the renderer `<select>` option values (which are `"<id> <title>"`). The code now maps backend defaults into the option format before restoring selections so fresh installs show the intended defaults.
	- For fresh users (no per-user progress) the renderer clears global `last*` keys so canonical defaults are used on first-run.

- Card fetching and probe fallback
	- The local file-probe fallback (used when running under `file://` or when the IPC bridge is unavailable) was returning cards of all difficulties when the UI asked for `All`. This produced inflated raw counts (probe found many files) while the intended session should only include unlocked difficulties (fresh users: `Easy`).
	- The probe now filters by the unlocked difficulty set (queried from the same unlock logic used by the renderer). In practice this means `All` means "all unlocked levels" not "all difficulties found on disk".
	- The probe is only executed in appropriate contexts (when running under `file://` or when `window.api` is not present) to avoid accidental file-scanning in other environments.

- Difficulty handling and fetch normalization
	- Normalized difficulty handling so an empty difficulty or `All` never triggers an unrestricted "fetch everything" API path. `All` is interpreted as the set of unlocked difficulties; an empty difficulty falls back to `Easy` to avoid accidental wide queries.
	- Ensured the `difficulty-select` has at least an `Easy` option before the initial fetch so the early initialization cannot accidentally call the "fetch all" branch.

- Diagnostics and debug cleanup
	- Added temporary on-page debug instrumentation during investigation to show raw probe counts vs filtered counts and the effective query path. After confirming behavior, the on-page debug overlay and verbose `console.debug('FC DEBUG: ...')` logs were removed so production renderer no longer includes the diagnostic UI.
	- Kept useful runtime defaults (`window._fc_initialMappedDomain` and `window._fc_initialDefaults`) so startup mapping remains robust.

- Misc
	- Verified dedup/merge logic for combined difficulty fetches and ensured the UI displays the filtered (used) card count consistently.

DB location and clean build guidance (reminder)

- The app persists its main DB to the current user's home directory under the `.kemmei` folder (e.g., `C:\Users\vkuzm\.kemmei\kemmei-data.sqlite`). Both `localApi-sqljs.js` (WASM) and `localApi-sqlite.js` write to the same path, so deleting that single file clears the backend DB.
- Renderer storage (localStorage / IndexedDB / leveldb) is separate and lives in the Electron userData folders (e.g., `%APPDATA%\Kemmei` and/or `%LOCALAPPDATA%\Kemmei`). For a fully clean state remove those folders or run Electron with `--user-data-dir` pointing to a disposable directory for test runs.

Next steps and options

- If you'd like I can add a small smoke-test script (Node) that programmatically saves/reads/clears progress against the local DB so builds can run a quick verification step.
- I can also re-introduce debug instrumentation behind a `DEBUG` flag if you want lightweight diagnostics during development (hidden in production builds).

Please review this summary and tell me if anything I did is unclear or if I missed anything from our recent chats that you'd like included. If it looks good I will commit this change and can add the smoke-test script next if you want.

---

## Release & packaging recommendations (summary)

These are short actionable recommendations for packaging and releasing the Windows build, along with example configuration snippets and post-build cleanup suggestions.

1) What to publish to end users

- Primary: the NSIS installer `Kemmei Setup x.y.z.exe` — this is the recommended user flow (download → install → run). The installer handles shortcuts and uninstallation and is compatible with `electron-updater` auto-updates when you publish `latest.yml` and the blockmap.
- Optional (for testers): a single-file portable EXE (`portable` target) — convenient but less ideal for end users (temp extraction, no shortcuts).
- Auto-update artifacts (if you use `electron-updater`): `latest.yml` and `Kemmei Setup x.y.z.exe.blockmap` — keep those in your release artifacts.

Files you can safely omit from public releases (dev-only)

- `win-unpacked/` (unpacked app used during build/testing)
- `builder-debug.yml`, `builder-effective-config.yaml` (build metadata)

2) Example `package.json` build snippet (produce NSIS installer and optional portable EXE)

Add or update the `build` block in your `package.json` like this (merge into your existing build config):

```json
"build": {
  "directories": { "output": "dist" },
  "win": {
    "target": ["nsis", "portable"]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true
  },
  "portable": {
    "requestExecutionLevel": "user"
  },
  "asarUnpack": ["node_modules/sql.js/dist/sql-wasm.wasm"]
}
```

3) Recommended build commands (PowerShell)

Build the installer only (recommended):

```powershell
npx electron-builder --win nsis
```

Build the portable single-file EXE only:

```powershell
npx electron-builder --win portable
```

Build both targets (nsis + portable):

```powershell
npx electron-builder --win
```

4) Post-build cleanup (optional) — PowerShell

If you don't want to keep the unpacked folder and debug metadata in `dist`, run this after the build:

```powershell
# remove dev-only files
Remove-Item .\dist\builder-debug.yml, .\dist\builder-effective-config.yaml -Force -ErrorAction SilentlyContinue
# remove unpacked app folder
Remove-Item -LiteralPath .\dist\win-unpacked -Recurse -Force -ErrorAction SilentlyContinue
```

5) CI / Release workflow suggestion

- Build on CI (GitHub Actions recommended) and upload only the installer (`.exe`) and the `.blockmap`/`latest.yml` to GitHub Releases. This avoids storing large unpacked artifacts and makes release management simple.
- Optionally keep portable builds as separate release assets for testers.

6) Signing & AV guidance

- Code-sign your installer and EXE before publishing (recommended). Unsigned executables may be flagged by some antivirus engines and will show an "unknown publisher" prompt to users.

7) Next steps I can implement for you

- Add a `postbuild` script to `package.json` that removes `dist/win-unpacked` automatically using `rimraf` (I can add `rimraf` to `devDependencies` and the script for you).
- Add a small GitHub Actions workflow that builds the NSIS installer on Windows and uploads only the installer + blockmap/latest.yml to Releases.
- Create a smoke-test Node script that verifies DB read/write/clear flows prior to packaging.

---

End of release notes and packaging recommendations.

## UI note: collapse upper module when a deck starts (2025-09-22)

- Summary: To avoid the application showing a vertical scrollbar when a flashcard deck is started, the top filter/header module is now half-collapsed while a session is active. The compact view shows a centered two-line bar: (1) concise header text `Title | Domain | Subdomain | Mode | Difficulty`, (2) the `Abort` button on the next line.
- Files changed: `flashcards.html`, `css/flashcards.css`, `js/flashcards.js`.
- Key behaviors:
	- The collapsed header uses the full deck identifier (e.g. `220-1201`).
	- The flashcard content area uses the freed vertical space and will scroll internally when the answers list is long, preventing the outer window scrollbar in typical cases.
	- The collapse respects `prefers-reduced-motion` and restores the original header state when the session is aborted, exited, or completed.
- How to verify locally (quick):
	1. Open the app (Electron or browser) and navigate to `flashcards.html`.
 2. Start a session (`Start`). Confirm the header collapses to a centered compact line with the abort button on a separate line beneath it.
 3. Verify the flashcard box below uses the extra vertical space and that long answer lists scroll inside the box rather than forcing the window scrollbar.
 4. Click `Abort` and confirm the full header/filter controls are restored and the abort button returns to its original location.

- Suggested commit message: `desktop-offline: collapse header on flashcards start to avoid vertical overflow`

## 2025-09-23 — Today’s edits

- Finalized parent -> child propagation for force-unlocks in the Progress UI (`js/progress.js`): title-level and domain-level toggles now iterate child domain/subdomain buttons, persist each child unlock (IPC / RPC / network fallback), mirror to `localStorage`, and update child button UI optimistically.
 

## 2025-09-29 — Finish button freeze fix

- Issue: In certain runs clicking the final "Finish" (Next on last card) caused the renderer to become unresponsive — clicks, DevTools console, and reloads would not respond. This occurred in both Casual and Test modes.
- Root cause: a body-level `MutationObserver` watched for the `endMessage` becoming visible and called `restoreHeaderCompact()`. The prior implementation performed unconditional DOM moves and style changes and did not disconnect the observer, which could trigger repeated DOM mutations and re-enter the observer callback. That created a synchronous mutation loop that monopolized the renderer's single JS thread and made the UI appear frozen.
- Fix applied: made `restoreHeaderCompact()` idempotent and defensive (no-op when nothing to change, only move nodes when needed, wrap ops in try/catch) and updated the MutationObserver callback to `disconnect()` itself after running the restore. This breaks the mutation cycle while preserving the intended restore behavior.
- Result: The end-screen now appears and the header is restored without freezing the page. This patch is low-risk and limited to DOM/observer restore logic in `js/flashcards.js`.

## 2025-09-24 — Archive & runtime cleanup (today)

- Archived developer/admin pages and helper JS into `usr/archived-dev-pages/` and removed the runtime originals from the top-level runtime and `js/` folder.
	- Added archived copies under `usr/archived-dev-pages/`:
		- `usr/archived-dev-pages/admin.html`, `usr/archived-dev-pages/concur.html`, `usr/archived-dev-pages/register.html`
		- `usr/archived-dev-pages/css/admin.css`, `usr/archived-dev-pages/css/concur.css`
		- `usr/archived-dev-pages/js/admin.js`, `usr/archived-dev-pages/js/concur.js`, `usr/archived-dev-pages/js/register.js`
		- `usr/archived-dev-pages/js/cardTemplate.js`, `usr/archived-dev-pages/js/dropdowns.js`, `usr/archived-dev-pages/js/titmgr.js` (archived copies)
	- Deleted the runtime originals (left the app entry and runtime pages intact):
		- Removed `admin.html`, `concur.html`, `register.html` from project root
		- Removed `css/admin.css`, `css/concur.css` from `css/`
		- Removed `js/admin.js`, `js/concur.js`, `js/register.js`, and helper JS `js/cardTemplate.js`, `js/dropdowns.js`, `js/titmgr.js` from `js/`

- Notes:
	- All archives are plain reference copies (converted to non-module forms where necessary to avoid workspace lint conflicts).
	- I performed only file operations on disk; I did NOT stage, commit, or push any changes. `git status --porcelain` will show these deletions as unstaged.

Suggested commit message (concise):

"archive + ui: move admin/dev assets to usr/archived-dev-pages; widen progress module; disable empty decks & add Start loading state in flashcards"

PowerShell-ready commands to stage & commit (if you want to do this locally):

```powershell
git add -A ;
git commit -m "archive + ui: move admin/dev assets to usr/archived-dev-pages; widen progress module; disable empty decks & add Start loading state in flashcards" ;
git push origin desktop-offline
```

### Progress & Flashcards tweaks (2025-09-24)

- Progress page UI tweaks:
	- Increased main progress module width and reduced paddings to reduce line-wrapping (CSS changes in `css/progress.css` — max-width raised to ~900px, tighter horizontal padding and smaller vertical gaps).
	- Added visible expand/collapse carets and an `.expanded` state so title/domain blocks show a clear rotate/chevron affordance when opened/closed.
	- Added a `.no-cards` visual state: titles/domains with no cards are greyed-out but remain expandable. The progress renderer (`js/progress.js`) was made more defensive/async and now probes for card presence (IPC → fetch → local-file probe fallback) and marks tree nodes accordingly.
	- Minor accessibility and spacing fixes to make the progress tree more compact and reduce vertical clipping on narrow windows.

- Flashcards page changes:
	- Deck selector now disables and visually greys out titles/domains that have no cards (prevents starting a session on empty decks). This is implemented in `js/flashcards.js` via async presence checks and disabled `<option>` handling.
	- `Start` button now waits until final card counts are computed: it shows a loading/disabled state (spinner + `.loading-cards` CSS) while async count/probe work completes, preventing racey starts and incorrect session sizes. Styles live in `css/flashcards-loading.css` and behavior in `js/flashcards.js`.
	- The deck population flow (`populateDeckDropdown`) and card-count probing were made async and defensive (probe local files only when necessary) to avoid UI stalls under `file://` or when the IPC bridge is unavailable.
	- Small UX polish: the header collapse on session start (to avoid vertical overflow) and improved overlap handling for the dark-mode toggle were preserved/tidied.

Files primarily changed today for these tweaks:
- `css/progress.css`
- `js/progress.js`
- `css/flashcards-loading.css` (new)
- `js/flashcards.js`



(Logged and committed changes.)

## 2025-09-29 — Post-Finish fix follow-ups (brief)

- Hardened `restoreHeaderCompact()` (idempotent + observer disconnect) to prevent the MutationObserver re-entrancy that caused the renderer freeze on Finish.
- Replaced renderer numeric/file probing with the main-process `api:listCards` enumerator so the renderer no longer issues mass file:// requests; this centralizes recursive JSON enumeration and difficulty filtering.
- Fixed Clear Progress end-to-end: DELETE handlers for `user-progress`, `user-unlocks`, and `test-completions` were wired and `clearUserUnlocks` / `clearUserTestCompletions` added to both DB backends; localStorage mirrors are cleared and `kemmei:progressCleared` is dispatched for immediate UI reset.
- Progress page expansion state now saves only the last-opened cert/domain (per-user) and restores by collapsing all others first, preventing multiple leftover expansions from earlier visits.

These changes remove noisy probes, ensure Clear Progress truly resets backend and UI state, and make the Progress page deterministic after navigation.

## 2025-09-30 — What we did today (brief)

- Resized the deck completion Restart button: limited its width to ~25%, centered it, and added responsive fallback so it remains usable on small screens (`css/flashcards.css`).
- Reduced several vertical paddings and tightened gaps on the flashcards page, and made the flashcard area scroll internally (via `max-height` + `overflow:auto`) so long answer lists or explanations do not force the outer window scrollbar (`css/flashcards.css`).
- Increased the Electron default window size and minimums to give more vertical room (default 1280×900, min 1100×760) so common layouts fit without scrolling (`electron/main.js`).
- Made the Progress page lighter on startup by caching per-cert card presence in `localStorage['kemmei:certPresence']`, probing only uncached certs, and clearing the cache on `kemmei:refreshData`; this mirrors the "work with what it has" behavior used on the flashcards page (`js/progress.js`).

## 2025-10-01 — Today's edits

- Instrumented `js/flashcards.js` with targeted runtime logging to trace the repro flow: selecting difficulty, saving last-selection, visibilitychange/unload when navigating away (Dashboard), and the subsequent `updateDifficultyDropdown` restore path when returning. The logs include explicit reason text (restored from saved / used current / defaulted) to make the sequence obvious in DevTools.
- Hardened persistence logic:
	- `saveLastSelection()` now validates the difficulty before writing (skips empty/disabled/transient values) so a programmatic dropdown rebuild can't accidentally overwrite a user's saved Medium with a transient Easy.
	- `updateDifficultyDropdown()` will restore a saved difficulty even if the option is temporarily disabled (so the user's choice isn't lost), but it only persists that restored value when the option is enabled.
	- Added guards around programmatic rebuilds (`isRebuildingDifficulty`) so change events from code updates don't trigger unintended saves.
- Added visibility/unload handlers to try to persist the last selection when the page hides or unloads so navigation to Dashboard records the user's explicit choice reliably.
- UI fix: CSS tweaks to `css/flashcards.css` to make the collapsed-header Abort button clickable (sticky position, higher z-index, pointer-events enabled) so users can reliably abort an active session.

Additional notes from today's debugging session
- Expanded runtime logging beyond difficulty events: added console.info traces on deck/domain/sub selections, mode changes, and the abort/goBack navigation paths so the exact user-navigation sequence is visible in DevTools.
- Added a session mirror guard (`persistedUnlocks` / runtime mirror) and listeners:
	- Flashcards now respects the renderer's unlock mirror and listens for `kemmei:unlockToggled` to invalidate cached unlocked difficulties and re-apply saved difficulty when appropriate.
	- A `persistedUnlocks` Set guards duplicate persistence calls and reduces noisy mirror writes during bulk unlock updates.
- Change-event protection: implemented `isRebuildingDifficulty` guards so programmatic dropdown rebuilds do not trigger saves.
- Navigation-safe saves: `saveLastSelection()` is called on `visibilitychange` / `beforeunload` where possible to capture the user's explicit choice when navigating to Dashboard.
- Minor renderer edits: `flashcards.html` goBack/navigation handlers now emit a small console.info trace to make the user flow obvious when reproducing the issue.
- Validation: ran a Node syntax/parse check on the modified `js/flashcards.js` to ensure no syntax errors were introduced; no parse errors were observed.

Progress page edits (today)
- Reworked percent-indicator logic to use strict token-based matching (cert:domain:sub:difficulty) so parent-level percents are not incorrectly overwritten by child results; this prevents an Easy result from appearing on Medium/Hard indicators (see `js/progress.js`).
- Progress view now listens for `kemmei:testSaved` (dispatched by flashcards on Test completion) and refreshes relevant parts of the tree so newly-saved completions appear without a full reload.
- Cached per-cert card presence (`localStorage['kemmei:certPresence']`) reduces startup probes; the cache is updated lazily and cleared on `kemmei:refreshData` so the Progress page remains light and responsive.
- Clear Progress end-to-end: wired DELETE handlers (`user-progress`, `user-unlocks`, `test-completions`) and added `clearUserUnlocks` / `clearUserTestCompletions` to DB backends so the UI's Clear flow truly resets both backend and local mirrors.
- Minor UX: domain/title expand state now saves only the last-opened cert/domain per-user and restores by collapsing others first to avoid multiple leftover expansions.

What I validated locally
- The updated JS passes a Node syntax check and the new console traces appear in runs where DevTools is open. The defensive checks prevented several accidental overwrites in manual tests, and the Abort clickability issue is resolved by the CSS change.

Remaining suspected race and next step
- A small timing window can remain when the renderer rebuilds the difficulty dropdown before the mirrored/unlock data is available. If you still see the Medium -> Easy revert after these edits, I'll implement a lightweight startup sync: an idempotent read (GET `user-unlocks/{userId}`) before the first `updateDifficultyDropdown()` so the unlock mirror is primed and the dropdown can correctly honor saved difficulty. Alternatively I can add a short retry that re-applies the saved difficulty once unlocks arrive.

If you can reproduce the issue, please run this exact sequence with DevTools Console open (clear console first) and paste the resulting console block here:
1) Open Flashcards.
2) Select Medium (observe "difficulty-select change" and "saveLastSelection").
3) Click Dashboard (observe `visibilitychange: hidden` and `saveLastSelection`).
4) Return to Flashcards and paste the console output covering the initial selection, the visibility/unload logs, and the `updateDifficultyDropdown` / restore logs shown when Flashcards reload.

I can then either land the startup unlock-read fix or add a small retry based on what the traces show.