Portable builds — tester instructions

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
