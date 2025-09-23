const path = require('path')

// Mirror the same backend selection as other smoke-utils: prefer sqljs (WASM)
// implementation when available, otherwise fall back to sqlite native-binding.
let localApi
try {
  localApi = require(path.join(__dirname, '..', 'backend', 'localApi-sqljs.js'))
} catch (e) {
  try {
    localApi = require(path.join(__dirname, '..', 'backend', 'localApi-sqlite.js'))
  } catch (e2) {
    throw e // rethrow original to surface error
  }
}

async function initLocalApi() {
  return localApi.init()
}

async function runSmokeChecks() {
  await localApi.init()
  const cards = await localApi.getCards()
  if (!Array.isArray(cards)) throw new Error('cards not an array')

  const username = 'smoke_test_user'
  let u = await localApi.getUserByUsername(username)
  if (!u) {
    const r = await localApi.saveUser({ username })
    if (!r || !r.id) throw new Error('failed to create user')
    u = { id: r.id, username }
  }

  const pKey = 'smoke-test-key'
  const pVal = { t: Date.now(), ok: true }
  const saved = await localApi.saveProgress(u.id, pKey, pVal)
  if (!saved || !saved.ok) throw new Error('failed to save progress')

  const progress = await localApi.getUserProgress(u.id)
  if (!progress || !progress[pKey]) throw new Error('progress not found')

  await localApi.clearUserProgress(u.id)

  return { ok: true }
}

module.exports = { initLocalApi, runSmokeChecks }
