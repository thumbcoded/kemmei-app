# Kemmei — Flashcard app (Dev / Test notes)

Short description

Kemmei is an offline-first flashcard and test application (Electron) designed to help with certification study. This repository contains the app source, packaging configuration, and CI workflows used to produce portable artifacts (exe/dmg/AppImage/zip) for manual testing.

Primary (artifact-first) workflow

- Owners build locally (optional) to smoke-check the UI and package output with `npm run build`.
- After a local sanity check, the private CI workflow produces installers and portable archives for Windows, macOS and Linux.
- Testers receive the produced artifact (exe/dmg/AppImage/zip) and run it directly — there is no requirement for testers to run `npm ci` or build locally.

Run delivered artifacts

- Windows: run the `.exe` installer or the portable `.zip`/`.exe` delivered by CI.
- macOS: open the `.dmg` or `.zip` and run the app.
- Linux: run the AppImage or extracted binaries.

What to test (manual QA)

- Log in with a username
- Run a deck in Test mode (produce a non-zero result), then check the Progress page to confirm results are recorded
- Play with unlocking difficulties on the Progress page and confirm the relevant sections are available and displayed correctly
- Review overall design and implementation; any feedback is appreciated

Known notes

- `sql.js` uses a WebAssembly binary (`sql-wasm.wasm`). When packaging with ASAR (electron-builder), ensure `asarUnpack` includes `node_modules/sql.js/dist/sql-wasm.wasm` so the runtime can load the WASM at startup.
- The app workflow is artifact-first: testers normally run delivered launchable artifacts rather than building from source.
- The UI recently adjusted difficulty handling so "All" is preserved when meaningful; otherwise the UI falls back to Easy.

Contributing / Reporting issues

- Private testing: share feedback privately (for example via direct message or a private issue in the repo).
- If you want to build locally, run `npm ci` and `npm run build` to reproduce artifacts.

License & notes

- This repository contains development code and packaging scripts. Distribution and signing policies depend on the release process and the repository owner's choices.

---