const fs = require('fs')
const path = require('path')
const os = require('os')

const initSqlJs = require('sql.js')

const DB_NAME = 'kemmei-data.sqlite'
let db = null
let SQL = null

function getAppDataDir() {
  const home = os.homedir()
  const dir = path.join(home, '.kemmei')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function ensureSql () {
  if (SQL) return SQL
  // Try to resolve the wasm binary shipped with sql.js and pass it directly.
  // This avoids runtime attempts to fetch/open 'sql-wasm.wasm' by URL which fails
  // inside Electron packaged apps.
  let wasmBinary = null
  try {
    // This will resolve to the actual file path inside node_modules (or inside asar when packaged)
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    wasmBinary = fs.readFileSync(wasmPath)
  } catch (e) {
    // Fallback: try typical node_modules location relative to repo
    try {
      const fallback = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
      if (fs.existsSync(fallback)) wasmBinary = fs.readFileSync(fallback)
    } catch (e2) {
      // leave wasmBinary null; initSqlJs will try other locateFile behaviors
    }
  }

  if (wasmBinary) {
    SQL = await initSqlJs({ wasmBinary })
  } else {
    // Last resort: allow sql.js to locate file itself (may fail in packaged apps)
    SQL = await initSqlJs()
  }
  return SQL
}

async function loadDb () {
  if (db) return db
  await ensureSql()
  const dbPath = path.join(getAppDataDir(), DB_NAME)
  if (fs.existsSync(dbPath)) {
    const data = fs.readFileSync(dbPath)
    db = new SQL.Database(new Uint8Array(data))
  } else {
    db = new SQL.Database()
    // create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        password_hash TEXT,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS progress (
        user_id TEXT,
        key TEXT,
        data TEXT,
        PRIMARY KEY (user_id, key)
      );
      CREATE TABLE IF NOT EXISTS test_completions (
        user_id TEXT,
        key TEXT,
        data TEXT,
        PRIMARY KEY (user_id, key)
      );
      CREATE TABLE IF NOT EXISTS unlocks (
        user_id TEXT,
        key TEXT,
        data TEXT,
        PRIMARY KEY (user_id, key)
      );
    `)
    persistDb()
  }
  return db
}

function persistDb () {
  if (!db) return
  const data = db.export()
  const buf = Buffer.from(data)
  fs.writeFileSync(path.join(getAppDataDir(), DB_NAME), buf)
}

async function init () {
  await loadDb()
  return { ok: true }
}

async function getCards (filter) {
  await loadDb()
  const res = db.exec('SELECT id, title, content, metadata FROM cards')
  const rows = (res[0] && res[0].values) || []
  const parsed = rows.map(r => ({ id: r[0], title: r[1], content: r[2], metadata: JSON.parse(r[3] || '{}') }))
  if (!filter || Object.keys(filter).length === 0) return parsed

  const certId = filter.cert_id || filter.cert || null
  const domainId = filter.domain_id || filter.domain || null
  const subdomainId = filter.subdomain_id || filter.subdomain || null
  const difficulty = filter.difficulty ? String(filter.difficulty).toLowerCase() : null

  return parsed.filter(item => {
    const m = item.metadata || {}
    if (certId) {
      const certs = Array.isArray(m.cert_id) ? m.cert_id : (m.cert_id ? [m.cert_id] : [])
      if (!certs.includes(certId)) return false
    }
    if (domainId) { if (m.domain_id !== domainId) return false }
    if (subdomainId) { if (m.subdomain_id !== subdomainId) return false }
    if (difficulty) { if (!m.difficulty) return false; if (String(m.difficulty).toLowerCase() !== difficulty) return false }
    return true
  })
}

async function getCard (id) {
  await loadDb()
  const res = db.exec('SELECT id, title, content, metadata FROM cards WHERE id = ?',[id])
  // sql.js doesn't support parameterized queries via exec; fallback to manual filter
  const all = (db.exec('SELECT id, title, content, metadata FROM cards')[0] || { values: [] }).values
  for (const r of all) if (r[0] === id) return { id: r[0], title: r[1], content: r[2], metadata: JSON.parse(r[3] || '{}') }
  return null
}

async function saveCard (card) {
  await loadDb()
  if (!card.id) card.id = require('crypto').randomUUID()
  const stmt = db.prepare('INSERT OR REPLACE INTO cards (id, title, content, metadata) VALUES (?, ?, ?, ?)')
  stmt.run([card.id, card.title || '', card.content || '', JSON.stringify(card.metadata || {})])
  stmt.free()
  persistDb()
  return { ok: true, id: card.id }
}

async function getUsers () {
  await loadDb()
  const all = (db.exec('SELECT id, username, metadata FROM users')[0] || { values: [] }).values
  return all.map(r => ({ id: r[0], username: r[1], metadata: JSON.parse(r[2] || '{}') }))
}

async function saveUser (user) {
  await loadDb()
  if (!user.id) user.id = require('crypto').randomUUID()
  const stmt = db.prepare('INSERT OR REPLACE INTO users (id, username, password_hash, metadata) VALUES (?, ?, ?, ?)')
  stmt.run([user.id, user.username || '', user.password_hash || '', JSON.stringify(user.metadata || {})])
  stmt.free()
  persistDb()
  return { ok: true, id: user.id }
}

async function getUserByUsername (username) {
  await loadDb()
  const all = (db.exec('SELECT id, username, metadata FROM users')[0] || { values: [] }).values
  for (const r of all) if (r[1] === username) return { id: r[0], username: r[1], metadata: JSON.parse(r[2] || '{}') }
  return null
}

async function setCurrentUserId (id) {
  await loadDb()
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  stmt.run(['currentUserId', id || ''])
  stmt.free()
  persistDb()
  return { ok: true }
}

async function getCurrentUserId () {
  await loadDb()
  const all = (db.exec("SELECT value FROM settings WHERE key = 'currentUserId'")[0] || { values: [] }).values
  return all[0] ? all[0][0] : null
}

async function getCurrentUser () {
  await loadDb()
  const id = await getCurrentUserId()
  if (!id) return null
  return await getUserById(id)
}

async function getUserById (id) {
  await loadDb()
  const all = (db.exec('SELECT id, username, metadata FROM users')[0] || { values: [] }).values
  for (const r of all) if (r[0] === id) return { id: r[0], username: r[1], metadata: JSON.parse(r[2] || '{}') }
  return null
}

async function getDomainMap () {
  const repoRoot = path.join(__dirname, '..')
  const p = path.join(repoRoot, 'data', 'domainmap.json')
  if (!fs.existsSync(p)) return { domainMaps: {}, subdomainMaps: {}, certNames: {} }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return { domainMaps: {}, subdomainMaps: {}, certNames: {} } }
}

async function getUserProgress (userId) {
  await loadDb()
  if (!userId) return {}
  const res = db.exec('SELECT key, data FROM progress WHERE user_id = ?',[userId])
  const all = (db.exec('SELECT key, data FROM progress WHERE user_id = "' + userId + '"')[0] || { values: [] }).values
  const out = {}
  for (const r of all) { try { out[r[0]] = JSON.parse(r[1]) } catch (e) { out[r[0]] = r[1] } }
  return out
}

async function getTestCompletions (userId) {
  await loadDb()
  if (!userId) return {}
  const all = (db.exec('SELECT key, data FROM test_completions WHERE user_id = "' + userId + '"')[0] || { values: [] }).values
  const out = {}
  for (const r of all) { try { out[r[0]] = JSON.parse(r[1]) } catch (e) { out[r[0]] = r[1] } }
  return out
}

async function getUserUnlocks (userId) {
  await loadDb()
  if (!userId) return {}
  const all = (db.exec('SELECT key, data FROM unlocks WHERE user_id = "' + userId + '"')[0] || { values: [] }).values
  const out = {}
  for (const r of all) { try { out[r[0]] = JSON.parse(r[1]) } catch (e) { out[r[0]] = r[1] } }
  return out
}

async function saveProgress (userId, key, data) {
  await loadDb()
  if (!userId || !key) return { ok: false, error: 'missing' }
  const stmt = db.prepare('INSERT OR REPLACE INTO progress (user_id, key, data) VALUES (?, ?, ?)')
  stmt.run([userId, key, JSON.stringify(data)])
  stmt.free()
  persistDb()
  return { ok: true }
}

async function saveTestCompletion (userId, key, data) {
  await loadDb()
  if (!userId || !key) return { ok: false, error: 'missing' }
  const stmt = db.prepare('INSERT OR REPLACE INTO test_completions (user_id, key, data) VALUES (?, ?, ?)')
  stmt.run([userId, key, JSON.stringify(data)])
  stmt.free()
  persistDb()
  return { ok: true }
}

async function saveUserUnlock (userId, key, data) {
  await loadDb()
  if (!userId || !key) return { ok: false, error: 'missing' }
  const stmt = db.prepare('INSERT OR REPLACE INTO unlocks (user_id, key, data) VALUES (?, ?, ?)')
  stmt.run([userId, key, JSON.stringify(data)])
  stmt.free()
  persistDb()
  return { ok: true }
}

async function clearUserProgress(userId) {
  await loadDb()
  if (!userId) return { ok: false, error: 'missing' }
  db.run('DELETE FROM progress WHERE user_id = "' + userId + '"')
  persistDb()
  return { ok: true }
}

module.exports = { init, getCards, getCard, saveCard, getUsers, saveUser, getUserByUsername, setCurrentUserId, getCurrentUserId, getCurrentUser, getUserById, getDomainMap, getUserProgress, getTestCompletions, getUserUnlocks, saveProgress, saveTestCompletion, saveUserUnlock, clearUserProgress, ensureInit: init }
