> 📘 **Please read this first:** [READ_FIRST.md](READ_FIRST.md)  
> Context, disclaimers, and the story behind Kemmei.

# Kemmei — Flashcard app (Dev / Test notes)

Short description

Kemmei is an offline-first flashcard and test application (Electron) designed to help with certification study. This repository contains the app source, packaging configuration, and CI workflows used to produce portable artifacts (exe/dmg/AppImage/zip) for manual testing.

Currently, Kemmei covers CompTIA A+ Core 1 (220-1201) with 2811 cards across 3 levels of difficulty.

## 🚀 Latest Build Artifacts

You can download the most recent unsigned portable builds from GitHub Actions:

➡️ [Download latest build artifacts](https://github.com/thumbcoded/kemmei-app/actions/workflows/portable-build.yml
)

These include:
- **Windows:** `.exe` / `.zip`
- **macOS:** `.dmg` / `.zip`
- **Linux:** `.AppImage`

> ⚠️ These builds are unsigned test versions for QA.

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

## Portable builds — tester instructions

Summary
-------
This project can produce unsigned portable artifacts for quick testing on each platform. These are intended for internal testing and friends — not a signed public release.

Where build artifacts go
- Windows portable EXE: `build\Kemmei Setup <version>.exe` (portable target)
- Linux AppImage: `build/*.AppImage`
- macOS dmg: `build/*.dmg`

How to build locally
---------------------
Prerequisites: Node 20+, npm, and platform-specific build tools if required by `electron-builder`.

PowerShell (Windows):
```powershell
npm ci
npm run build:portable:win
```

Linux (Ubuntu example):
```bash
npm ci
npm run build:portable:linux
```

macOS:
```bash
npm ci
npm run build:portable:mac
```

Notes for testers
-----------------
- These builds are unsigned. macOS will show Gatekeeper warnings; users must explicitly allow the app in System Preferences > Security if required.
- Windows unsigned EXEs may trigger AV heuristics for some machines. Ask testers to whitelist if needed for evaluation.
- The app stores its SQLite DB in the user home folder under `\.kemmei\kemmei-data.sqlite` (e.g., `C:\Users\you\.kemmei\kemmei-data.sqlite`). Deleting that file resets the app state.
- Renderer-level storage (IndexedDB/localStorage) is stored in Electron user data folders (e.g., `%APPDATA%\Kemmei` or `%LOCALAPPDATA%\Kemmei`).

Collecting feedback
-------------------
- Ask testers to note: OS + version, any AV warnings, console logs (run unpacked binary from a terminal to capture logs), and whether DB persists between runs.

Next steps for public release
-----------------------------
- Obtain code-signing certificates (Windows Authenticode and Apple Developer ID) and configure signing/notarization in `package.json` and CI.
- Enable `electron-updater` and publish signed installers for smooth auto-updates.
