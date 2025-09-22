const { contextBridge, ipcRenderer } = require('electron')

// Shim: intercept renderer fetch calls to /api/* and forward to main via ipc
const origFetch = global.fetch
const isApiPath = (input) => {
  try {
    // Accept strings like '/api/..' or absolute URLs that contain '/api/' anywhere
    if (typeof input === 'string') return input.indexOf('/api/') === 0 || input.indexOf('/api/') > 0
    if (input && input.url) return typeof input.url === 'string' && input.url.indexOf('/api/') !== -1
    return false
  } catch (e) { return false }
}

// Expose a minimal fetch shim to renderer
global.fetch = async function (input, init = {}) {
  if (isApiPath(input)) {
    const raw = typeof input === 'string' ? input : (input && input.url ? input.url : '')
    // find the first occurrence of '/api/' and take everything after it as the internal path
    const idx = raw.indexOf('/api/')
    const path = idx !== -1 ? raw.slice(idx + 5) : raw.replace(/^\/api\//, '')
    const method = (init && init.method) || 'GET'
    let body = undefined
    if (init && init.body) {
      try { body = JSON.parse(init.body) } catch (e) { body = init.body }
    }
    const resp = await ipcRenderer.invoke('api:rpc', { path, method, body })
    // Create a Response-like object with json() and text()
    const responseBody = resp && resp.body !== undefined ? resp.body : null
    const text = JSON.stringify(responseBody)
    return {
      ok: resp && resp.status >= 200 && resp.status < 300,
      status: resp && resp.status || 200,
      json: async () => responseBody,
      text: async () => text
    }
  }
  if (origFetch) return origFetch(input, init)
  throw new Error('fetch is not available in this environment')
}

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('api:init'),
  ensureFreshStart: () => ipcRenderer.invoke('api:ensureFreshStart'),
  getCards: (filter) => ipcRenderer.invoke('api:getCards', filter),
  getCard: (id) => ipcRenderer.invoke('api:getCard', id),
  saveCard: (card) => ipcRenderer.invoke('api:saveCard', card),
  getUsers: () => ipcRenderer.invoke('api:getUsers'),
  // Generic rpc helper so renderer can call arbitrary /api/* routes via main process
  rpc: (path, method = 'GET', body = undefined) => ipcRenderer.invoke('api:rpc', { path, method, body }),
  // Convenience helpers for user-related data
  getUserProgress: (userId) => ipcRenderer.invoke('api:rpc', { path: `user-progress/${userId}`, method: 'GET' }),
  getTestCompletions: (userId) => ipcRenderer.invoke('api:rpc', { path: `test-completions/${userId}`, method: 'GET' }),
  getUserUnlocks: (userId) => ipcRenderer.invoke('api:rpc', { path: `user-unlocks/${userId}`, method: 'GET' })
  ,
  // Save helpers - call dedicated ipc handlers exposed in main
  saveProgress: (userId, key, data) => ipcRenderer.invoke('api:saveProgress', userId, key, data),
  saveTestCompletion: (userId, key, data) => ipcRenderer.invoke('api:saveTestCompletion', userId, key, data),
  saveUserUnlock: (userId, key, data) => ipcRenderer.invoke('api:saveUserUnlock', userId, key, data)
})

// user helper shims
contextBridge.exposeInMainWorld('userApi', {
  getCurrentUser: () => ipcRenderer.invoke('api:getCurrentUser'),
  saveUser: (user) => ipcRenderer.invoke('api:saveUser', user),
  setCurrentUserId: (id) => ipcRenderer.invoke('api:setCurrentUserId', id),
  getCurrentUserId: () => ipcRenderer.invoke('api:getCurrentUserId')
})
