const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Support a headless smoke mode: when the packaged EXE is invoked with
// `--smoke`, perform quick DB checks and exit with 0 on success or non-zero on failure.
if (process.argv.includes('--smoke')) {
  (async () => {
    try {
      // require a minimal app lifecycle so sqlite paths resolve correctly
      await app.whenReady()

      // Try multiple locations for the smoke helper so packaged ASAR and
      // development layouts are both supported. Prefer an electron-packaged
      // copy (electron/smoke-utils.js) which we include in the app.asar.
      let smoke = null
      const tryPaths = [
        path.join(__dirname, 'smoke-utils.js'), // electron/smoke-utils.js (packaged)
        path.join(__dirname, '..', 'electron', 'smoke-utils.js'),
        path.join(__dirname, '..', 'scripts', 'smoke-utils.js'),
        path.join(__dirname, '..', 'scripts', 'smoke-utils.cjs')
      ]
      for (const p of tryPaths) {
        try {
          smoke = require(p)
          break
        } catch (e) {
          // ignore and try next
        }
      }
      if (!smoke) {
        throw new Error('smoke-utils module not found in packaged locations')
      }

      await smoke.initLocalApi()
      await smoke.runSmokeChecks()
      console.log('SMOKE_OK')
      process.exit(0)
    } catch (err) {
      console.error('SMOKE_FAIL', err && err.stack ? err.stack : err)
      process.exit(2)
    }
  })()
  // Avoid continuing to normal app startup; smoke path exits the process above.
  return
}

// Minimal menu template for production (keeps only basic File/Help actions).
const minimalMenuTemplate = [
  {
    label: 'File',
    submenu: [
      { label: 'Check for updates', click: () => {
          try { BrowserWindow.getAllWindows().forEach(w => { w.webContents.send('app:checkForUpdates') }) } catch (e) {}
        }
      },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About',
        click: () => {
          try {
            const info = `Kemmei desktop\n\nPlaceholder About text.\nVersion: ${app.getVersion()}\n\nThis is a placeholder About dialog.`;
            const win = BrowserWindow.getAllWindows()[0];
            dialog.showMessageBox(win, { type: 'info', title: 'About Kemmei', message: info });
          } catch (e) {}
        }
      }
    ]
  }
]

// Developer extras for non-packaged runs — added to the menu when running in dev mode
function extendWithDevMenu(template) {
  const devMenu = {
    label: 'Developer',
    submenu: [
      { label: 'Reload', click: () => { BrowserWindow.getAllWindows().forEach(w => w.reload()) } },
      { label: 'Force Reload', click: () => { BrowserWindow.getAllWindows().forEach(w => w.webContents.reloadIgnoringCache()) } },
      { label: 'Toggle DevTools', click: () => { BrowserWindow.getAllWindows().forEach(w => w.webContents.toggleDevTools()) } }
    ]
  };
  template.push(devMenu);
  return template;
}

function createWindow () {
  // Choose a platform-appropriate icon. macOS uses app bundle icons, so only
  // set the BrowserWindow icon for Windows/Linux.
  const platformIcon = (process.platform === 'darwin') ? undefined : path.join(__dirname, '..', 'assets', 'K_blue_2.ico')

  const win = new BrowserWindow({
  width: 1200,
  height: 800,
    // Prevent the user from shrinking the window so small the UI breaks
    minWidth: 1000,
    minHeight: 700,
    resizable: true,
    icon: platformIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })

  // Extra guard: prevent resize events that would go below the minimum
  const SAFE_MIN_W = 1000;
  const SAFE_MIN_H = 700;
  // Also set the BrowserWindow minimum size and guard on resize to handle
  // platform/DPI peculiarities where the will-resize/preventDefault may not stop
  // the final size change.
  try {
    win.setMinimumSize(SAFE_MIN_W, SAFE_MIN_H);
  } catch (err) {
    // setMinimumSize may not be available in some older Electron versions; ignore
  }

  win.on('will-resize', (e, newBounds) => {
    if (newBounds.width < SAFE_MIN_W || newBounds.height < SAFE_MIN_H) {
      e.preventDefault();
    }
  });

  // As a fallback, if the window does end up smaller (e.g., due to DPI scaling or OS quirks),
  // enforce the minimum immediately on 'resize'. This avoids a state where the layout breaks.
  win.on('resize', () => {
    const [w, h] = win.getSize();
    if (w < SAFE_MIN_W || h < SAFE_MIN_H) {
      win.setSize(Math.max(w, SAFE_MIN_W), Math.max(h, SAFE_MIN_H));
    }
  });

  // Load local UI
  win.loadFile(path.join(__dirname, '..', 'index.html'))
}

app.whenReady().then(() => {
  // If running as a packaged app, run the one-time fresh-start check so new installs
  // start without saved users/selections. This will not affect developer runs.
  (async () => {
    try {
      if (app.isPackaged && localApi && typeof localApi.ensureFreshStart === 'function') {
        await localApi.ensureFreshStart({ packaged: true })
      }
    } catch (e) {
      // ignore
    }
  })()

  createWindow()

  // Production: set a minimal menu so end-users don't see dev items.
  // Development: keep the default menu so DevTools and reload remain available.
  try {
  // In development, include developer helpers (Reload/DevTools) so the
  // menu remains useful for debugging. In packaged builds keep the
  // minimal menu.
  let menuTemplate = minimalMenuTemplate.slice();
  if (!app.isPackaged) menuTemplate = extendWithDevMenu(menuTemplate);
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
  } catch (e) {
    // ignore menu errors
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// Basic IPC: forward to backend/localApi (use sql.js-based implementation in packaged app)
let localApi
try {
  localApi = require(path.join(__dirname, '..', 'backend', 'localApi-sqljs.js'))
} catch (e) {
  // Fallback to sqlite implementation if available (developer machine)
  localApi = require(path.join(__dirname, '..', 'backend', 'localApi-sqlite.js'))
}

ipcMain.handle('api:init', async (event, arg) => {
  return localApi.init()
})

ipcMain.handle('api:getCards', async (event, filter) => {
  return localApi.getCards(filter)
})

ipcMain.handle('api:getCard', async (event, id) => {
  return localApi.getCard(id)
})

ipcMain.handle('api:saveCard', async (event, card) => {
  return localApi.saveCard(card)
})

ipcMain.handle('api:getUsers', async (event) => {
  return localApi.getUsers()
})

ipcMain.handle('api:saveUser', async (event, user) => {
  return localApi.saveUser(user)
})

ipcMain.handle('api:getUserByUsername', async (event, username) => {
  return localApi.getUserByUsername(username)
})

ipcMain.handle('api:setCurrentUserId', async (event, id) => {
  return localApi.setCurrentUserId(id)
})

ipcMain.handle('api:getCurrentUserId', async (event) => {
  return localApi.getCurrentUserId()
})

ipcMain.handle('api:getCurrentUser', async (event) => {
  return localApi.getCurrentUser()
})

ipcMain.handle('api:ensureFreshStart', async (event) => {
  if (localApi && typeof localApi.ensureFreshStart === 'function') return localApi.ensureFreshStart()
  return { cleared: false }
})

ipcMain.handle('api:saveProgress', async (event, userId, key, data) => {
  return localApi.saveProgress(userId, key, data)
})

ipcMain.handle('api:saveTestCompletion', async (event, userId, key, data) => {
  return localApi.saveTestCompletion(userId, key, data)
})

ipcMain.handle('api:saveUserUnlock', async (event, userId, key, data) => {
  return localApi.saveUserUnlock(userId, key, data)
})

// Generic RPC handler for shimmed fetch calls from renderer
ipcMain.handle('api:rpc', async (event, { path, method, body }) => {
  try {
    // Simple router: support paths like 'cards', 'cards/:id', 'users'
    // allow query string after path (e.g., cards?cert_id=220-1201)
    const [rawPath, rawQuery] = path.split('?')
    const parts = rawPath.split('/').filter(Boolean)
    const params = {}
    if (rawQuery) {
      const qp = new URLSearchParams(rawQuery)
      for (const [k, v] of qp.entries()) params[k] = v
    }
    if (parts[0] === 'cards') {
      if (method === 'GET' && parts.length === 1) return { status: 200, body: await localApi.getCards(params) }
      if (method === 'GET' && parts.length === 2) return { status: 200, body: await localApi.getCard(parts[1]) }
      if ((method === 'POST' || method === 'PUT') && parts.length === 1) return { status: 200, body: await localApi.saveCard(body) }
    }
    if (parts[0] === 'users') {
      if (method === 'GET' && parts.length === 1) return { status: 200, body: await localApi.getUsers() }
      if (method === 'GET' && parts.length === 2 && parts[1] === 'current') return { status: 200, body: await localApi.getCurrentUser() }
    }
    if (parts[0] === 'domainmap') {
      if (method === 'GET') return { status: 200, body: await localApi.getDomainMap() }
    }
    if (parts[0] === 'user-progress') {
      if (method === 'GET' && parts.length === 2) return { status: 200, body: await localApi.getUserProgress(parts[1]) }
      if (method === 'DELETE' && parts.length === 2) {
        // clear all progress for user
        await localApi.clearUserProgress(parts[1])
        try { console.info('api:rpc DELETE user-progress for', parts[1]) } catch (e) {}
        return { status: 200, body: { ok: true } }
      }
    }
    if (parts[0] === 'test-completions') {
      if (method === 'GET' && parts.length === 2) return { status: 200, body: await localApi.getTestCompletions(parts[1]) }
      if ((method === 'POST' || method === 'PUT') && parts.length === 3) {
        await localApi.saveTestCompletion(parts[1], parts[2], body)
        return { status: 200, body: { ok: true } }
      }
      if (method === 'DELETE' && parts.length === 2) {
        await localApi.clearUserTestCompletions(parts[1])
        try { console.info('api:rpc DELETE test-completions for', parts[1]) } catch (e) {}
        return { status: 200, body: { ok: true } }
      }
    }
    if (parts[0] === 'user-unlocks') {
      if (method === 'GET' && parts.length === 2) return { status: 200, body: await localApi.getUserUnlocks(parts[1]) }
      if ((method === 'POST' || method === 'PUT') && parts.length === 3) {
        await localApi.saveUserUnlock(parts[1], parts[2], body)
        return { status: 200, body: { ok: true } }
      }
      if (method === 'DELETE' && parts.length === 2) {
        await localApi.clearUserUnlocks(parts[1])
        try { console.info('api:rpc DELETE user-unlocks for', parts[1]) } catch (e) {}
        return { status: 200, body: { ok: true } }
      }
    }
    return { status: 404, body: { error: 'not found' } }
  } catch (err) {
    return { status: 500, body: { error: err.message } }
  }
})

// List local card files directly from the packaged data/cards directory.
// This is a fast helper used when the renderer needs to load cards but
// there is no remote API; it avoids the need for the renderer to probe
// filenames itself and generating many 404s.
ipcMain.handle('api:listCards', async (event, filter) => {
  try {
    const repoRoot = path.join(__dirname, '..')
    const base = path.join(repoRoot, 'data', 'cards')
    const cert = filter && (filter.cert_id || filter.cert)
    const domain = filter && (filter.domain_id || filter.domain)
    const sub = filter && (filter.subdomain || filter.subdomain_id || filter.sub)
    const difficultyFilter = filter && (filter.difficulty || filter.diff || filter.level)

    if (!cert) return []

    // Build the starting folder path: cert is required, domain/sub are optional
    let startFolder = path.join(base, cert)
    if (domain) startFolder = path.join(startFolder, domain)
    if (sub) startFolder = path.join(startFolder, sub)

  // Info log: requested start folder and optional difficulty
  try { console.info('api:listCards:', startFolder, 'difficulty:', difficultyFilter || '(none)') } catch (e) {}

    if (!fs.existsSync(startFolder)) {
      try { console.log('api:listCards folder not found:', startFolder) } catch (e) {}
      return []
    }

    // Recursively collect .json files under startFolder so Domain="All" or Subdomain="All" works
    const collectFiles = (dir) => {
      let out = []
      try {
        const entries = fs.readdirSync(dir)
        for (const e of entries) {
          const full = path.join(dir, e)
          let stat
          try { stat = fs.statSync(full) } catch (err) { continue }
          if (stat.isDirectory()) {
            out = out.concat(collectFiles(full))
          } else if (stat.isFile() && e.toLowerCase().endsWith('.json')) {
            out.push(full)
          }
        }
      } catch (err) {
        // ignore
      }
      return out
    }

    const jsonPaths = collectFiles(startFolder)
    // raw JSON files found under folder
    try { console.info('api:listCards: raw json files found:', jsonPaths.length) } catch (e) {}

    const cards = []
    let parsedCount = 0
    for (const p of jsonPaths) {
      try {
        const content = fs.readFileSync(p, 'utf8')
        const parsed = JSON.parse(content)
        cards.push(parsed)
        parsedCount++
      } catch (e) {
        // ignore malformed
      }
    }
    try { console.info('api:listCards: parsed JSON files:', parsedCount) } catch (e) {}

    // Detect difficulty from card object using common field names
    const normalize = (s) => (s || '').toString().trim().toLowerCase()
    const detectDifficulty = (card) => {
      try {
        const meta = card.metadata || {}
        return normalize(card.difficulty || card.level || card.difficulty_level || card.level_text || meta.difficulty || meta.level || meta.difficulty_level || meta.difficultyLevel || meta.Level)
      } catch (e) { return '' }
    }

    // If difficulty was explicitly requested, honor it. Otherwise consult
    // current user's unlocks/progress to decide which difficulties to return.
    let allowedDifficulties = []
    if (difficultyFilter) {
      allowedDifficulties = [normalize(difficultyFilter)]
    } else {
      // Default: at minimum Easy
      allowedDifficulties = ['easy']
      try {
        const userId = await localApi.getCurrentUserId()
        if (userId) {
          // Collect potential unlocked difficulties from multiple sources
          const unlocks = await localApi.getUserUnlocks(userId).catch(() => ({})) || {}
          const testComps = await localApi.getTestCompletions(userId).catch(() => ({})) || {}
          const progress = await localApi.getUserProgress(userId).catch(() => ({})) || {}

          const addIfFound = (s) => {
            const v = (s || '').toString().toLowerCase()
            if (v.indexOf('medium') !== -1 && allowedDifficulties.indexOf('medium') === -1) allowedDifficulties.push('medium')
            if (v.indexOf('hard') !== -1 && allowedDifficulties.indexOf('hard') === -1) allowedDifficulties.push('hard')
          }

          // Scan unlock keys and values
          Object.keys(unlocks || {}).forEach(k => { addIfFound(k); try { addIfFound(JSON.stringify(unlocks[k])) } catch (e) {} })
          // Scan test completions keys
          Object.keys(testComps || {}).forEach(k => addIfFound(k))
          // Scan progress keys and values
          Object.keys(progress || {}).forEach(k => { addIfFound(k); try { addIfFound(JSON.stringify(progress[k])) } catch (e) {} })
        }
      } catch (e) {
        // ignore and keep default ['easy']
      }
    }

    const final = cards.filter(c => {
      const d = detectDifficulty(c) || 'easy'
      return allowedDifficulties.indexOf(d) !== -1
    })
    try { console.info('api:listCards: returning', final.length, 'cards for', startFolder) } catch (e) {}
    return final
  } catch (err) {
    return []
  }
})
