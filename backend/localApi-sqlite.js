
const path = require('path')
const os = require('os')
const fs = require('fs')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')

const DB_NAME = 'kemmei-data.sqlite'
let db

function getAppDataDir() {
  const home = os.homedir()
  const dir = path.join(home, '.kemmei')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function init () {
  if (db) return { ok: true }
  const dbPath = path.join(getAppDataDir(), DB_NAME)
  db = await open({ filename: dbPath, driver: sqlite3.Database })

  // Create tables if not exist
  await db.exec(`
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

  return { ok: true, path: dbPath }
}

// ensure DB is initialized before any operation
async function ensureInit () {
  if (!db) {
    await init()
  }
}

async function getCards (filter) {
  await ensureInit()
  const rows = await db.all('SELECT id, title, content, metadata FROM cards')
  const parsed = rows.map(r => ({ id: r.id, title: r.title, content: r.content, metadata: JSON.parse(r.metadata || '{}') }))

  if (!filter || Object.keys(filter).length === 0) return parsed

  // Normalize filter keys
  const certId = filter.cert_id || filter.cert || null
  const domainId = filter.domain_id || filter.domain || null
  const subdomainId = filter.subdomain_id || filter.subdomain || null
  const difficulty = filter.difficulty ? String(filter.difficulty).toLowerCase() : null

  return parsed.filter(item => {
    const m = item.metadata || {}
    // cert_id in original data might be array
    if (certId) {
      const certs = Array.isArray(m.cert_id) ? m.cert_id : (m.cert_id ? [m.cert_id] : [])
      if (!certs.includes(certId)) return false
    }
    if (domainId) {
      if (m.domain_id !== domainId) return false
    }
    if (subdomainId) {
      if (m.subdomain_id !== subdomainId) return false
    }
    if (difficulty) {
      if (!m.difficulty) return false
      if (String(m.difficulty).toLowerCase() !== difficulty) return false
    }
    return true
  })
}

// Return domain map JSON from repo data/domainmap.json
async function getDomainMap () {
  const repoRoot = path.join(__dirname, '..')
  const p = path.join(repoRoot, 'data', 'domainmap.json')
  if (!fs.existsSync(p)) return { domainMaps: {}, subdomainMaps: {}, certNames: {} }
  try {
    const txt = fs.readFileSync(p, 'utf8')
    return JSON.parse(txt)
  } catch (e) {
    console.warn('failed to read domainmap', e.message)
    return { domainMaps: {}, subdomainMaps: {}, certNames: {} }
  }
}

// Stubbed progress/unlocks/test-completions endpoints; implement real storage later
async function getUserProgress (userId) {
  await ensureInit()
  if (!userId) return {}
  const rows = await db.all('SELECT key, data FROM progress WHERE user_id = ?', userId)
  const out = {}
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.data) } catch (e) { out[r.key] = r.data }
  }
  return out
}

async function getTestCompletions (userId) {
  await ensureInit()
  if (!userId) return {}
  const rows = await db.all('SELECT key, data FROM test_completions WHERE user_id = ?', userId)
  const out = {}
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.data) } catch (e) { out[r.key] = r.data }
  }
  return out
}

async function getUserUnlocks (userId) {
  await ensureInit()
  if (!userId) return {}
  const rows = await db.all('SELECT key, data FROM unlocks WHERE user_id = ?', userId)
  const out = {}
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.data) } catch (e) { out[r.key] = r.data }
  }
  return out
}

async function saveProgress (userId, key, data) {
  await ensureInit()
  if (!userId || !key) return { ok: false, error: 'missing' }
  await db.run('INSERT OR REPLACE INTO progress (user_id, key, data) VALUES (?, ?, ?)', userId, key, JSON.stringify(data))
  return { ok: true }
}

async function saveTestCompletion (userId, key, data) {
  await ensureInit()
  if (!userId || !key) return { ok: false, error: 'missing' }
  await db.run('INSERT OR REPLACE INTO test_completions (user_id, key, data) VALUES (?, ?, ?)', userId, key, JSON.stringify(data))
  return { ok: true }
}

async function saveUserUnlock (userId, key, data) {
  await ensureInit()
  if (!userId || !key) return { ok: false, error: 'missing' }
  await db.run('INSERT OR REPLACE INTO unlocks (user_id, key, data) VALUES (?, ?, ?)', userId, key, JSON.stringify(data))
  return { ok: true }
}

async function clearUserProgress(userId) {
  await ensureInit()
  if (!userId) return { ok: false, error: 'missing' }
  await db.run('DELETE FROM progress WHERE user_id = ?', userId)
  return { ok: true }
}

async function getCard (id) {
  await ensureInit()
  const r = await db.get('SELECT id, title, content, metadata FROM cards WHERE id = ?', id)
  if (!r) return null
  return { id: r.id, title: r.title, content: r.content, metadata: JSON.parse(r.metadata || '{}') }
}

async function saveCard (card) {
  await ensureInit()
  if (!card.id) card.id = require('crypto').randomUUID()
  await db.run('INSERT OR REPLACE INTO cards (id, title, content, metadata) VALUES (?, ?, ?, ?)', card.id, card.title || '', card.content || '', JSON.stringify(card.metadata || {}))
  return { ok: true, id: card.id }
}

async function getUsers () {
  await ensureInit()
  const rows = await db.all('SELECT id, username, metadata FROM users')
  return rows.map(r => ({ id: r.id, username: r.username, metadata: JSON.parse(r.metadata || '{}') }))
}

async function saveUser (user) {
  await ensureInit()
  if (!user.id) user.id = require('crypto').randomUUID()
  await db.run('INSERT OR REPLACE INTO users (id, username, password_hash, metadata) VALUES (?, ?, ?, ?)', user.id, user.username || '', user.password_hash || '', JSON.stringify(user.metadata || {}))
  return { ok: true, id: user.id }
}

async function getUserByUsername (username) {
  await ensureInit()
  const r = await db.get('SELECT id, username, metadata FROM users WHERE username = ?', username)
  if (!r) return null
  return { id: r.id, username: r.username, metadata: JSON.parse(r.metadata || '{}') }
}

async function setCurrentUserId (id) {
  await ensureInit()
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'currentUserId', id || '')
  return { ok: true }
}

async function getCurrentUserId () {
  await ensureInit()
  const r = await db.get('SELECT value FROM settings WHERE key = ?', 'currentUserId')
  return r && r.value ? r.value : null
}

async function getCurrentUser () {
  await ensureInit()
  const id = await getCurrentUserId()
  if (!id) return null
  return await getUserById(id)
}

async function getUserById (id) {
  await ensureInit()
  const r = await db.get('SELECT id, username, metadata FROM users WHERE id = ?', id)
  if (!r) return null
  return { id: r.id, username: r.username, metadata: JSON.parse(r.metadata || '{}') }
}

module.exports = { init, getCards, getCard, saveCard, getUsers, saveUser, getUserByUsername, setCurrentUserId, getCurrentUserId, getCurrentUser, getUserById, getDomainMap, getUserProgress, getTestCompletions, getUserUnlocks, saveProgress, saveTestCompletion, saveUserUnlock, clearUserProgress, ensureInit }
