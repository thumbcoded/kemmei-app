# Kemmei — Project Overview, Scope & Plan

Date: 2025-08-18

## Recommended tool for project management

For now a simple Markdown file in the repo (this file) is enough. It is: easy to edit in VS Code, versioned with Git, searchable, and portable. When we need richer workflows (boards, issue tracking, assignments, automation) we can add GitHub Issues/Projects, Trello, Notion, or Jira. Start simple and evolve.

## Current scope (high level)

- A flashcard training web app (Kemmei) focused on certification-style content.
- Local/static frontend (HTML/CSS/JS) served alongside a small Express backend.
- Backend responsibilities:
  - Serve API for cards, domain maps, target maps
  - User registration/login (username/password stored as hash)
  - Persist cards in MongoDB and periodically sync to /data/cards JSON files
  - Track per-user progress, test completions and unlocks
- Support tools and data in `/data/` for domain maps and card templates.

## Codebase summary (as scanned)

Top-level files/folders (brief):

- `index.html`, `register.html`, `flashcards.html`, `dashboard.html`, `admin.html`, `concur.html`, `progress.html` — frontend pages.
- `css/` — stylesheets including `style.css`, `shared-ui.css`, and page-specific CSS files.
- `js/` — client-side logic (login, flashcards, admin, domain maps, UI helpers). Key files:
  - `flashcards.js` — large client logic for deck selection, modes (casual/test), fetching cards, progress and test flows.
  - `index.js`, `register.js`, `progress.js`, `dashboard.js`, `admin.js`, `shared-ui.js` — page controllers and shared helpers.
- `backend/` — Express API + Mongoose models
  - `package.json` — dependencies: express, mongoose, cors, nodemon (dev).
  - `server.js` — main server: user routes, card CRUD, domainmap/targetmap APIs, test completion logic, periodic sync to disk.
  - `models/card.js`, `models/user.js` — Mongoose schemas.
- `data/` — mapping files and cards on disk: `domainmap.json`, `targetmap.json`, `covmap.json`, and `cards/` structured by cert/domain/subdomain.
- `API/` and `temp/` contain tooling data and historical transcripts/templates.
- `usr/` — contains this `MD.md` and other user materials.
- `local srv.bat` — likely helper to start server locally (inspect before using).

Notable implementation details found:
- Backend syncs MongoDB -> JSON files (`syncCardsToDisk`) every 60s and on-demand via `/api/sync-cards-to-disk`.
- Card IDs generated with `Q-<cert>-<domain>-<sub>-<counter>` pattern when created by API.
- Soft-delete for cards (status -> `deleted`) and permanent delete endpoint.
- User model uses Map fields for `progress`, `testCompletions`, and `unlocks`.
- Unlocks/test completion logic mixes Map and plain object shapes; server code includes conversions to handle both.
- Client-side `flashcards.js` contains a lot of unlock/difficulty logic depending on `testCompletions` and `user-unlocks` endpoints.

## Short-term plan (next milestones)

1. Developer environment / first run
   - Run `npm install` inside `backend/` and start the server to validate current state. (Use `local srv.bat` if available.)
   - Confirm MongoDB is running locally (mongodb://localhost:27017/kemmei).
   - Add a concise `README.md` with start instructions.

2. Safety & consistency
   - Normalize shapes for `testCompletions` / `unlocks` (Map vs Object) and document expected schema.
   - Add error handling/tests for file-based JSON operations (read/write) and failing-start protections.

3. Repo hygiene
   - Add `README.md`, `CONTRIBUTING.md`, and `.gitignore` (if missing).
   - Move runtime config (ports, DB URL) into env vars with a `.env.example` and use `process.env`.

4. Feature work / backlog candidates
   - Improve authentication (sessions/JWT) and authorization for admin routes.
   - Add CI (GitHub Actions) to run lint/tests and optionally spin up a test MongoDB.
   - Add automated data migration scripts for domainmap / cards.
   - Add lightweight E2E smoke test (start server + hit `/` and `/api/domainmap`).

## Immediate actionable tasks (pick 1–3 to start)

- Task A: Create `README.md` with quick startup steps and add to repo.
- Task B: Run backend locally and confirm API is reachable; document any startup issues.
- Task C: Add `.env` support for DB and PORT; refactor `server.js` to use env vars.

## Notes / Questions to decide next

- Do we want single-repo hosting of static files (current) or split frontend/backend into separate deployables?
- Preferred issue-tracking tool (GitHub Issues is simplest with this repo already on GitHub).

## State right now (concise)

- Card content: A+ Core 1 card set is present in the workspace under `data/cards` and appears ready for use in the UI.
- Frontend: Pages and UI/UX for training, deck selection, modes (casual/test), and admin flows are implemented in the static HTML/CSS/JS files (notably `flashcards.html` + `js/flashcards.js`). The UI looks feature-complete for core training flows.
- Backend: An Express API (`backend/server.js`) exists with card CRUD, domainmap/targetmap endpoints, user registration/login, progress/test-completion and an auto-sync that writes MongoDB data to `data/cards` JSON files every 60s.
- Data plumbing: `data/domainmap.json`, `data/targetmap.json`, and `data/cards/` are the canonical on-disk artifacts. `.gitignore` already excludes `data/cards` and `temp/` as local-only files.
- Auth: Basic username/password registration exists (password hashed). The implementation currently stores users in MongoDB and supports login; there is no email verification or token-based session management implemented yet.
- Backups: Workspace is synced to Google Drive (per your note), providing a simple backup layer for the repo.

## Decisions to make (implications)

1. Deployment model (key decision)
   - Standalone (desktop) app
     - Pros: offline-first, single-user simplicity, no server costs, easier to avoid exposing data publicly.
     - Cons: auto-update complexity, distribution, per-client data divergence unless you implement update/sync mechanism.
     - Storage approach: ship with `data/cards` locally; updates pulled from a signed update feed (or periodic packaged releases). Registration can be local account-only or optional cloud sync.
   - Web/cloud server
     - Pros: centralized card updates, multi-user, analytics, easier single-source-of-truth and admin control, immediate bugfix delivery.
     - Cons: hosting costs, security/ops responsibilities (TLS, backups, user privacy), need to harden auth and rate limits.
     - Storage approach: host MongoDB (managed or self-hosted) as the primary store and continue syncing to disk on the server only for artifacts/backups.

2. User registration / authentication model
   - Minimal (MVP): username + password stored hashed, optional email field (current code). No email verification. Good for fast launch or single-user desktop app.
   - Standard web: username/email + password + email verification + password reset + JWT or session cookies and CSRF protection. Consider adding OAuth/social login later for convenience.
   - Admin controls: need admin user(s) with ability to manage cards and domain maps; implement role checks on admin routes.

3. Update & sync strategy
   - Desktop: implement an update channel (signed JSON manifest or auto-update service) so clients can pull updated card bundles without manual install.
   - Server: central management — update in MongoDB and rely on clients to fetch fresh card lists via API; keep server-side sync to disk for backups or exports.

4. Security & operations
   - If public: enable HTTPS, env-based config, rate-limiting, input validation, and put DB credentials into a secrets manager or env vars.
   - Add backups and a monitoring/health-check endpoint. Consider simple CI to run smoke tests on deploy.

## Recommended next steps (practical, ordered)

1. Decide deployment model (desktop-first or cloud-first). This shapes registration and storage choices.
2. Define registration requirements for the chosen model:
   - If desktop-first: keep current local registration (or skip registration) and implement an optional sync later.
   - If cloud-first: implement email verification, password reset, and session/JWT authentication; add role checks for admin routes.
3. Prepare the repo for the chosen model:
   - Add `.env.example` and move DB/PORT config to env vars.
   - Harden `server.js` for production readiness (input validation, error boundaries, do not crash on missing non-critical files).
4. Implement a minimal admin onboarding flow (create an initial admin user) and document deployment steps in `README.md`.
5. Run a short internal pilot (local VPS or a packaged desktop build) to validate registration, card access, test completion and sync behavior.

## Questions for you / decisions I need you to make

- Which deployment model do you prefer for the first public/pilot release: standalone desktop app or web/cloud server?
- For registration on that first release: do you want quick local username/password (fast) or full email-verified accounts (slower but more standard)?

## Release decision: freeware Core 1 (your proposal)

- Release model: public freeware release covering A+ Core 1 only, to gather user feedback before committing to additional decks or monetization.
- Target audience: learners who want a lightweight card trainer; low barrier to entry is important for wide adoption.

## Auth / registration approach (recommended)

- Default (MVP, frictionless): local username-only registration (no password). The client stores the username in localStorage and associates progress locally. This keeps onboarding extremely fast and respects users who want offline-only use.
  - Implementation notes:
    - On first run prompt for a display name; save to localStorage as `userId`.
    - Do not create a server user record unless the user opts into cloud sync/verification.
    - Show a small banner: "Local account — progress stored on this device. Enable account sync to save progress to the cloud."
    - This avoids needing immediate backend auth changes and simplifies release.

- Optional server-verified accounts (opt-in): provide a clear opt-in flow to create an email-verified account when users want cross-device sync or support tracking.
  - Implementation notes:
    - Add a UI switch/button "Enable account sync" that opens the registration flow in `register.html`.
    - Registration path can be simple email + password + verification email later (or passwordless magic link if preferred).
    - When a user enables sync, migrate their local progress to the server and switch client to use server-backed progress and test-completions endpoints.
    - Server should validate and dedupe usernames/emails before creating accounts.

## Trade-offs & recommendations

- Pros of username-only default:
  - Lowest friction, largest potential uptake for the pilot release.
  - Works entirely offline; no hosting required for basic use.
- Cons:
  - No cross-device sync unless opt-in to server accounts.
  - Harder to provide support tied to specific users without verification.

- Security / abuse considerations if enabling server-side features:
  - Rate-limit account creation and API usage.
  - Validate and sanitize all inputs.
  - Use env-based secrets, HTTPS and consider simple abuse detection (IP throttling).

## Small implementation roadmap to support this plan

1. UI: Add a local onboarding modal that asks for a display name and stores it locally; show status (Local vs Synced).
2. Client: Use `localStorage.userId` as the primary user identifier in all client requests; if no server sync, skip registration calls.
3. Backend (opt-in): Add an endpoint to accept a migration request to create/merge a server account for a provided email and optionally migrate progress JSON.
4. Docs: Update `usr/MD.md` and `README.md` to explain the two modes (Local-only and Synced) and privacy implications.
5. Telemetry (optional): Add a simple opt-in analytics ping for aggregate metrics (usage counts, flow completions) to help evaluate uptake — respect privacy and make it opt-in.

---

If you want, I can implement step 1 and 2 now (add onboarding modal + local username handling in client JS and document it). Which would you like me to do first?
