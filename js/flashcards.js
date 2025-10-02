document.addEventListener("DOMContentLoaded", () => {
  // When unlocks change elsewhere (Progress page), refresh cached unlocked difficulties
  window.addEventListener('kemmei:unlockToggled', (ev) => {
    try {
      // Invalidate any cached unlocked difficulties
      try { if (typeof computedUnlocked !== 'undefined') computedUnlocked = null; } catch (e) {}
    } catch (e) {}
    // Optionally update difficulty select so user sees new options immediately
    try {
      const difficultySelect = document.getElementById('difficulty-select');
      if (difficultySelect) {
        // Recompute unlocked difficulties and adjust selection options
  getUnlockedDifficulties().then(async (diffs) => {
          try {
            // Normalize both sets for case-insensitive comparison
            const allowed = (diffs || []).map(d => (d || '').toString().toLowerCase());
            const current = (difficultySelect.value || '').toString().toLowerCase();

            // If mirror says an unlock exists, ensure it's included in allowed
            try {
              const userId = localStorage.getItem('userId');
              if (userId) {
                const mirrorRaw = localStorage.getItem(`user:${userId}:unlocks`);
                if (mirrorRaw) {
                  const mirrorObj = JSON.parse(mirrorRaw || '{}');
                  // Determine current cert and domain for relevance checks
                  const certVal = (document.getElementById('deck-select')?.value || '').toString().trim();
                  const domainValFull = (document.getElementById('domain-select')?.value || '').toString().trim();
                  const domainKeyCurrent = domainValFull === 'All' ? 'all' : (domainValFull || '').split(' ')[0];
                  const certKeySafe = (certVal || '').replace(/\./g, '_');
                  for (const k of Object.keys(mirrorObj || {})) {
                    if (!k || typeof k !== 'string') continue;
                    const parts = k.split(':');
                    const diffKey = parts[parts.length - 1];
                    if (!diffKey) continue;
                    const low = diffKey.toString().toLowerCase();
                    if (low !== 'medium' && low !== 'hard') continue;

                    // If the mirror key is domain-specific (3 parts), include only if cert+domain match
                    if (parts.length === 3) {
                      const mirrorCert = parts[0];
                      const mirrorDomain = parts[1];
                      if (mirrorCert === certKeySafe && mirrorDomain === (domainKeyCurrent || 'all')) {
                        if (!allowed.includes(low)) allowed.push(low);
                      }
                    } else if (parts.length === 2) {
                      // Cert-level unlock (e.g., cert:medium) - include when cert matches
                      const mirrorCert = parts[0];
                      if (mirrorCert === certKeySafe) {
                        if (!allowed.includes(low)) allowed.push(low);
                      }
                    }
                  }
                }
              }
            } catch (e) { /* ignore mirror parse errors */ }

            if (!allowed.includes(current)) {
              const desired = allowed[0] || 'easy';
              // Find the actual option value that matches case-insensitively
              const opt = Array.from(difficultySelect.options).find(o => (o.value || '').toString().toLowerCase() === desired);
              if (opt) {
                difficultySelect.value = opt.value;
              } else {
                difficultySelect.value = desired;
              }
              difficultySelect.dispatchEvent(new Event('change'));
            }
          } catch (e) { /* silent */ }
        }).catch(() => {});
        // Force a refresh so counts and difficulty options reflect the new unlock
        try { fetchCardsAndUpdateCount(); } catch (e) {}
      }

      // Network fallback if necessary
    } catch (e) {}
  });
// Toggle this to true to enable developer debug logs in the flashcards UI
const DEBUG = false;
function dbg(...args) { if (DEBUG) console.log(...args); }

let domainMaps = {};
let subdomainMaps = {};
let certNames = {};
// Track which unlock keys we've already persisted in this session to avoid
// save/dispatch loops when getUnlockedDifficulties runs repeatedly.
let persistedUnlocks = new Set();
// Expose for debugging in DevTools only when DEBUG is enabled
if (typeof DEBUG !== 'undefined' && DEBUG) {
  try { window._kemmei_persistedUnlocks = persistedUnlocks; } catch (e) {}
}
let testStartData = null;
// Session-level card tracking for stats
let sessionSeenCardIds = new Set();
let sessionCorrectCardIds = new Set();

// Expose debugging helpers on window so DevTools can inspect session state
try {
  // attach lazily inside DOMContentLoaded handler below; if window exists now, attach placeholders
  if (typeof window !== 'undefined') {
    window._kemmei_sessionSeenCardIds = sessionSeenCardIds;
    window._kemmei_sessionCorrectCardIds = sessionCorrectCardIds;
    window._kemmei_clearSessionSets = () => { sessionSeenCardIds.clear(); sessionCorrectCardIds.clear(); };
    window._kemmei_showSessionSets = () => ({ seen: Array.from(sessionSeenCardIds), correct: Array.from(sessionCorrectCardIds) });
  }
} catch (e) {}
  // debug overlay removed in final cleanup

async function updateUserProgress(cert, domain, sub, correct, viewedOnly = false) {
  // In test mode, don't update progress during the session - only at the end
  if (isTestMode && !viewedOnly) {
    return;
  }

  const key = `${cert}:${domain}:${sub}`.replace(/\./g, "~");
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  try {
    // Prefer IPC save helper when available to avoid network calls under file://
  // Include a timestamp so we can compute study streaks and last-played info
    // include card tracking info when available
    const payload = { key, correct, viewedOnly, touchedAt: new Date().toISOString() };
    try {
      // payload.cardIds holds unique seen cards for this session/key
      if (sessionSeenCardIds && sessionSeenCardIds.size) payload.cardIds = Array.from(sessionSeenCardIds);
      if (sessionCorrectCardIds && sessionCorrectCardIds.size) payload.correctCardIds = Array.from(sessionCorrectCardIds);
    } catch (e) {}
    if (window.api && typeof window.api.saveProgress === 'function') {
      await window.api.saveProgress(userId, key, payload);
    } else if (window.api && typeof window.api.rpc === 'function') {
      await window.api.rpc(`user-progress/${userId}`, 'PATCH', payload);
    } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
      await fetch(`/api/user-progress/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      // Running under file:// with no IPC bridge — skip network update
      console.warn('Skipping user-progress network patch: running under file:// with no IPC bridge');
    }
  } catch (err) {
    console.error("❌ Failed to update user progress:", err);
  }
}

// Normalize stored unlock representation: value may be boolean or object { unlocked: bool }
function unlockValue(unlocks, key) {
  if (!unlocks) return false;
  if (!Object.prototype.hasOwnProperty.call(unlocks, key)) return false;
  const v = unlocks[key];
  if (typeof v === 'boolean') return !!v;
  if (v && typeof v === 'object' && typeof v.unlocked !== 'undefined') return !!v.unlocked;
  return !!v;
}

// Hide floating toggle when it would overlap header controls.
// Floating dark-mode toggle handled only on landing/dashboard pages; removed
// per-page overlap watcher from flashcards so the toggle's presence and
// visibility is not manipulated here.

// Cache helpers: store and retrieve domainmap and cert presence info in localStorage
function getCachedDomainMap() {
  try {
    const raw = localStorage.getItem('kemmei:domainmap');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function setCachedDomainMap(obj) {
  try {
    localStorage.setItem('kemmei:domainmap', JSON.stringify(obj));
  } catch (e) {}
}

function getCachedCertPresence() {
  try {
    const raw = localStorage.getItem('kemmei:certPresence');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) { return {}; }
}

function setCachedCertPresence(map) {
  try { localStorage.setItem('kemmei:certPresence', JSON.stringify(map)); } catch (e) {}
}

// Quick fingerprint for objects using djb2 over JSON string (fast and stable)
function computeFingerprint(obj) {
  try {
    const s = JSON.stringify(obj || {});
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return (h >>> 0).toString(16);
  } catch (e) { return null; }
}

function getCachedDomainMapFingerprint() {
  try { return localStorage.getItem('kemmei:domainmap:fingerprint'); } catch (e) { return null; }
}

function setCachedDomainMapFingerprint(v) {
  try { localStorage.setItem('kemmei:domainmap:fingerprint', v); } catch (e) {}
}

function getCachedDomainMapEtag() { try { return localStorage.getItem('kemmei:domainmap:etag'); } catch (e) { return null; } }
function setCachedDomainMapEtag(et) { try { if (et) localStorage.setItem('kemmei:domainmap:etag', et); } catch (e) {} }
function setCachedDomainMapLastModified(lm) { try { if (lm) localStorage.setItem('kemmei:domainmap:lastmod', lm); } catch (e) {} }

// Background check to detect if domainmap changed without downloading/parsing
// the full content on every launch. Uses HEAD/If-None-Match when available,
// otherwise falls back to IPC GET when present. If a change is detected, the
// cached domainmap is updated and a `kemmei:refreshData` event is dispatched.
async function checkForDomainMapUpdate() {
  try {
    const cachedFingerprint = getCachedDomainMapFingerprint();
    const cachedEtag = getCachedDomainMapEtag();

    // Prefer lightweight HTTP HEAD to check ETag/Last-Modified
    if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
      try {
        const headResp = await fetch('/api/domainmap', { method: 'HEAD' });
        if (headResp && headResp.ok) {
          const et = headResp.headers.get('etag');
          const lm = headResp.headers.get('last-modified');
          if (et && cachedEtag && et === cachedEtag) {
            // unchanged
            return false;
          }
          // If ETag differs or not present, attempt conditional GET
          const getHeaders = {};
          if (cachedEtag) getHeaders['If-None-Match'] = cachedEtag;
          const getResp = await fetch('/api/domainmap', { method: 'GET', headers: getHeaders });
          if (getResp.status === 304) return false; // not modified
          if (getResp && getResp.ok) {
            const data = await getResp.json();
            const fp = computeFingerprint(data);
            if (fp !== cachedFingerprint) {
              // update caches
              setCachedDomainMap(data);
              setCachedDomainMapFingerprint(fp);
              setCachedDomainMapEtag(et);
              setCachedDomainMapLastModified(lm);
              window.dispatchEvent(new CustomEvent('kemmei:refreshData'));
              return true;
            }
          }
        }
      } catch (e) {
        // HEAD might not be supported; try conditional GET directly
        try {
          const getResp2 = await fetch('/api/domainmap');
          if (getResp2 && getResp2.ok) {
            const data = await getResp2.json();
            const fp = computeFingerprint(data);
            if (fp !== cachedFingerprint) {
              setCachedDomainMap(data);
              setCachedDomainMapFingerprint(fp);
              try { setCachedDomainMapEtag(getResp2.headers.get('etag')); } catch (e) {}
              try { setCachedDomainMapLastModified(getResp2.headers.get('last-modified')); } catch (e) {}
              window.dispatchEvent(new CustomEvent('kemmei:refreshData'));
              return true;
            }
          }
        } catch (e2) { /* ignore */ }
      }
    }

    // If running under Electron, ask the backend for a fresh domainmap
    if (window.api && typeof window.api.rpc === 'function') {
      try {
        const resp = await window.api.rpc('domainmap', 'GET');
        if (resp && resp.body) {
          const data = resp.body;
          const fp = computeFingerprint(data);
          if (fp !== cachedFingerprint) {
            setCachedDomainMap(data);
            setCachedDomainMapFingerprint(fp);
            window.dispatchEvent(new CustomEvent('kemmei:refreshData'));
            return true;
          }
        }
      } catch (e) {}
    }
  } catch (e) {
    // Silently ignore background check errors - we fall back to cached data
  }
  return false;
}

async function loadDomainMap(forceReload = false) {
  // If we have a cached copy and the caller didn't request a refresh,
  // prefer it and avoid heavy parsing/network calls.
  if (!forceReload) {
      const cached = getCachedDomainMap();
      if (cached && cached.domainMaps) {
        domainMaps = cached.domainMaps || {};
        subdomainMaps = cached.subdomainMaps || {};
        certNames = cached.certNames || {};
        return { domainMaps, subdomainMaps, certNames };
      }
    }
  // Try the IPC-backed API first (Electron). If that fails (running in browser/file mode)
  // fall back to the local JSON file under data/domainmap.json so the UI still works.
  // Prefer IPC when available (running under Electron) to avoid file:// fetch errors
  if (window.api && typeof window.api.rpc === 'function') {
    try {
      const resp = await window.api.rpc('domainmap', 'GET')
      if (resp && resp.body) {
        const data = resp.body
        domainMaps = data.domainMaps || {}
        subdomainMaps = data.subdomainMaps || {}
        certNames = data.certNames || {}
        try { setCachedDomainMap(data); } catch (e) {}
        return data
      }
    } catch (e) {
      console.warn('ipc domainmap failed, falling back to network', e && e.message)
    }
  }

  try {
    // Only attempt network fetch if not running from file:// to avoid file:///api/... errors
    if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
      const res = await fetch("/api/domainmap");
      if (res && res.ok) {
        const data = await res.json();
        domainMaps = data.domainMaps || {};
        subdomainMaps = data.subdomainMaps || {};
        certNames = data.certNames || {};
        try { setCachedDomainMap(data); } catch (e) {}
        return data;
      }
      throw new Error('api domainmap not ok')
    } else {
      throw new Error('skip network domainmap fetch under file://');
    }
  } catch (err) {
    console.warn('api domainmap failed, trying local data/domainmap.json', err && err.message);
      try {
      const res2 = await fetch('data/domainmap.json');
      if (res2 && res2.ok) {
        const data = await res2.json();
        domainMaps = data.domainMaps || {};
        subdomainMaps = data.subdomainMaps || {};
        certNames = data.certNames || {};
        try { setCachedDomainMap(data); } catch (e) {}
        return data;
      }
    } catch (err2) {
      console.error('failed to load bundled domainmap.json', err2 && err2.message);
    }
    return { certNames: {}, domainMaps: {}, subdomainMaps: {} };
  }
}

function populateDeckDropdown(certNames, selectedId = null) {
  // Make this async-friendly in case we need to probe card presence
  return (async () => {
    const deckSelect = document.getElementById("deck-select");
    deckSelect.innerHTML = ""; // Clear old static options

    // Helper: check card presence per cert using IPC/rpc/fetch or local probe
    async function probeLocalForCards(certId) {
      try {
        // For this build prefer a metadata-based presence check: if the
        // domainMaps/subdomainMaps contain entries for this cert then we
        // assume packaged data exists. Avoid hitting the filesystem here to
        // prevent noisy file:// requests.
        const domains = domainMaps[certId] ? Object.keys(domainMaps[certId]) : [];
        if (domains.length === 0) return false;
        for (const d of domains) {
          const subs = subdomainMaps?.[certId]?.[d] ? Object.keys(subdomainMaps[certId][d]) : [];
          if (subs.length > 0) return true;
        }
      } catch (e) {}
      return false;
    }

    async function fetchCardPresence(certId) {
      try {
        // This build uses only the packaged local `data/cards` directory.
        // Do not attempt IPC or network here; simply probe the local files.
        return await probeLocalForCards(certId);
      } catch (e) {}
      return false;
    }

    // Render options but mark those with no cards as disabled and greyed
    for (const [id, title] of Object.entries(certNames)) {
      const opt = new Option(title, id);
      // optimistic append; we'll disable if probe says no cards
      deckSelect.appendChild(opt);
    }

    // Instead of probing the filesystem for every certificate (which creates
    // many file:// requests), use the loaded `domainMaps` as a lightweight
    // proxy: if a cert has no domains listed, mark it as having no cards.
    // This avoids noisy fetch attempts under file:// while still keeping the
    // UI informative.
    for (const opt of Array.from(deckSelect.options)) {
      const id = opt.value;
      const hasDomains = domainMaps && domainMaps[id] && Object.keys(domainMaps[id] || {}).length > 0;
      if (!hasDomains) {
        opt.disabled = true;
        opt.className = 'no-cards-option';
      }
    }

    // Use cached cert presence to avoid repeated expensive checks.
    const certPresence = getCachedCertPresence();
    const unknownCerts = [];
    for (const opt of Array.from(deckSelect.options)) {
      const id = opt.value;
      if (Object.prototype.hasOwnProperty.call(certPresence, id)) {
        if (!certPresence[id]) {
          opt.disabled = true;
          opt.className = 'no-cards-option';
        }
      } else {
        // Unknown presence; we'll check via IPC in batch below when available
        if (!opt.disabled) unknownCerts.push(id);
      }
    }

    // When running under Electron (IPC available), batch-check unknown certs
    // using the main process helper `listLocalCards` to confirm presence.
    try {
      if (unknownCerts.length && window.api && typeof window.api.listLocalCards === 'function') {
        // Map unknown certs to presence checks in parallel
        const checks = unknownCerts.map(id => {
          return window.api.listLocalCards({ cert: id, limit: 1 })
            .then(listed => ({ id, has: !!(listed && listed.length) }))
            .catch(() => ({ id, has: false }));
        });
        const results = await Promise.all(checks);
        // Apply results and update cache
        for (const r of results) {
          certPresence[r.id] = !!r.has;
          const opt = deckSelect.querySelector(`option[value="${r.id}"]`);
          if (opt && !r.has) {
            opt.disabled = true;
            opt.className = 'no-cards-option';
          }
        }
        try { setCachedCertPresence(certPresence); } catch (e) {}
      }
    } catch (e) {
      // ignore - fallback behavior already applied
    }

    // If we have a stored deck, use that — otherwise pick first enabled
    if (selectedId && certNames[selectedId]) {
      try { deckSelect.value = selectedId; } catch (e) {}
    }
    if (!deckSelect.value || deckSelect.options[deckSelect.selectedIndex]?.disabled) {
      // pick first non-disabled option
      for (let i = 0; i < deckSelect.options.length; i++) {
        if (!deckSelect.options[i].disabled) { deckSelect.selectedIndex = i; break; }
      }
    }

    // Remember the currently-selected enabled deck so future attempts to
    // select a disabled option can be reverted to this value.
    try {
      if (deckSelect && deckSelect.options[deckSelect.selectedIndex] && !deckSelect.options[deckSelect.selectedIndex].disabled) {
        lastValidDeck = deckSelect.value;
      }
    } catch (e) {}

    return deckSelect;
  })();
}

// Watch deck-select and toggle a class when the selected option is disabled (no cards)
function updateDeckSelectNoCardsState() {
  try {
    const deckSelect = document.getElementById('deck-select');
    if (!deckSelect) return;
    const opt = deckSelect.options[deckSelect.selectedIndex];
    if (opt && opt.disabled) deckSelect.classList.add('selected-no-cards'); else deckSelect.classList.remove('selected-no-cards');
  } catch (e) {}
}

document.getElementById('deck-select').addEventListener('change', () => {
  updateDeckSelectNoCardsState();
});

(async () => {
  // Resolve current user id: prefer renderer-local value, then IPC helper.
  let currentUserId = null;
  try { currentUserId = localStorage.getItem('userId'); } catch (e) {}
  try {
    if (!currentUserId && window.userApi && typeof window.userApi.getCurrentUserId === 'function') {
      const cur = await window.userApi.getCurrentUserId();
      if (cur) currentUserId = cur;
    }
  } catch (e) { /* ignore */ }

  // Ensure a synchronous localStorage copy exists so unload/visibility handlers
  // can save per-user selections without needing to await preload helpers.
  try { if (currentUserId) localStorage.setItem('userId', currentUserId); } catch (e) {}

  // Diagnostic logging: temporary - helps trace why stale last* values are used
  // debug logs removed

  // If we have a user id, check whether they have any saved progress. If
  // they have no progress, treat this as a fresh user and clear any global
  // renderer-local 'last*' keys (these are not per-user and can leak from
  // previous installs). Also clear any per-user last* keys for this user to
  // ensure a clean start.
  if (currentUserId) {
    try {
      let progress = {};
      if (window.api && typeof window.api.getUserProgress === 'function') {
        progress = await window.api.getUserProgress(currentUserId) || {};
      } else if (window.api && typeof window.api.rpc === 'function') {
        const resp = await window.api.rpc(`user-progress/${currentUserId}`, 'GET');
        progress = (resp && resp.body) ? resp.body : {};
      }
      if (!progress || Object.keys(progress).length === 0) {
        try {
          // Remove legacy global keys which may have leaked between installs
          // NOTE: do NOT remove `lastMode` here — keep the renderer-local
          // mode preference intact so Flashcards will restore the mode
          // selected on the Dashboard/index pages.
          localStorage.removeItem('lastDeck');
          localStorage.removeItem('lastDomain');
          localStorage.removeItem('lastSub');
          localStorage.removeItem('lastDifficulty');
          // Also remove per-user last* keys EXCEPT lastMode so we don't wipe
          // a locally-selected mode when a fresh-start is requested.
          localStorage.removeItem(`user:${currentUserId}:lastDeck`);
          localStorage.removeItem(`user:${currentUserId}:lastDomain`);
          localStorage.removeItem(`user:${currentUserId}:lastSub`);
          localStorage.removeItem(`user:${currentUserId}:lastDifficulty`);
        } catch (e) {}
      } else {
        // user has progress; leave last* keys intact
      }
    } catch (e) {
      // If progress check fails, do not clear storage to avoid overriding
      // legitimate values; fail-safe is to preserve existing behavior.
    }
  }

  const data = await loadDomainMap();

  // Listen for a forced refresh signal (for example when a new batch of cards
  // has been added). This lets the app keep using cached maps until an
  // explicit refresh is requested.
  try {
    window.addEventListener('kemmei:refreshData', async (ev) => {
      try {
        const d = await loadDomainMap(true);
        await populateDeckDropdown(d.certNames || {});
        updateDeckSelectNoCardsState();
        // ensure cards are re-fetched for the current selection
        await fetchCardsAndUpdateCount();
      } catch (e) { console.warn('refreshData handler failed', e && e.message); }
    });
  } catch (e) {}

  // Menu-driven check: listen for a forwarded IPC event from preload
  try {
    window.addEventListener('kemmei:menuCheckForUpdates', async () => {
      try {
        // Run the background check explicitly and then force reload if it reports new data
        const changed = await checkForDomainMapUpdate();
        if (changed) {
          // The background check already dispatched kemmei:refreshData when it updated cache
          // but call the explicit handler to ensure UI is fully refreshed.
          const d = await loadDomainMap(true);
          await populateDeckDropdown(d.certNames || {});
          updateDeckSelectNoCardsState();
          await fetchCardsAndUpdateCount();
        } else {
          // No change detected — still show a brief console/info message
          try { console.info('No updates found for domainmap'); } catch (e) {}
        }
      } catch (e) { console.warn('menu-driven check failed', e && e.message); }
    });
  } catch (e) {}

  // One-time fresh-start: if backend reports a fresh start was performed,
  // clear any renderer-local saved selections (both legacy global and per-user)
  // and apply the requested defaults.
  if (window.api && typeof window.api.ensureFreshStart === 'function') {
    try {
      const res = await window.api.ensureFreshStart()
      if (res && res.cleared) {
        // Clear saved users and selections in renderer storage
        try {
          // remove global legacy keys (preserve lastMode so local preference
          // survives and Flashcards can restore the mode selected on dashboard)
          localStorage.removeItem('userId')
          localStorage.removeItem('lastDeck')
          localStorage.removeItem('lastDomain')
          localStorage.removeItem('lastSub')
          localStorage.removeItem('lastDifficulty')
          // remove any per-user last* keys for the current user if available
          if (currentUserId) {
            localStorage.removeItem(`user:${currentUserId}:lastDeck`);
            localStorage.removeItem(`user:${currentUserId}:lastDomain`);
            localStorage.removeItem(`user:${currentUserId}:lastSub`);
            localStorage.removeItem(`user:${currentUserId}:lastDifficulty`);
            localStorage.removeItem(`user:${currentUserId}:lastMode`);
          }
        } catch (e) {}

        // Apply defaults coming from backend or fallbacks
        try {
          const defs = res.defaults || { deck: null, domain: '1.0', sub: '1.1', mode: 'casual', difficulty: 'easy' }
          // Persist defaults to localStorage so normal restore flow can use them
          if (defs.deck) localStorage.setItem('lastDeck', defs.deck)

          // Map domain id -> full display string where possible and persist.
          try {
            if (defs.domain) {
                let domainFull = defs.domain;
                if (defs.deck && domainMaps && domainMaps[defs.deck] && domainMaps[defs.deck][defs.domain]) {
                  domainFull = `${defs.domain} ${domainMaps[defs.deck][defs.domain]}`;
                }
                // Persist defaults using per-user key if we have a known user, otherwise fallback to legacy
                if (currentUserId) localStorage.setItem(`user:${currentUserId}:lastDomain`, domainFull);
                else localStorage.setItem('lastDomain', domainFull);
              // Keep a runtime copy of the computed defaults in case the
              // later restore code runs before storage is visible or when
              // timing/order causes localStorage reads to miss the values.
              try { window._fc_initialMappedDomain = domainFull } catch (e) {}
            }
          } catch (e) {
            if (defs.domain) localStorage.setItem('lastDomain', defs.domain);
          }

          if (defs.sub) {
            if (currentUserId) localStorage.setItem(`user:${currentUserId}:lastSub`, defs.sub);
            else localStorage.setItem('lastSub', defs.sub);
          }
          if (defs.mode) {
            if (currentUserId) localStorage.setItem(`user:${currentUserId}:lastMode`, defs.mode);
            else localStorage.setItem('lastMode', defs.mode);
          }
          if (defs.difficulty) {
            if (currentUserId) localStorage.setItem(`user:${currentUserId}:lastDifficulty`, defs.difficulty);
            else localStorage.setItem('lastDifficulty', defs.difficulty);
          }

          // Store original defaults object so later code can fall back to
          // these values if localStorage doesn't yet reflect them.
          try { window._fc_initialDefaults = defs } catch (e) {}
        } catch (e) {}
      }
    } catch (e) {
      // ignore fresh-start failures
    }
  }

  // Debug overlay removed (no-op in production)

  // Prefer per-user saved selections when a user exists. Do NOT fall back
  // to legacy global keys when a user is present — that prevents a newly-
  // created user from inheriting stale selections.
  const savedDeck = currentUserId ? (localStorage.getItem(`user:${currentUserId}:lastDeck`) || null) : null;
  const savedDomain = currentUserId ? (localStorage.getItem(`user:${currentUserId}:lastDomain`) || null) : null;
  const savedSub = currentUserId ? (localStorage.getItem(`user:${currentUserId}:lastSub`) || null) : null;
  const savedDifficulty = currentUserId ? (localStorage.getItem(`user:${currentUserId}:lastDifficulty`) || null) : null;
  // Prefer a global (renderer-local) lastMode so mode selection is remembered
  // across navigations without requiring per-user persistence.
  const savedMode = (localStorage.getItem('lastMode') || (currentUserId ? (localStorage.getItem(`user:${currentUserId}:lastMode`) || null) : null) || null);

  // ✅ Populate deck dropdown without triggering events
  // Use the certNames exposed by loadDomainMap; if empty, show a friendly placeholder
  const hasTitles = data && Object.keys(data.certNames || {}).length;
  if (hasTitles) {
    await populateDeckDropdown(data.certNames, savedDeck);
    // Update visual state if selected deck has no cards
    try { updateDeckSelectNoCardsState(); } catch (e) {}
  } else {
    const deckSelect = document.getElementById("deck-select");
    deckSelect.innerHTML = "";
    const opt = new Option("No titles available", "");
    deckSelect.appendChild(opt);
    deckSelect.disabled = true;
  }

  // Decide the effective deck (saved or first available that appears to
  // have content). When no user is present we want to start from defaults
  // rather than any previously saved legacy key.
  const deckSelect = document.getElementById("deck-select");
  function findFirstDeckWithContent(certNamesObj, domainMapsObj, subdomainMapsObj) {
    if (!certNamesObj) return null;
    for (const id of Object.keys(certNamesObj)) {
      // Prefer decks that have domains and subdomains available in the
      // mapping data — a reasonable proxy for having cards.
      if (domainMapsObj && domainMapsObj[id]) {
        const domains = Object.keys(domainMapsObj[id] || {});
        if (domains.length > 0) {
          const firstDomain = domains[0];
          if (subdomainMapsObj && subdomainMapsObj[id] && subdomainMapsObj[id][firstDomain]) {
            const subs = Object.keys(subdomainMapsObj[id][firstDomain] || {});
            if (subs.length > 0) return id;
          } else {
            // If no subdomain map present, still accept the deck if domains exist
            return id;
          }
        }
      }
    }
    // Fallback to first certName key
    return Object.keys(certNamesObj)[0] || null;
  }

  const effectiveDeck = deckSelect && deckSelect.value ? deckSelect.value : (hasTitles ? findFirstDeckWithContent(data.certNames, domainMaps, subdomainMaps) : null);

  // Populate and select domains based on effectiveDeck. Domain option values are "<id> <title>".
  const domainSelect = document.getElementById("domain-select");
  const subSelect = document.getElementById("subdomain-select");

  domainSelect.innerHTML = `<option>All</option>`;
  subSelect.innerHTML = `<option>All</option>`;

  if (effectiveDeck && domainMaps[effectiveDeck]) {
    const entries = Object.entries(domainMaps[effectiveDeck]);
    entries.forEach(([domainId, domainTitle]) => {
      const full = `${domainId} ${domainTitle}`;
      const opt = new Option(full, full);
      domainSelect.appendChild(opt);
    });
  }

  // diagnostic logs removed

  // Determine which domain to select: prefer savedDomain if it matches either the
  // full value or the id; otherwise prefer domain '1.0' when present, else pick the
  // first available domain option.
  let chosenDomainVal = null;
  if (savedDomain) {
    // If savedDomain equals domain id (like '1.0') try to find matching full value
    const byId = Array.from(domainSelect.options).find(o => o.value.split(' ')[0] === savedDomain || o.value === savedDomain);
    if (byId) chosenDomainVal = byId.value;
    else {
      // Maybe savedDomain already holds full value
      const byFull = Array.from(domainSelect.options).find(o => o.value === savedDomain);
      if (byFull) chosenDomainVal = byFull.value;
    }
  }
  if (!chosenDomainVal && domainSelect.options.length > 1) {
    // prefer '1.0' when present
    const prefer = Array.from(domainSelect.options).find(o => o.value.split(' ')[0] === '1.0');
    if (prefer) chosenDomainVal = prefer.value;
    else chosenDomainVal = domainSelect.options[1].value;
  }
  if (chosenDomainVal) domainSelect.value = chosenDomainVal;

  // Populate subdomain list for the selected domain
  const selectedDomainId = domainSelect.value ? domainSelect.value.split(' ')[0] : null;
  subSelect.innerHTML = `<option>All</option>`;
  if (effectiveDeck && selectedDomainId && subdomainMaps[effectiveDeck] && subdomainMaps[effectiveDeck][selectedDomainId]) {
    const subMap = subdomainMaps[effectiveDeck][selectedDomainId];
    Object.entries(subMap).forEach(([subId, subTitle]) => {
      const opt = new Option(`${subId} ${subTitle}`, subId);
      subSelect.appendChild(opt);
    });
  }

  // Choose subdomain: prefer savedSub if matches id, otherwise prefer '1.1' then
  // first real option.
  let chosenSub = null;
  if (savedSub) {
    const bySub = Array.from(subSelect.options).find(o => o.value === savedSub || o.value.split(' ')[0] === savedSub);
    if (bySub) chosenSub = bySub.value;
  }
  if (!chosenSub && subSelect.options.length > 1) {
    const preferSub = Array.from(subSelect.options).find(o => o.value.split(' ')[0] === '1.1');
    if (preferSub) chosenSub = preferSub.value;
    else chosenSub = subSelect.options[1].value;
  }
  if (chosenSub) subSelect.value = chosenSub;

  // Mode and difficulty: default to saved values if present, otherwise defaults
  const modeSelect = document.getElementById('mode-select');
  modeSelect.value = savedMode || 'casual';
  currentMode = modeSelect.value;
  isTestMode = currentMode === 'test';

  // Ensure shuffle is enabled by default for a clean/start experience. If a
  // per-user preference exists, honor it; otherwise default to enabled.
  try {
    if (randomToggle) {
      if (currentUserId) {
        const savedShuffle = localStorage.getItem(`user:${currentUserId}:shuffle`);
        if (savedShuffle !== null) randomToggle.checked = savedShuffle === 'true';
        else randomToggle.checked = true;
      } else {
        randomToggle.checked = true;
      }
      // Save changes to per-user preference when toggled so the user's choice persists
      randomToggle.addEventListener('change', () => {
        try {
          const uid = localStorage.getItem('userId');
          if (uid) localStorage.setItem(`user:${uid}:shuffle`, randomToggle.checked);
          else localStorage.setItem('lastShuffle', randomToggle.checked);
        } catch (e) {}
      });
    }
  } catch (e) {}

  // Ensure difficulty select has at least a default option before the
  // initial fetch. If the control hasn't been populated yet, reading its
  // value returns an empty string which triggers the "fetch all cards"
  // fallback path in `fetchCards`. To avoid that, create a minimal
  // Easy-only option now; `updateDifficultyDropdown` will rebuild this
  // later once unlock info is available.
  try {
    const difficultySelect = document.getElementById('difficulty-select');
    if (difficultySelect && difficultySelect.options.length === 0) {
      difficultySelect.innerHTML = '';
      const easyOption = document.createElement('option');
      easyOption.value = 'Easy';
      easyOption.textContent = 'Easy';
      difficultySelect.appendChild(easyOption);
      difficultySelect.value = savedDifficulty || 'Easy';
    }
  } catch (e) {}

  // Now fetch cards; updateDifficultyDropdown will run later in the
  // fetchCardsAndUpdateCount flow to rebuild actual difficulty options.
  fetchCardsAndUpdateCount();

  // Set initial mode indicators after everything is loaded
  setTimeout(() => {
    updateModeIndicators();
  }, 200);

  // Run a lightweight background check to see if the domainmap has
  // changed since the last cached copy. If so, the cache will be updated
  // and `kemmei:refreshData` will fire which repopulates the UI. This
  // avoids heavy parsing/network activity on every cold launch.
  try { checkForDomainMapUpdate().catch(() => {}); } catch (e) {}
})();


const startBtn = document.getElementById("startSessionBtn");
const abortBtn = document.getElementById("abortBtn");
const exitBtn = document.getElementById("exitBtn");
const headerBar = document.querySelector(".flashcards-header");
const cardCountDisplay = document.getElementById("cardCountDisplay");
const cardContainer = document.getElementById("cardContainer");
const answerForm = document.getElementById("answer-form");
const checkBtn = document.getElementById("checkAnswerBtn");
const nextBtn = document.getElementById("nextBtn");
const skipBtn = document.getElementById("skipBtn");
const resetBtn = document.getElementById("resetBtn");
const restartBtn = document.getElementById("restartBtn");
const endMessage = document.getElementById("endMessage");
const flashcardBox = document.querySelector(".flashcard-box");
const cardMeta = document.getElementById("cardMeta") || document.querySelector(".card-meta");
// DISABLED: Utility buttons temporarily disabled
// const cardUtils = document.getElementById("cardUtils") || document.querySelector(".card-utils");
const cardUtils = null; // Placeholder for future utility button functionality
const progressCounter = document.getElementById("progressCounter");
const correctCounter = document.getElementById("correctCounter");
const randomToggle = document.getElementById("random-toggle");
const checkTooltip = document.getElementById("check-tooltip");
const nextTooltip = document.getElementById("next-tooltip");

let questions = [];
let currentIndex = 0;
let correctCount = 0;
let isUpdatingMode = false; // Flag to prevent overlapping mode updates
let isUpdatingCards = false; // Flag to prevent overlapping card updates
let isRebuildingDifficulty = false; // Flag to prevent difficulty change events during dropdown rebuild
// Track the last known valid (enabled) deck so we can revert when user
// or code attempts to select a disabled title that has no cards.
let lastValidDeck = null;

function saveLastSelection() {
  // Save per-user when possible to avoid leaking selections across users.
  let userId = null;
  try { userId = localStorage.getItem('userId'); } catch (e) {}
  // IMPORTANT: do not call async preload helpers here (e.g. window.userApi.getCurrentUserId)
  // because this function may be invoked from synchronous unload/visibility handlers.
  // Rely on the renderer-local copy in localStorage; if not present, fall back to
  // legacy global keys to avoid writing per-user keys under a Promise value.

  const deckVal = document.getElementById("deck-select").value;
  const domainVal = document.getElementById("domain-select").value;
  const subVal = document.getElementById("subdomain-select").value;
  // Validate difficulty before saving: sometimes during transient rebuilds the
  // control has no options or an empty value; avoid persisting that because
  // it overwrites the user's explicit saved difficulty.
  let diffVal = '';
  try {
    const diffEl = document.getElementById("difficulty-select");
    if (diffEl && typeof diffEl.selectedIndex === 'number') {
      const opt = diffEl.options[diffEl.selectedIndex];
      if (opt && opt.value && !opt.disabled) diffVal = opt.value;
    }
  } catch (e) { diffVal = ''; }
  const modeVal = document.getElementById("mode-select").value;

  try {
    if (userId) {
      localStorage.setItem(`user:${userId}:lastDeck`, deckVal);
      localStorage.setItem(`user:${userId}:lastDomain`, domainVal);
      localStorage.setItem(`user:${userId}:lastSub`, subVal);
      // Only persist difficulty if it's a valid non-empty enabled option
      if (diffVal) {
        localStorage.setItem(`user:${userId}:lastDifficulty`, diffVal);
      } else {
        try { /* debug: saveLastSelection skipped invalid/empty difficulty (removed) */ } catch (e) {}
      }
  try { localStorage.setItem(`user:${userId}:lastMode`, modeVal); } catch (e) {}
  // Also persist a global renderer-local lastMode so the selection is
  // restored even when per-user keys are not present or when a simple
  // machine-local preference is desired.
  try { localStorage.setItem('lastMode', modeVal); } catch (e) {}
  try { /* debug: saveLastSelection (per-user) removed */ } catch (e) {}
    } else {
      // Fallback for legacy behavior when no user is available
      localStorage.setItem("lastDeck", deckVal);
      localStorage.setItem("lastDomain", domainVal);
      localStorage.setItem("lastSub", subVal);
      if (diffVal) {
        localStorage.setItem("lastDifficulty", diffVal);
      } else {
  try { /* debug: saveLastSelection (legacy) skipped invalid save (removed) */ } catch (e) {}
      }
  try { localStorage.setItem("lastMode", modeVal); } catch (e) {}
  try { /* debug: saveLastSelection (legacy) removed */ } catch (e) {}
    }
  } catch (e) {
    // Ignore storage errors
  }
}

function restoreLastSelection() {
  // Prefer per-user keys in localStorage, fall back to legacy global keys
  let userId = null;
  try { userId = localStorage.getItem('userId'); } catch (e) {}

  const deck = (userId && localStorage.getItem(`user:${userId}:lastDeck`)) || localStorage.getItem("lastDeck") || (window._fc_initialDefaults && window._fc_initialDefaults.deck) || null;
  const domain = (userId && localStorage.getItem(`user:${userId}:lastDomain`)) || localStorage.getItem("lastDomain") || window._fc_initialMappedDomain || (window._fc_initialDefaults && window._fc_initialDefaults.domain) || null;
  const sub = (userId && localStorage.getItem(`user:${userId}:lastSub`)) || localStorage.getItem("lastSub") || (window._fc_initialDefaults && window._fc_initialDefaults.sub) || null;
  const difficulty = (userId && localStorage.getItem(`user:${userId}:lastDifficulty`)) || localStorage.getItem("lastDifficulty") || (window._fc_initialDefaults && window._fc_initialDefaults.difficulty) || null;

  if (deck) document.getElementById("deck-select").value = deck;
  try { /* debug: restoreLastSelection initial (removed) */ } catch (e) {}
  document.getElementById("deck-select").dispatchEvent(new Event("change"));

  setTimeout(() => {
    if (domain) document.getElementById("domain-select").value = domain;
    document.getElementById("domain-select").dispatchEvent(new Event("change"));
  try { /* debug: restoreLastSelection after deck/domain dispatch (removed) */ } catch (e) {}

    setTimeout(() => {
      if (sub) document.getElementById("subdomain-select").value = sub;
      document.getElementById("subdomain-select").dispatchEvent(new Event("change"));
  try { /* debug: restoreLastSelection after sub dispatch (removed) */ } catch (e) {}

      if (difficulty) document.getElementById("difficulty-select").value = difficulty;
      document.getElementById("difficulty-select").dispatchEvent(new Event("change"));
  try { /* debug: restoreLastSelection applied difficulty (removed) */ } catch (e) {}
    }, 150);
  }, 150);
}

// Log visibility/unload so we can trace navigation between Dashboard and Flashcards
try {
  window.addEventListener('beforeunload', (ev) => {
    try { /* flashcards beforeunload log removed */ } catch (e) {}
    try { saveLastSelection(); } catch (e) {}
  });
} catch (e) {}

try {
  document.addEventListener('visibilitychange', () => {
  try { /* flashcards visibilitychange log removed */ } catch (e) {}
    if (document.visibilityState === 'hidden') {
      try { saveLastSelection(); } catch (e) {}
    }
  });
} catch (e) {}

// When the page becomes visible again (for example after returning from Dashboard),
// force a full refresh so selectors, unlocks and card counts are recomputed.
try {
  document.addEventListener('visibilitychange', () => {
    try {
      if (document.visibilityState === 'visible') {
        // Force a full refresh of cards and dropdowns
        try { fetchCardsAndUpdateCount(); } catch (e) { /* silent */ }
      }
    } catch (e) {}
  });
} catch (e) {}

async function getUnlockedDifficulties() {
  const userId = localStorage.getItem("userId");
  if (!userId) {
    return ["easy"]; // Only Easy is available when no user is logged in
  }
  try {
    // Prefer IPC helpers (Electron preload) to avoid making `/api/...` network
    // calls which become `file:///.../api/...` when running from file://.
    let userData = {};
    let testCompletions = {};
    let unlocks = {};

    if (window.api) {
      // Try IPC-first
      try {
        if (typeof window.api.getUserProgress === 'function') {
          const r = await window.api.getUserProgress(userId);
          if (r && r.status >= 200 && r.status < 300) userData = r.body || {};
          else if (r && typeof r === 'object' && Object.keys(r).length) userData = r;
        }
      } catch (e) {
        console.warn('ipc getUserProgress failed', e && e.message);
      }

      try {
        if (typeof window.api.getTestCompletions === 'function') {
          const r = await window.api.getTestCompletions(userId);
          if (r && r.status >= 200 && r.status < 300) testCompletions = r.body || {};
          else if (r && typeof r === 'object' && Object.keys(r).length) testCompletions = r;
        }
      } catch (e) {
        console.warn('ipc getTestCompletions failed', e && e.message);
      }

      try {
        if (typeof window.api.getUserUnlocks === 'function') {
          const r = await window.api.getUserUnlocks(userId);
          if (r && r.status >= 200 && r.status < 300) unlocks = r.body || {};
          else if (r && typeof r === 'object' && Object.keys(r).length) unlocks = r;
        }
        // If we still have no unlocks and a generic rpc exists, try that form
        if ((!unlocks || Object.keys(unlocks).length === 0) && window.api && typeof window.api.rpc === 'function') {
          try {
            const r2 = await window.api.rpc(`user-unlocks/${userId}`, 'GET');
            if (r2 && r2.status >= 200 && r2.status < 300) unlocks = r2.body || {};
          } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.warn('ipc getUserUnlocks failed', e && e.message);
      }
    }

    // If IPC didn't provide data and we're running under a proper http(s) origin,
    // fall back to network fetch as a last resort. Avoid network fetch when
    // running under file:// (it will produce file:///api/... errors).
    const canNetwork = document.location.protocol !== 'file:' && typeof fetch === 'function';
    if (canNetwork) {
      try {
        if (!userData || Object.keys(userData).length === 0) {
          const res = await fetch(`/api/user-progress/${userId}`);
          if (res && res.ok) userData = await res.json();
        }
      } catch (e) {
        console.warn('network fetch failed for user-progress', e && e.message);
      }

      try {
        if (!testCompletions || Object.keys(testCompletions).length === 0) {
          const r = await fetch(`/api/test-completions/${userId}`);
          if (r && r.ok) testCompletions = await r.json();
        }
      } catch (e) {
        console.warn('network fetch failed for test-completions', e && e.message);
      }

      try {
        if (!unlocks || Object.keys(unlocks).length === 0) {
          const ur = await fetch(`/api/user-unlocks/${userId}`);
          if (ur && ur.ok) unlocks = await ur.json();
        }
      } catch (e) {
        console.warn('network fetch failed for user-unlocks', e && e.message);
      }
    } else {
      // Running from file:// and no IPC available — avoid attempting /api fetches
      if (!window.api) {
        console.warn('Running under file:// with no IPC bridge; skipping /api fetch and defaulting to Easy only');
        return ["easy"];
      }
    }
    // Merge any localStorage mirror entries so UI reflects user's recent
    // force-unlocks without waiting for backend/IPC round-trip.
    try {
      const mirrorRaw = localStorage.getItem(`user:${userId}:unlocks`);
      if (mirrorRaw) {
        const mirrorObj = JSON.parse(mirrorRaw || '{}');
        unlocks = Object.assign({}, unlocks || {}, mirrorObj || {});
      }
    } catch (e) {}
    
    // Determine what's unlocked based on mode and current selection
    const cert = document.getElementById("deck-select").value.trim();
    const domain = document.getElementById("domain-select").value.trim();
    
    let mediumUnlocked = false;
    let hardUnlocked = false;

    if (isTestMode) {
      // Test mode: check test completions for unlock status
      const domainKey = domain === "All" ? "all" : domain.split(" ")[0];
      const mediumKey = `${cert}:${domainKey}:medium`;
      const hardKey = `${cert}:${domainKey}:hard`;

      mediumUnlocked = (testCompletions[mediumKey] && (typeof testCompletions[mediumKey].unlocked !== 'undefined' ? !!testCompletions[mediumKey].unlocked : !!testCompletions[mediumKey])) || false;
      hardUnlocked = (testCompletions[hardKey] && (typeof testCompletions[hardKey].unlocked !== 'undefined' ? !!testCompletions[hardKey].unlocked : !!testCompletions[hardKey])) || false;

      // Aggregated-subdomain fallback: allow subdomain Test results to contribute
      // to a domain-level unlock. We compute a weighted average of subdomain
      // test scores (weights = totalQuestions when available, otherwise 1)
      // and require both weighted-average >= SCORE_THRESH and coverage >= COVERAGE_THRESH.
      const SCORE_THRESH = 90;
      const COVERAGE_THRESH = 0.75; // require tests for at least 75% of subdomains

      try {
        // Strict rule: require every subdomain to have a test score >= 90%.
        // Only attempt this when an explicit domain-level unlock wasn't found.
        if (!mediumUnlocked) {
          const subMap = (subdomainMaps && subdomainMaps[cert] && subdomainMaps[cert][domainKey]) ? Object.keys(subdomainMaps[cert][domainKey]) : [];
          const totalSubs = subMap.length;
          if (totalSubs > 0) {
            let allPassed = true;
            for (const subId of subMap) {
              let thisSubPassed = false;
              for (const [k, v] of Object.entries(testCompletions || {})) {
                try {
                  const parts = String(k || '').split(':').map(p => p.trim());
                  if (parts.length < 4) continue;
                  const [kCert, kDomainRaw, kSub, kDiff] = parts;
                  if (kCert !== cert) continue;
                  const kDomain = (kDomainRaw || '').split(' ')[0];
                  if (kDomain !== domainKey) continue;
                  if (kSub !== subId) continue;
                  if ((kDiff || '').toLowerCase() !== 'easy') continue;
                  const score = (v && typeof v.score === 'number') ? Number(v.score) : (v && v.data && typeof v.data.score === 'number' ? Number(v.data.score) : null);
                  if (score !== null && score >= 90) { thisSubPassed = true; break; }
                } catch (e) { /* ignore parse errors */ }
              }
              if (!thisSubPassed) { allPassed = false; break; }
            }
            if (allPassed) mediumUnlocked = true;
            if (allPassed) {
              // Persist domain-level unlock so other pages (Progress, list) see it
              try {
                const certKeySafe = cert.replace(/\./g, '_');
                const domainKeySafe = domainKey.replace(/\./g, '_');
                const mediumKey = `${certKeySafe}:${domainKeySafe}:medium`;
                const payload = { unlocked: true, source: 'aggregated-subdomain', when: new Date().toISOString() };
                if (persistedUnlocks.has(mediumKey)) {
                  try { if (DEBUG) console.info(`Skipping persist unlock (already persisted this session): ${mediumKey}`); } catch (e) {}
                } else {
                try { if (DEBUG) console.info(`Persisting aggregated unlock: ${mediumKey}`); } catch (e) {}
                // IPC helper preferred
                if (window.api && typeof window.api.saveUserUnlock === 'function') {
                  try { await window.api.saveUserUnlock(userId, mediumKey, payload); } catch (e) { /* ignore */ }
                }
                // Generic RPC fallback
                if (window.api && typeof window.api.rpc === 'function') {
                  try { await window.api.rpc(`user-unlocks/${userId}/${encodeURIComponent(mediumKey)}`, 'POST', payload); } catch (e) { /* ignore */ }
                }
                // HTTP fallback
                if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
                  try { await fetch(`/api/user-unlocks/${userId}/${encodeURIComponent(mediumKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) { /* ignore */ }
                }
                // Mirror to localStorage so UI reflects change immediately
                try {
                  const mirrorKey = `user:${userId}:unlocks`;
                  const raw = localStorage.getItem(mirrorKey);
                  const obj = raw ? JSON.parse(raw) : {};
                  obj[mediumKey] = payload;
                  localStorage.setItem(mirrorKey, JSON.stringify(obj));
                  // mark persisted in this session
                  persistedUnlocks.add(mediumKey);
                  try { if (DEBUG) console.info(`Persisted aggregated unlock (session mark added): ${mediumKey}`); } catch (e) {}
                } catch (e) { /* ignore */ }
                // Notify other pages
                try { window.dispatchEvent(new CustomEvent('kemmei:unlockToggled', { detail: { key: mediumKey, payload } })); } catch (e) {}
                }
              } catch (e) { /* non-fatal */ }
            }
          }
        }

        // Hard unlock: require every subdomain to have a Medium test >= 90%
        if (!hardUnlocked) {
          const subMap2 = (subdomainMaps && subdomainMaps[cert] && subdomainMaps[cert][domainKey]) ? Object.keys(subdomainMaps[cert][domainKey]) : [];
          const totalSubs2 = subMap2.length;
          if (totalSubs2 > 0) {
            let allPassed2 = true;
            for (const subId of subMap2) {
              let thisSubPassed2 = false;
              for (const [k, v] of Object.entries(testCompletions || {})) {
                try {
                  const parts = String(k || '').split(':').map(p => p.trim());
                  if (parts.length < 4) continue;
                  const [kCert, kDomainRaw, kSub, kDiff] = parts;
                  if (kCert !== cert) continue;
                  const kDomain = (kDomainRaw || '').split(' ')[0];
                  if (kDomain !== domainKey) continue;
                  if (kSub !== subId) continue;
                  if ((kDiff || '').toLowerCase() !== 'medium') continue;
                  const score = (v && typeof v.score === 'number') ? Number(v.score) : (v && v.data && typeof v.data.score === 'number' ? Number(v.data.score) : null);
                  if (score !== null && score >= 90) { thisSubPassed2 = true; break; }
                } catch (e) { /* ignore parse errors */ }
              }
              if (!thisSubPassed2) { allPassed2 = false; break; }
            }
            if (allPassed2) hardUnlocked = true;
              if (allPassed2) {
                // Persist hard unlock similarly
                try {
                  const certKeySafe = cert.replace(/\./g, '_');
                  const domainKeySafe = domainKey.replace(/\./g, '_');
                  const hardKey = `${certKeySafe}:${domainKeySafe}:hard`;
                  const payload = { unlocked: true, source: 'aggregated-subdomain', when: new Date().toISOString() };
                  if (persistedUnlocks.has(hardKey)) {
                    try { if (DEBUG) console.info(`Skipping persist unlock (already persisted this session): ${hardKey}`); } catch (e) {}
                  } else {
                    try { if (DEBUG) console.info(`Persisting aggregated unlock: ${hardKey}`); } catch (e) {}
                    if (window.api && typeof window.api.saveUserUnlock === 'function') {
                      try { await window.api.saveUserUnlock(userId, hardKey, payload); } catch (e) { /* ignore */ }
                    }
                    if (window.api && typeof window.api.rpc === 'function') {
                      try { await window.api.rpc(`user-unlocks/${userId}/${encodeURIComponent(hardKey)}`, 'POST', payload); } catch (e) { /* ignore */ }
                    }
                    if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
                      try { await fetch(`/api/user-unlocks/${userId}/${encodeURIComponent(hardKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) { /* ignore */ }
                    }
                    try {
                      const mirrorKey = `user:${userId}:unlocks`;
                      const raw = localStorage.getItem(mirrorKey);
                      const obj = raw ? JSON.parse(raw) : {};
                      obj[hardKey] = payload;
                      localStorage.setItem(mirrorKey, JSON.stringify(obj));
                      persistedUnlocks.add(hardKey);
                      try { if (DEBUG) console.info(`Persisted aggregated unlock (session mark added): ${hardKey}`); } catch (e) {}
                    } catch (e) { /* ignore */ }
                    try { window.dispatchEvent(new CustomEvent('kemmei:unlockToggled', { detail: { key: hardKey, payload } })); } catch (e) {}
                  }
                } catch (e) { /* non-fatal */ }
              }
          }
        }
      } catch (e) {
        // defensive: if aggregation code fails, fall back to explicit domain-level flags
      }
    } else {
      // Casual mode: use the new unlock preference system
      const certKey = cert.replace(/\./g, '_');
      const currentDomain = domain === "All" ? null : domain.split(" ")[0];
      
      if (currentDomain) {
        // Check domain-specific unlocks first
        const domainKey = currentDomain.replace(/\./g, '_');
  mediumUnlocked = unlockValue(unlocks, `${certKey}:${domainKey}:medium`);
  hardUnlocked = unlockValue(unlocks, `${certKey}:${domainKey}:hard`);
        
        // If domain-specific unlocks aren't set, fall back to title-level unlocks
        if (!mediumUnlocked) {
          mediumUnlocked = unlockValue(unlocks, `${certKey}:medium`);
        }
        if (!hardUnlocked) {
          hardUnlocked = unlockValue(unlocks, `${certKey}:hard`);
        }
      } else {
        // "All" domains selected - use title-level unlocks
        mediumUnlocked = unlocks[`${certKey}:medium`] || false;
        hardUnlocked = unlocks[`${certKey}:hard`] || false;
      }
      
      // If no unlock preferences are set, fall back to the old progress-based system
      if (!mediumUnlocked && !hardUnlocked) {
        // Build progress tree similar to progress.js (simplified version)
        const progressTree = {};
        for (const [key, data] of Object.entries(userData)) {
          const parts = key.replace(/~/g, '.').split(":");
          
          if (parts.length < 4) continue;
          
          const [certKey, domainKey, subKey, difficulty] = parts;
          if (!progressTree[certKey]) progressTree[certKey] = {};
          if (!progressTree[certKey][domainKey]) progressTree[certKey][domainKey] = {};
          if (!progressTree[certKey][domainKey][subKey]) progressTree[certKey][domainKey][subKey] = {};
          progressTree[certKey][domainKey][subKey][difficulty] = data;
        }
        
        // Check if Medium is unlocked (Easy is 100% complete)
        const currentCert = cert;
        
        if (currentDomain) {
          const domainProgress = progressTree[currentCert]?.[currentDomain];
          if (domainProgress) {
            for (const subId of Object.keys(domainProgress)) {
              const easyEntry = domainProgress[subId]?.easy;
              const actualData = Array.isArray(easyEntry) ? easyEntry[0] : easyEntry;
              if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                mediumUnlocked = true;
                break;
              }
            }
            
            // Check if Hard is unlocked (Medium is 100% complete)
            if (mediumUnlocked) {
              for (const subId of Object.keys(domainProgress)) {
                const mediumEntry = domainProgress[subId]?.medium;
                const actualData = Array.isArray(mediumEntry) ? mediumEntry[0] : mediumEntry;
                if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                  hardUnlocked = true;
                  break;
                }
              }
            }
          }
        } else {
          // "All" domains - check if ANY domain has Easy completed
          const certProgress = progressTree[currentCert];
          if (certProgress) {
            for (const domainId of Object.keys(certProgress)) {
              const domainData = certProgress[domainId];
              for (const subId of Object.keys(domainData)) {
                const easyEntry = domainData[subId]?.easy;
                const actualData = Array.isArray(easyEntry) ? easyEntry[0] : easyEntry;
                if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                  mediumUnlocked = true;
                  break;
                }
              }
              if (mediumUnlocked) break;
            }
            
            // Check Hard unlock
            if (mediumUnlocked) {
              for (const domainId of Object.keys(certProgress)) {
                const domainData = certProgress[domainId];
                for (const subId of Object.keys(domainData)) {
                  const mediumEntry = domainData[subId]?.medium;
                  const actualData = Array.isArray(mediumEntry) ? mediumEntry[0] : mediumEntry;
                  if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                    hardUnlocked = true;
                    break;
                  }
                }
                if (hardUnlocked) break;
              }
            }
          }
        }
      }
      // Also honor any explicit unlocks present in the 'unlocks' mirror so
      // that a difficulty manually unlocked in Casual mode remains available
      // when the user switches to Test mode. This ensures the UI doesn't
      // 'forget' unlocked levels when changing modes.
      try {
        const certKey = cert.replace(/\./g, '_');
        const domainKeySafe = (domain === 'All' ? 'all' : (domain || '').split(' ')[0] || '').replace(/\./g, '_');
        if (!mediumUnlocked) {
          mediumUnlocked = unlockValue(unlocks, `${certKey}:${domainKeySafe}:medium`) || unlockValue(unlocks, `${certKey}:medium`) || mediumUnlocked;
        }
        if (!hardUnlocked) {
          hardUnlocked = unlockValue(unlocks, `${certKey}:${domainKeySafe}:hard`) || unlockValue(unlocks, `${certKey}:hard`) || hardUnlocked;
        }
      } catch (e) { /* silent */ }
    }
    
    // Return array of unlocked difficulties
    const unlocked = ["easy"];
    if (mediumUnlocked) unlocked.push("medium");
    if (hardUnlocked) unlocked.push("hard");
    
    return unlocked;
  } catch (err) {
    console.error("❌ Failed to determine unlocked difficulties:", err);
    return ["easy"]; // Fallback to Easy only
  }
}

async function fetchCards(unlockedDifficulties = null) {
  const deck = document.getElementById("deck-select").value.trim();
  const domain = document.getElementById("domain-select").value.trim();
  const difficulty = document.getElementById("difficulty-select").value.trim();

  const baseQuery = new URLSearchParams();
  const subdomain = document.getElementById("subdomain-select")?.value.trim();
  if (subdomain && subdomain !== "All") {
    baseQuery.append("subdomain", subdomain);
  }
  if (deck) {
    baseQuery.append("cert_id", deck);
  }

  if (domain && domain !== "All" && !domain.startsWith("All")) {
    const domainValue = domain.split(" ")[0]; // Extract "3.0" from "3.0 Hardware"
    baseQuery.append("domain_id", domainValue);
  }
  
  let allCards = [];
  let fetchDebug = { source: null, query: {}, counts: {}, samples: {} };

  // Normalize difficulty handling so we never send or treat a raw 'All'
  // difficulty as an unrestricted "fetch everything" signal. When the UI
  // requests 'All', we interpret that as "fetch all unlocked difficulties"
  // (for fresh users this will be only ['easy']). Also ensure an empty
  // difficulty string falls back to 'Easy' to avoid the problematic
  // "fetch all cards" branch.
  let requestedDifficulty = (difficulty || '').trim();
  let useUnlockedSet = false;
  let computedUnlocked = unlockedDifficulties || null;
  if (!requestedDifficulty) {
    requestedDifficulty = 'Easy';
  }
  if (requestedDifficulty === 'All') {
    useUnlockedSet = true;
    computedUnlocked = computedUnlocked || await getUnlockedDifficulties();
  }

  // For this build we only load from the packaged local `data/cards` directory.
  // Skip any IPC/network branches and perform a constrained probe for the
  // currently selected cert/domain/sub only.
  // Determine selected cert/domain/sub (normalize values to ids)
  const cert = document.getElementById("deck-select").value.trim();
  const domainSelectEl = document.getElementById('domain-select');
  const subSelectEl = document.getElementById('subdomain-select');
  const domainVal = domainSelectEl ? domainSelectEl.value : '';
  const domainId = domainVal && domainVal !== 'All' ? domainVal.split(' ')[0] : null;
  const subValRaw = subSelectEl ? subSelectEl.value : '';
  const subVal = subValRaw && subValRaw !== 'All' ? subValRaw.split(' ')[0] : null;

  const localCards = [];

  // Prefer IPC-local API when available (Electron) to get exact cards for
  // the current selection. This avoids any filename probing or 404 noise.
  try {
    if (window.api && typeof window.api.getCards === 'function') {
      const params = {};
      if (cert) params.cert_id = cert;
      if (domainId) params.domain_id = domainId;
      if (subVal) params.subdomain = subVal;
      // If the UI requested a single difficulty, pass it through. If 'All',
      // omit difficulty so the API returns all levels and we'll filter below.
      if (requestedDifficulty && requestedDifficulty !== 'All') params.difficulty = requestedDifficulty.toLowerCase();
      try {
  const ipcCards = await window.api.getCards(params);
        if (ipcCards && ipcCards.length) {
          allCards = ipcCards;
          fetchDebug.source = 'ipc-local';
          fetchDebug.query = params;
        }
      } catch (e) {
        // ipc getCards failed; we'll fall back to local probing below
      }
    }
  } catch (e) {}
  // If IPC didn't provide card objects, ask main process to list the local
  // card JSON files in the selected folder. This avoids probing numeric
  // filenames from the renderer.
  try {
    if ((!allCards || allCards.length === 0) && window.api && typeof window.api.listLocalCards === 'function') {
      try {
  const listParams = { cert: cert };
  if (domainId) listParams.domain = domainId;
  if (subVal) listParams.sub = subVal;
  if (requestedDifficulty && requestedDifficulty !== 'All') listParams.difficulty = requestedDifficulty.toLowerCase();
  const listed = await window.api.listLocalCards(listParams);
        if (listed && listed.length) {
          allCards = listed;
          fetchDebug.source = 'ipc-listLocal';
          fetchDebug.query = listParams;
        }
      } catch (e) {
        // ignore and fall back to conservative probing
      }
    }
  } catch (e) {}

  // Sequential numeric probing has been disabled in this build. We rely on
  // IPC helpers (`getCards` and `listLocalCards`) to return actual available
  // card JSON objects for the current selection. If neither helper returns
  // results, `allCards` will remain empty and the UI will indicate zero cards.
  

  // Sequential numeric probing has been disabled in this build. We rely on
  // IPC helpers (`getCards` and `listLocalCards`) to return actual available
  // card JSON objects for the current selection. If neither helper returns
  // results, `allCards` will remain empty and the UI will indicate zero cards.

  // Normalize and enforce difficulty selection. If the UI requested a single
  // difficulty (Easy/Medium/Hard) filter the returned cards accordingly. If
  // the UI requested 'All' interpret that as the unlocked set (computedUnlocked)
  // and include cards whose difficulty matches any of those levels.
  const normalize = (s) => (s || '').toString().trim().toLowerCase();
  const detectCardDifficulty = (card) => {
    try {
      const meta = card.metadata || {};
      return normalize(card.difficulty || card.level || meta.difficulty || meta.level || meta.difficulty_level || meta.difficultyLevel || meta.Level);
    } catch (e) { return '' }
  };

  if (allCards && allCards.length) {
    if (requestedDifficulty === 'All') {
      // include only cards whose difficulty is in computedUnlocked
      const allowed = (computedUnlocked || []).map(d => d.toString().toLowerCase());
      if (allowed.length) {
        allCards = allCards.filter(c => {
          const d = detectCardDifficulty(c) || 'easy';
          return allowed.indexOf(d) !== -1;
        });
      }
    } else if (requestedDifficulty) {
      const want = normalize(requestedDifficulty);
      allCards = allCards.filter(c => {
        const d = detectCardDifficulty(c) || 'easy';
        return d === want;
      });
    }
  }

  // debug samples removed
  questions = allCards.map(card => {
    // Support multiple possible backend shapes. The local SQLite API stores
    // the main text in `content` and the original fields under `metadata`.
    const meta = card.metadata || {};
    const questionText = (card.question || card.question_text || card.questionText || card.content || meta.question_text || meta.question || meta.questionText || '').toString();
    const optionsSource = meta.answer_options || meta.options || meta.answerOptions || card.answer_options || card.options || [];
    const correctSource = meta.correct_answer || meta.correct || card.correct_answer || card.correct || [];
    const qType = meta.question_type || meta.questionType || card.question_type || card.questionType || 'multiple_choice';
    const explanation = meta.explanation || card.explanation || meta.explain || '';

    const correctArr = Array.isArray(correctSource) ? correctSource : (correctSource ? [correctSource] : []);
    const requiredCount = correctArr.length > 0 ? correctArr.length : (meta.requiredCount || meta.requiredCount === 0 ? meta.requiredCount : (card.required || 1));

    return {
    // preserve original card id so we can track viewed/correct per-card
    id: card._id || card.id || (meta && (meta.id || meta._id)) || null,
      question: questionText,
      options: shuffleAnswerOptions(optionsSource || []),
      correct: correctArr,
      required: requiredCount || 1,
      type: qType,
      explanation: explanation || ""
    };
  });

  // Debug: log a sample card so Electron runs can show what's being mapped
  // debug log removed

  // debug overlay and console.debug output removed

  return questions; // Return the questions array for potential shuffling
}

document.getElementById("deck-select").addEventListener("change", () => {
  const deckSel = document.getElementById('deck-select');
  try { console.info('deck-select change', { userId: localStorage.getItem('userId'), value: deckSel.value }); } catch (e) {}
  let certLabel = deckSel.value;
  let certId = certLabel;

  // If the newly-selected option is disabled (no cards), revert to the
  // last known valid deck or the first enabled option. This prevents
  // the UI from entering a state where a title with zero cards is the
  // active selection.
  try {
    const selOpt = deckSel.options[deckSel.selectedIndex];
    if (selOpt && selOpt.disabled) {
      // Revert selection
      if (lastValidDeck && deckSel.querySelector(`option[value="${lastValidDeck}"]`)) {
        deckSel.value = lastValidDeck;
      } else {
        // pick first non-disabled option
        for (let i = 0; i < deckSel.options.length; i++) {
          if (!deckSel.options[i].disabled) { deckSel.selectedIndex = i; break; }
        }
      }
      updateDeckSelectNoCardsState();
      // update certId to reflect the reverted value so the rest of the
      // handler continues to populate domains/fetch cards for a valid
      // deck rather than aborting silently.
  try { certLabel = deckSel.value; certId = certLabel; } catch (e) {}
      // continue on
    }
    // Remember this as the last valid deck
    if (selOpt && !selOpt.disabled) lastValidDeck = deckSel.value;
  } catch (e) {}

  const domainSelect = document.getElementById("domain-select");
  const subSelect = document.getElementById("subdomain-select");

  domainSelect.innerHTML = `<option>All</option>`;
  subSelect.innerHTML = `<option>All</option>`;

  // If we don't have domainMaps yet (fallback case), attempt to reload
  if (!domainMaps || Object.keys(domainMaps).length === 0) {
    loadDomainMap().then(d => {
      // enable deck select in case it was disabled earlier
      const deckSel = document.getElementById('deck-select');
      if (deckSel) deckSel.disabled = false;
      if (certId && domainMaps[certId]) {
        Object.entries(domainMaps[certId]).forEach(([domainId, domainTitle]) => {
          const opt = new Option(`${domainId} ${domainTitle}`, `${domainId} ${domainTitle}`);
          domainSelect.appendChild(opt);
        });
      }
      domainSelect.disabled = false;
      subSelect.disabled = !(
        certId && domainMaps[certId] && Object.keys(subdomainMaps[certId] || {}).length
      );
      saveLastSelection();
      fetchCardsAndUpdateCount();
    }).catch(() => { /* ignore */ });
    return;
  }

  if (certId && domainMaps[certId]) {
    Object.entries(domainMaps[certId]).forEach(([domainId, domainTitle]) => {
      const opt = new Option(`${domainId} ${domainTitle}`, `${domainId} ${domainTitle}`);
      domainSelect.appendChild(opt);
    });
  }

  domainSelect.disabled = false;
  subSelect.disabled = !(
    certId && domainMaps[certId] && Object.keys(subdomainMaps[certId] || {}).length
  );

  saveLastSelection();
  fetchCardsAndUpdateCount();
});


document.getElementById("domain-select").addEventListener("change", () => {
  const certLabel = document.getElementById("deck-select").value;
  const domainSelect = document.getElementById("domain-select");
  const subSelect = document.getElementById("subdomain-select");

  const certId = certLabel;
  const domainId = domainSelect.value.split(" ")[0];

  subSelect.innerHTML = `<option>All</option>`;

  if (certId && domainId && subdomainMaps[certId]?.[domainId]) {
    const subMap = subdomainMaps[certId][domainId];
    Object.entries(subMap).forEach(([subId, subTitle]) => {
      // Full text display with CSS handling the wrapping
      const opt = new Option(`${subId} ${subTitle}`, subId);
      subSelect.appendChild(opt);
    });
  }

  // After changing domain, ensure the currently-selected difficulty is valid
  // for the new domain. If not, pick the first allowed difficulty (prefer
  // Medium then Hard then Easy) based on the user's unlocks and local mirror.
  (async () => {
    try {
      const unlocked = await getUnlockedDifficulties();
      const allowed = (unlocked || []).map(d => (d || '').toString().toLowerCase());
      // Merge local mirror unlocks (if any) to avoid forgetting manual unlocks
      try {
        const userId = localStorage.getItem('userId');
        if (userId) {
          const mirrorRaw = localStorage.getItem(`user:${userId}:unlocks`);
          if (mirrorRaw) {
            const mirrorObj = JSON.parse(mirrorRaw || '{}');
            const certKeySafe = (certId || '').replace(/\./g, '_');
            const domainKeyCurrent = (domainSelect.value || 'All') === 'All' ? 'all' : (domainSelect.value || '').split(' ')[0];
            for (const k of Object.keys(mirrorObj || {})) {
              if (!k || typeof k !== 'string') continue;
              const parts = k.split(':');
              const diffKey = parts[parts.length - 1];
              if (!diffKey) continue;
              const low = diffKey.toString().toLowerCase();
              if (low !== 'medium' && low !== 'hard') continue;

              if (parts.length === 3) {
                const mirrorCert = parts[0];
                const mirrorDomain = parts[1];
                if (mirrorCert === certKeySafe && mirrorDomain === domainKeyCurrent) {
                  if (!allowed.includes(low)) allowed.push(low);
                }
              } else if (parts.length === 2) {
                const mirrorCert = parts[0];
                if (mirrorCert === certKeySafe) {
                  if (!allowed.includes(low)) allowed.push(low);
                }
              }
            }
          }
        }
      } catch (e) { /* ignore mirror parse errors */ }

      const diffEl = document.getElementById('difficulty-select');
      const current = (diffEl && diffEl.value) ? diffEl.value.toString().toLowerCase() : '';
      if (!allowed.includes(current)) {
        // prefer Medium then Hard then Easy when available
        let pick = 'easy';
        if (allowed.includes('medium')) pick = 'Medium';
        else if (allowed.includes('hard')) pick = 'Hard';
        else pick = 'Easy';
        // find actual option value matching case-insensitively
        const opt = Array.from(diffEl.options).find(o => (o.value || '').toString().toLowerCase() === pick.toString().toLowerCase());
        if (opt) diffEl.value = opt.value; else diffEl.value = pick;
      }
    } catch (e) { /* ignore */ }
    try { saveLastSelection(); } catch (e) {}
    try { await fetchCardsAndUpdateCount(); } catch (e) {}
  })();
});


  async function fetchCardsAndUpdateCount() {
    // Prevent overlapping card fetch operations
    if (isUpdatingCards) {
      return;
    }
    
    isUpdatingCards = true;
    // indicate loading to the UI and disable Start to avoid premature click
    try { startBtn.disabled = true; startBtn.classList.add('loading-cards'); } catch (e) {}
    
    try {
      // Get unlocked difficulties once and pass to both functions
      const unlockedDifficulties = await getUnlockedDifficulties();

      // Rebuild difficulty dropdown first so the UI reflects the current unlocks
      // and any local mirror unlocks before we fetch cards. This prevents a
      // race where a stale dropdown or transient 'All' selection causes the
      // fetch to return an incorrect card set/count.
      await updateDifficultyDropdown(unlockedDifficulties);

      // Now fetch cards with the up-to-date unlocked difficulties
      await fetchCards(unlockedDifficulties);
      updateCardCount();
    } catch (err) {
      console.error("Error in fetchCardsAndUpdateCount:", err);
    } finally {
      isUpdatingCards = false;
      try { startBtn.classList.remove('loading-cards'); } catch (e) {}
      try { startBtn.disabled = !(questions && questions.length > 0); } catch (e) {}
    }
  }

  async function updateDifficultyDropdown(unlockedDifficulties = null) {
    // Prevent difficulty change handlers from reacting while we rebuild options
    isRebuildingDifficulty = true;

    const difficultySelect = document.getElementById("difficulty-select");
    const userId = localStorage.getItem("userId");

    // If there's no logged-in user, show Easy and locked Medium/Hard
    if (!userId) {
      difficultySelect.innerHTML = "";
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);

      const mediumOption = document.createElement("option");
      mediumOption.value = "Medium";
      mediumOption.textContent = "🔒 Medium";
      mediumOption.disabled = true;
      difficultySelect.appendChild(mediumOption);

      const hardOption = document.createElement("option");
      hardOption.value = "Hard";
      hardOption.textContent = "🔒 Hard";
      hardOption.disabled = true;
      difficultySelect.appendChild(hardOption);

      difficultySelect.value = "Easy";
      isRebuildingDifficulty = false;
      return;
    }

    try {
      const unlocked = unlockedDifficulties || await getUnlockedDifficulties();

      // preserve current selection to try to reuse it if still valid
      const currentDifficulty = difficultySelect.value;
      difficultySelect.innerHTML = "";

      const mediumUnlocked = unlocked.includes("medium");
      const hardUnlocked = unlocked.includes("hard");

      // Build options
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);

      const mediumOption = document.createElement("option");
      mediumOption.value = "Medium";
      mediumOption.textContent = mediumUnlocked ? "Medium" : "🔒 Medium";
      mediumOption.disabled = !mediumUnlocked;
      difficultySelect.appendChild(mediumOption);

      const hardOption = document.createElement("option");
      hardOption.value = "Hard";
      hardOption.textContent = hardUnlocked ? "Hard" : "🔒 Hard";
      hardOption.disabled = !hardUnlocked;
      difficultySelect.appendChild(hardOption);

      if (mediumUnlocked || hardUnlocked) {
        const allOption = document.createElement("option");
        allOption.value = "All";
        allOption.textContent = "All";
        difficultySelect.appendChild(allOption);
      }

      // If a saved difficulty exists but was marked disabled, consult the local mirror
      try {
        const storageKey = `user:${userId}:lastDifficulty`;
        const savedDiffRaw = localStorage.getItem(storageKey) || localStorage.getItem('lastDifficulty') || null;
        if (savedDiffRaw) {
          const savedDiff = (savedDiffRaw || '').toString().trim();
          const savedLower = savedDiff.toLowerCase();
          if ((savedLower === 'medium' || savedLower === 'hard')) {
            const opt = Array.from(difficultySelect.options).find(o => (o.value || '').toString().toLowerCase() === savedLower);
            if (opt && opt.disabled) {
              try {
                const mirrorRaw = localStorage.getItem(`user:${userId}:unlocks`);
                const mirrorObj = mirrorRaw ? JSON.parse(mirrorRaw) : {};
                const cert = document.getElementById('deck-select').value.trim();
                const domainVal = document.getElementById('domain-select').value.trim();
                const domainKey = domainVal && domainVal !== 'All' ? domainVal.split(' ')[0] : 'all';
                const certKeySafe = (cert || '').replace(/\./g, '_');
                const domainKeySafe = (domainKey || '').replace(/\./g, '_');
                const unlockKey = `${certKeySafe}:${domainKeySafe}:${savedLower}`;
                if (mirrorObj && Object.prototype.hasOwnProperty.call(mirrorObj, unlockKey)) {
                  opt.disabled = false;
                  opt.textContent = savedDiff;
                }
              } catch (e) {
                // ignore JSON parse or mirror errors
              }
            }
          }
        }
      } catch (e) {
        // silent
      }

      // Try to restore saved preference first
      let restored = false;
      try {
        const storageKey = `user:${userId}:lastDifficulty`;
        const savedDiff = localStorage.getItem(storageKey) || localStorage.getItem('lastDifficulty') || null;
        if (savedDiff) {
          const match = Array.from(difficultySelect.options).find(opt => (opt.value || '').toString().toLowerCase() === (savedDiff || '').toString().toLowerCase());
          if (match) {
            difficultySelect.value = match.value;
            restored = true;
            if (!match.disabled) {
              try { saveLastSelection(); } catch (e) { /* silent */ }
            }
          }
        }
      } catch (e) {
        // silent
      }

      // If not restored, try to keep the current in-DOM selection if valid
      if (!restored && currentDifficulty && currentDifficulty !== 'All') {
        const match = Array.from(difficultySelect.options).find(opt => (opt.value || '').toString().toLowerCase() === (currentDifficulty || '').toString().toLowerCase() && !opt.disabled);
        if (match) {
          difficultySelect.value = match.value;
          restored = true;
        }
      }

      // Final fallback to Easy
      if (!restored) {
        difficultySelect.value = "Easy";
      }

      // Persist only if we restored a non-default selection
      try {
        if (restored) {
          saveLastSelection();
        }
      } catch (e) { /* silent */ }

    } catch (err) {
      // On error, show only Easy and disable others
      try {
        difficultySelect.innerHTML = "";
        const easyOption = document.createElement("option");
        easyOption.value = "Easy";
        easyOption.textContent = "Easy";
        difficultySelect.appendChild(easyOption);

        const mediumOption = document.createElement("option");
        mediumOption.value = "Medium";
        mediumOption.textContent = "🔒 Medium";
        mediumOption.disabled = true;
        difficultySelect.appendChild(mediumOption);

        const hardOption = document.createElement("option");
        hardOption.value = "Hard";
        hardOption.textContent = "🔒 Hard";
        hardOption.disabled = true;
        difficultySelect.appendChild(hardOption);

        difficultySelect.value = "Easy";
      } catch (e) { /* silent */ }
    } finally {
      isRebuildingDifficulty = false;
      // Ensure tooltip attributes are present on the controls
      try {
        const modeSelect = document.getElementById('mode-select');
        if (modeSelect) {
          // Remove native/title tooltip to avoid duplicate native browser tooltip.
          try { modeSelect.removeAttribute('title'); } catch (e) {}
          modeSelect.classList.add('has-tooltip');
        }

        const diffSelect = document.getElementById('difficulty-select');
        if (diffSelect) {
          // Disable native/title tooltip for difficulty (we don't want a tooltip for now).
          try { diffSelect.removeAttribute('title'); } catch (e) {}
          // Intentionally do not attach any floating tooltip for difficulty.
        }
      } catch (e) {
        // no-op if DOM not ready
      }
    }
  }

  function updateCardCount() {
    cardCountDisplay.textContent = `Cards: ${questions.length}`;
  
    if (questions.length === 0) {
        startBtn.disabled = true;
      randomToggle.disabled = true;
      randomToggle.checked = false; // uncheck shuffle when disabled
    } else if (questions.length === 1) {
        startBtn.disabled = false && !isUpdatingCards;
      randomToggle.disabled = true;
      randomToggle.checked = false;
    } else {
        startBtn.disabled = false && !isUpdatingCards;
      randomToggle.disabled = false;
    }
    
    // Update mode indicators after card count is set
    updateModeIndicators();
  }
  

// Removed duplicate individual event listeners - using ones above in main flow

document.getElementById("difficulty-select").addEventListener("change", () => {
  // Skip if we're rebuilding the dropdown programmatically
  if (isRebuildingDifficulty) {
    return;
  }
  
  try { console.info('difficulty-select change', { userId: localStorage.getItem('userId'), value: document.getElementById('difficulty-select').value }); } catch (e) {}
  saveLastSelection();
  
  // Use the protected version to prevent overlapping calls
  fetchCardsAndUpdateCount().catch(err => {
    console.error("Error fetching cards after difficulty change:", err);
  });
});

const subdomainSelect = document.getElementById("subdomain-select");

subdomainSelect.addEventListener("change", (event) => {
  saveLastSelection();
  fetchCardsAndUpdateCount();
});

// Removed duplicate event listeners - using individual ones above instead

  async function startSession() {
  dbg("🔍 startSession() called");
  dbg("🔍 isTestMode at start:", isTestMode);
  dbg("🔍 currentMode at start:", currentMode);
    
    if (questions.length === 0) {
      alert("No cards found for this deck/domain/difficulty.");
      return;
    }

    // Store test parameters if in test mode
    if (isTestMode) {
      const selectedSubdomain = document.getElementById("subdomain-select")?.value.trim();
      testStartData = {
        cert: document.getElementById("deck-select").value.trim(),
        domain: document.getElementById("domain-select").value.trim(),
        subdomain: selectedSubdomain && selectedSubdomain !== "All" ? selectedSubdomain : null,
        difficulty: document.getElementById("difficulty-select").value.trim(),
        totalQuestions: questions.length,
        startTime: new Date()
      };
  dbg("🔍 Test start data set:", testStartData);
    } else {
  dbg("🔍 Not in test mode, testStartData not set");
    }

    // Check if cards should be shuffled
    const shouldShuffle = randomToggle.checked;
    if (shouldShuffle) {
      questions = shuffleCards(questions);
    }

    cardCountDisplay.style.display = "none"; 

    startBtn.classList.add("hidden");
    
    // 🆕 Move abort button into header FIRST, then show it
    const headerInner = document.querySelector(".header-inner") || headerBar;
    headerInner.appendChild(abortBtn);
    abortBtn.classList.remove("hidden");
    
    exitBtn.classList.add("hidden");
    headerBar.classList.add("dimmed");
    document.getElementById("filterWrapper").classList.add("disabled");

    // 🆕 Collapse the header to a compact bar so the flashcard area gets more vertical space
    const collapsedBar = document.getElementById('collapsedBar');
    const collapsedText = document.getElementById('collapsedHeaderText');
    if (collapsedBar && headerBar) {
      // Build compact header string: TitleShort | DomainNum | SubNum | Mode | Difficulty
      try {
  // Use the full deck value (e.g. '220-1201') for compact header rather than truncating
  const deckVal = document.getElementById('deck-select').value || '';
  const titleShort = (deckVal || '').toString().trim();
        const domainVal = (document.getElementById('domain-select').value || '').split(' ')[0] || '';
        const subVal = (document.getElementById('subdomain-select').value || '').split(' ')[0] || '';
        const modeVal = (document.getElementById('mode-select').value || 'casual');
        const diffVal = (document.getElementById('difficulty-select').value || 'Easy');
        const compact = `${titleShort} | ${domainVal} | ${subVal} | ${capitalize(modeVal)} | ${capitalize(diffVal)}`;
        if (collapsedText) collapsedText.textContent = compact;
      } catch (e) {}

        headerBar.classList.add('collapsed');
        collapsedBar.style.display = '';
        collapsedBar.setAttribute('aria-hidden', 'false');
        // Move abort button into collapsedBar so it appears on the second line
        const collapsedAbortWrap = collapsedBar.querySelector('.collapsed-abort');
        if (collapsedAbortWrap) {
          collapsedAbortWrap.appendChild(abortBtn);
          abortBtn.classList.remove('hidden');
        }
    }

    // Hide Shuffle toggle
    randomToggle.parentElement.style.display = "none";

    flashcardBox.classList.remove("hidden");
    cardMeta.classList.remove("hidden");
    // DISABLED: Utility buttons temporarily disabled
    // cardUtils.classList.remove("hidden");
    if (cardUtils) cardUtils.classList.remove("hidden");
    endMessage.classList.add("hidden");

    currentIndex = 0;
    correctCount = 0;
    loadCard();
  }
            // Notify other windows/pages that a test save occurred so they can refresh
            try {
              window.dispatchEvent(new CustomEvent('kemmei:testSaved', { detail: { userId, cert: testStartData.cert, domain: testStartData.domain, subdomain: testStartData.subdomain, difficulty: testStartData.difficulty, score: percent } }));
            } catch (e) { /* ignore */ }

function loadCard() {
  const q = questions[currentIndex];
  // mark this card as seen for session-level stats (if id exists)
  try { const cid = q && (q.id || q._id); if (cid) sessionSeenCardIds.add(cid); } catch (e) {}
  // debug log removed
  cardContainer.textContent = q.question;
  answerForm.innerHTML = "";

  // Remove any existing inline explanations from previous cards
  const existingExplanation = answerForm.querySelector(".inline-explanation");
  if (existingExplanation) {
    existingExplanation.remove();
  }

  updateUserProgress(
  document.getElementById("deck-select").value.trim(),
  document.getElementById("domain-select").value.trim().split(" ")[0],
  document.getElementById("subdomain-select")?.value.trim(),
  false,
  true // this is 'viewedOnly'
);

  q.options.forEach(option => {
    const div = document.createElement("div");
    div.className = "option";
    div.textContent = option;

    div.addEventListener("click", () => {
      const isSelected = div.classList.contains("selected");
      const selectedCount = answerForm.querySelectorAll(".option.selected").length;
      const maxSelections = q.required;

      // if (q.required === 1) {
      //   answerForm.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
      //   div.classList.toggle("selected");
      // } else {
      //   if (isSelected) {
      //     div.classList.remove("selected");
      //   } else if (selectedCount < maxSelections) {
      //     div.classList.add("selected");
      //   }
      // }

      if (q.type === "multiple_choice") {
  answerForm.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
  div.classList.toggle("selected");
} else if (q.type === "select_multiple") {
  if (isSelected) {
    div.classList.remove("selected");
  } else if (selectedCount < q.required) {
    div.classList.add("selected");
  }
} else {
  // select_all: no limit
  if (isSelected) {
    div.classList.remove("selected");
  } else {
    div.classList.add("selected");
  }
}

      updateCheckState();
    });

    answerForm.appendChild(div);
  });

  checkBtn.disabled = true;
  checkBtn.classList.remove("primary");
  checkTooltip.style.display = "block";

  nextBtn.disabled = true;
  nextBtn.classList.remove("primary");
  nextTooltip.style.display = "block";

  updateMeta();
}

  function updateCheckState() {
    const q = questions[currentIndex];
    const selected = answerForm.querySelectorAll(".option.selected");
    const selectedCount = selected.length;
  
    let isReady = false;
  
    if (q.type === "select_all") {
      isReady = selectedCount > 0;
    } else if (q.required === 1) {
      isReady = selectedCount === 1;
    } else {
      isReady = selectedCount === q.required;
    }
  
    checkBtn.disabled = !isReady;
    checkBtn.classList.toggle("primary", isReady);
    checkTooltip.style.display = isReady ? "none" : "block";
  }

  function updateMeta() {
    progressCounter.textContent = `Card ${currentIndex + 1} of ${questions.length}`;
    correctCounter.textContent = `Correct answers: ${correctCount} / ${questions.length}`;

    // If this is the last card in the active deck, change the Next button label
    // to "Finish" so users know they're at the end of the deck.
    try {
      if (nextBtn) {
        const isLast = (questions && questions.length > 0 && currentIndex === questions.length - 1);
        nextBtn.textContent = isLast ? 'Finish' : 'Next';
        // Toggle a class so CSS can recolor the button when it's the final action
        nextBtn.classList.toggle('finish', isLast);
      }
    } catch (e) {
      // Defensive: don't let UI label update errors break the flow
      console.warn('Failed to update next button label', e && e.message);
    }
  }

  function checkAnswer() {
    if (checkBtn.disabled) return;

    const q = questions[currentIndex];
    const selected = Array.from(answerForm.querySelectorAll(".option.selected")).map(opt => opt.textContent.trim());

    answerForm.querySelectorAll(".option").forEach(opt => {
      const txt = opt.textContent.trim();
      const isCorrectAnswer = q.correct.includes(txt);
      const wasSelected = selected.includes(txt);
      
      // Apply background colors for correctness
      if (isCorrectAnswer) {
        opt.classList.add("correct");
      }
      
      // Apply border styles for user selections
      if (wasSelected) {
        if (isCorrectAnswer) {
          opt.classList.add("user-correct");
        } else {
          opt.classList.add("user-incorrect");
        }
      }
      
      opt.classList.remove("selected");
      opt.style.pointerEvents = "none";
    });

    const isCorrect = q.correct.every(ans => selected.includes(ans)) && selected.length === q.correct.length;
    if (isCorrect) {
      correctCount++;
      try { const cid = q && (q.id || q._id); if (cid) sessionCorrectCardIds.add(cid); } catch (e) {}
    }

    // Show explanation inline below answer options
    if (q.explanation && q.explanation.trim()) {
      const explanationDiv = document.createElement("div");
      explanationDiv.className = "inline-explanation";
      explanationDiv.innerHTML = `
        <div class="explanation-content">
          <span class="explanation-icon">💡</span>
          ${q.explanation}
        </div>
      `;
      answerForm.appendChild(explanationDiv);
    }

    checkBtn.disabled = true;
    checkBtn.classList.remove("primary");
    checkTooltip.style.display = "none";

    nextBtn.disabled = false;
    nextBtn.classList.add("primary");
    nextTooltip.style.display = "none";

    updateUserProgress(
  document.getElementById("deck-select").value.trim(),
  document.getElementById("domain-select").value.trim().split(" ")[0],
  document.getElementById("subdomain-select")?.value.trim(),
  isCorrect
);

    updateMeta();
  }

  function nextCard() {
    currentIndex++;
    if (currentIndex >= questions.length) {
      showEnd();
    } else {
      loadCard();
    }
  }

  async function showEnd() {
  dbg("🔍 showEnd() called");
  dbg("🔍 isTestMode:", isTestMode);
  dbg("🔍 testStartData:", testStartData);
  dbg("🔍 currentMode:", currentMode);
    
    abortBtn.classList.add("hidden");
    exitBtn.classList.remove("hidden");

    flashcardBox.classList.add("hidden");
    cardMeta.classList.add("hidden");
    // DISABLED: Utility buttons temporarily disabled
    // cardUtils.classList.add("hidden");
    if (cardUtils) cardUtils.classList.add("hidden");
    endMessage.classList.remove("hidden");

    const percent = Math.round((correctCount / questions.length) * 100);
    let finalMessage = `Correct: ${correctCount} / ${questions.length} (${percent}%)`;
    
  dbg("🔍 About to check test mode completion, isTestMode && testStartData:", isTestMode && testStartData);
    
    // Handle test mode completion
    if (isTestMode && testStartData) {
      const passed = percent >= 90; // 90% passing requirement
      
      if (passed) {
        finalMessage += "\n🎉 Test PASSED! Next difficulty level unlocked.";
      } else {
        finalMessage += "\n❌ Test FAILED. Need 90% to unlock next level.";
      }
      
      // Record test completion and progress
      try {
        const userId = localStorage.getItem("userId");
  dbg("🔍 Current userId from localStorage:", userId);
        
        if (!userId) {
          console.warn("⚠️ No userId found - test results will not be recorded");
          return;
        }
        
        // Resolve user id from localStorage, falling back to preload's current user
        if (!userId && window.userApi && typeof window.userApi.getCurrentUserId === 'function') {
          try { const cur = await window.userApi.getCurrentUserId(); if (cur) userId = cur; } catch (e) { }
        }

        if (userId) {
          dbg("🔍 Recording test completion for:", testStartData);
          dbg("🔍 Score:", percent, "Correct:", correctCount, "Total:", questions.length);

          const testCompletionData = {
            cert: testStartData.cert,
            domain: testStartData.domain === "All" ? null : testStartData.domain.split(" ")[0],
            subdomain: testStartData.subdomain,
            difficulty: testStartData.difficulty.toLowerCase(),
            score: percent,
            totalQuestions: testStartData.totalQuestions,
            correctAnswers: correctCount,
            completedAt: new Date()
          };

          // Use preload save helper when available for reliable IPC
          try {
            if (window.api && typeof window.api.saveTestCompletion === 'function') {
              await window.api.saveTestCompletion(userId, `${testStartData.cert}:${testStartData.domain}:${testStartData.subdomain || 'all'}:${testStartData.difficulty}`, testCompletionData);
            } else if (window.api && typeof window.api.rpc === 'function') {
              await window.api.rpc(`test-completions/${userId}`, 'POST', testCompletionData);
            } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
              await fetch(`/api/test-completion/${userId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testCompletionData) });
            } else {
              console.warn('Skipping network test-completion POST: running under file:// with no IPC bridge');
            }
          } catch (e) {
            console.warn('Failed to save test completion', e && e.message);
          }

          // Record progress (patch) - prefer preload saveProgress helper
          try {
            const difficulty = testStartData.difficulty.toLowerCase();
            if (testStartData.subdomain) {
              const progressKey = `${testStartData.cert}:${testStartData.domain.split(' ')[0]}:${testStartData.subdomain}:${difficulty}`;
              const progressData = { key: progressKey.replace(/\./g, '~'), correct: correctCount, total: questions.length, isTestResult: true };
              try {
                if (sessionSeenCardIds && sessionSeenCardIds.size) progressData.cardIds = Array.from(sessionSeenCardIds);
                if (sessionCorrectCardIds && sessionCorrectCardIds.size) progressData.correctCardIds = Array.from(sessionCorrectCardIds);
                progressData.completedAt = new Date().toISOString();
              } catch (e) {}
              if (window.api && typeof window.api.saveProgress === 'function') {
                await window.api.saveProgress(userId, progressData.key, progressData);
              } else if (window.api && typeof window.api.rpc === 'function') {
                await window.api.rpc(`user-progress/${userId}`, 'PATCH', progressData);
              } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
                await fetch(`/api/user-progress/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(progressData) });
              } else {
                console.warn('Skipping network user-progress PATCH: running under file:// with no IPC bridge');
              }
            } else {
              const progressKey = `${testStartData.cert}:${testStartData.domain.split(' ')[0]}:all:${difficulty}`;
              const progressData = { key: progressKey.replace(/\./g, '~'), correct: correctCount, total: questions.length, isTestResult: true };
              try {
                if (sessionSeenCardIds && sessionSeenCardIds.size) progressData.cardIds = Array.from(sessionSeenCardIds);
                if (sessionCorrectCardIds && sessionCorrectCardIds.size) progressData.correctCardIds = Array.from(sessionCorrectCardIds);
                progressData.completedAt = new Date().toISOString();
              } catch (e) {}
              if (window.api && typeof window.api.saveProgress === 'function') {
                await window.api.saveProgress(userId, progressData.key, progressData);
              } else if (window.api && typeof window.api.rpc === 'function') {
                await window.api.rpc(`user-progress/${userId}`, 'PATCH', progressData);
              } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
                await fetch(`/api/user-progress/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(progressData) });
              } else {
                console.warn('Skipping network user-progress PATCH: running under file:// with no IPC bridge');
              }
            }
          } catch (e) {
            console.warn('Failed to save progress', e && e.message);
          }
        }
      } catch (err) {
        console.error("❌ Failed to record test completion:", err);
      }
    }
    
    document.getElementById("finalStats").textContent = finalMessage;
  }

  function resetCard() {
    loadCard();
  }

  function skipCard() {
    nextCard();
  }

  function restart() {
    startSession();
  }

  startBtn.addEventListener("click", startSession);

// Function to shuffle the order of cards (not answer options)
function shuffleCards(cardsArray) {
  const shuffled = [...cardsArray]; // Create a copy to avoid mutating original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Function to shuffle answer options within a card
function shuffleAnswerOptions(arr) {
  const allOfTheAbove = arr.find(opt => opt.trim().toLowerCase() === "all of the above");
  const others = arr.filter(opt => opt.trim().toLowerCase() !== "all of the above");

  const shuffled = others
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

  if (allOfTheAbove) {
    shuffled.push(allOfTheAbove);
  }

  return shuffled;
}
 abortBtn.addEventListener("click", () => {
  console.info('abortBtn clicked', { userId: localStorage.getItem('userId') });
  // 🆕 Hide button immediately, then redirect
  abortBtn.classList.add("hidden");
  
  document.getElementById("filterWrapper").classList.remove("disabled");
  randomToggle.parentElement.style.display = "";
  // Restore header layout
  const collapsedBar = document.getElementById('collapsedBar');
  const headerBar = document.querySelector('.flashcards-header');
  if (collapsedBar) {
    // move abort button back into session controls container so the original layout is preserved
    const sessionRight = document.querySelector('.session-right');
    if (sessionRight) sessionRight.appendChild(abortBtn);
    collapsedBar.style.display = 'none';
    collapsedBar.setAttribute('aria-hidden', 'true');
  }
  if (headerBar) headerBar.classList.remove('collapsed');
  
  // Small delay to ensure clean transition
  setTimeout(() => {
    console.info('abortBtn redirect to flashcards.html');
    window.location.href = "flashcards.html";
  }, 50);
});
exitBtn.addEventListener("click", () => {
  // Show Shuffle toggle again
  randomToggle.parentElement.style.display = "";
  // Restore header layout
  const collapsedBar = document.getElementById('collapsedBar');
  const headerBar = document.querySelector('.flashcards-header');
  if (collapsedBar) {
    const sessionRight = document.querySelector('.session-right');
    if (sessionRight) sessionRight.appendChild(abortBtn);
    collapsedBar.style.display = 'none';
    collapsedBar.setAttribute('aria-hidden', 'true');
  }
  if (headerBar) headerBar.classList.remove('collapsed');
  try { console.info('exitBtn clicked -> navigating to flashcards.html', { userId: localStorage.getItem('userId') }); } catch (e) {}
  window.location.href = "flashcards.html";
});

// Also restore header when the end message (completion) is shown or when restarting
function restoreHeaderCompact() {
  const collapsedBar = document.getElementById('collapsedBar');
  const headerBar = document.querySelector('.flashcards-header');
  const sessionRight = document.querySelector('.session-right');
  try {
    // No-op if there's nothing to restore (makes this idempotent).
    const alreadyHidden = collapsedBar && (collapsedBar.style.display === 'none' || collapsedBar.getAttribute('aria-hidden') === 'true');
    const headerNotCollapsed = headerBar && !headerBar.classList.contains('collapsed');
    // If collapsedBar is already hidden AND header isn't collapsed, nothing to do.
    if (alreadyHidden && headerNotCollapsed) return;

    if (collapsedBar) {
      // Only append the abortBtn back if it's not already a child of sessionRight
      if (sessionRight && abortBtn && abortBtn.parentNode !== sessionRight) sessionRight.appendChild(abortBtn);
      collapsedBar.style.display = 'none';
      collapsedBar.setAttribute('aria-hidden', 'true');
    }
    if (headerBar) headerBar.classList.remove('collapsed');
  } catch (e) {
    // Defensive: don't throw from DOM restore helper
  }
}

// Hook into endMessage and restart flows if they exist in the file's logic
try {
  // When showing the end message, ensure header is restored
  const observer = new MutationObserver(() => {
    try {
      if (endMessage && !endMessage.classList.contains('hidden')) {
        restoreHeaderCompact();
        // We've done the restore; no need to keep observing the whole body.
        try { observer.disconnect(); } catch (e) {}
      }
    } catch (e) {
      // swallow errors from observer callback to avoid bubbling
    }
  });
  if (document.body) observer.observe(document.body, { attributes: true, childList: true, subtree: true });
} catch (e) {}

// Utility: capitalize first char for display
function capitalize(s) { if (!s) return s; return s.charAt(0).toUpperCase() + s.slice(1); }

  checkBtn.addEventListener("click", checkAnswer);
  nextBtn.addEventListener("click", nextCard);
  skipBtn.addEventListener("click", skipCard);
  resetBtn.addEventListener("click", resetCard);
  restartBtn.addEventListener("click", restart);

  flashcardBox.classList.add("hidden");
  cardMeta.classList.add("hidden");
  // DISABLED: Utility buttons temporarily disabled
  // cardUtils.classList.add("hidden");
  if (cardUtils) cardUtils.classList.add("hidden");
  endMessage.classList.add("hidden");

  // Dark mode is controlled on index and dashboard pages only; flashcards
  // inherits the current theme via `localStorage['darkMode']` and does not
  // manage the toggle UI here.
  
  // Small helper: attach a hover tooltip to a select element by creating an overlay div.
  function attachSelectTooltip(selectEl, text) {
    if (!selectEl) return;
    // Prevent double-wrapping the same select element which can create
    // nested wrappers and duplicate event listeners (causes odd click behavior).
    try {
      if (selectEl.dataset && selectEl.dataset.kemmeiTooltipAttached) return;
      if (selectEl.parentNode && selectEl.parentNode.classList && selectEl.parentNode.classList.contains('select-tooltip-wrapper')) {
        // mark as attached and bail
        selectEl.dataset.kemmeiTooltipAttached = '1';
        return;
      }
    } catch (e) {}
    // Create wrapper so we can position tooltip relative to the select
    const wrapper = document.createElement('div');
    wrapper.style.display = 'inline-block';
    wrapper.style.position = 'relative';
    wrapper.className = 'select-tooltip-wrapper';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    try { selectEl.dataset.kemmeiTooltipAttached = '1'; } catch (e) {}

    // Create tooltip element but attach to document.body to avoid parent clipping
    const tip = document.createElement('div');
  tip.className = 'select-tooltip';
    tip.textContent = text;
    tip.style.position = 'fixed';
    tip.style.background = 'rgba(0,0,0,0.9)';
    tip.style.color = '#fff';
    tip.style.padding = '8px 10px';
    tip.style.borderRadius = '6px';
    tip.style.boxSizing = 'border-box';
    tip.style.whiteSpace = 'normal';
    tip.style.fontSize = '12px';
    tip.style.maxWidth = 'min(90vw, 640px)';
    tip.style.overflowWrap = 'break-word';
    tip.style.wordBreak = 'break-word';
  // Keep tooltip non-interactive and low enough in z-order to avoid
  // accidentally overlaying interactive controls.
  tip.style.zIndex = 100;
  tip.setAttribute('aria-hidden', 'true');
  // Start with pointer events disabled so an invisible tooltip never
  // blocks clicks on the underlying control. We'll enable pointer
  // events only while the tooltip is visible on hover.
  tip.style.pointerEvents = 'none';
    tip.style.opacity = 0;
    tip.style.transition = 'opacity 120ms ease, transform 120ms ease';
    tip.style.maxHeight = '70vh';
    tip.style.overflowY = 'auto';
    document.body.appendChild(tip);

    // On hover, show tooltip and compute a fixed position so it never gets clipped
    wrapper.addEventListener('mouseenter', () => {
      // Tooltips are non-interactive; keep pointer-events disabled so they
      // never intercept clicks on the underlying control. Just show visually.
      tip.style.opacity = 1;
      tip.style.transform = 'translateY(0)';

      requestAnimationFrame(() => {
        const wrapRect = wrapper.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        const PAD = 8;

        // Prefer placing above the control unless there's not enough space
        const spaceAbove = wrapRect.top;
        const spaceBelow = window.innerHeight - wrapRect.bottom;
        let top;
        if (spaceAbove > tipRect.height + 12 || spaceAbove > spaceBelow) {
          // place above
          top = wrapRect.top - tipRect.height - 8;
        } else {
          // place below
          top = wrapRect.bottom + 8;
        }

        // Compute left so tooltip is centered on the control
        let left = Math.round(wrapRect.left + (wrapRect.width - tipRect.width) / 2);

        // Clamp to viewport with padding
        left = Math.max(PAD, Math.min(left, window.innerWidth - PAD - tipRect.width));

        // Apply final coordinates
        tip.style.left = `${left}px`;
        tip.style.top = `${Math.max(PAD, top)}px`;
      });
    });

    wrapper.addEventListener('mouseleave', () => {
      // Hide tooltip visually; pointer-events remains none.
      tip.style.opacity = 0;
    });
  }

  // Attach hover tooltips: one for Mode (shorter wording) and one for Difficulty (unlock instructions).
  attachSelectTooltip(document.getElementById('mode-select'), 'Casual: train at any time, scores are not recorded. Test: challenge yourself with a subdomain or domain (or even title) level test, with best result recorded.');
  attachSelectTooltip(document.getElementById('difficulty-select'), 'You can unlock next level for this section by completing decks in Test mode with over 90% correct answers (next difficulty for domain requires a successful domain level test or all subdomains completed separately), or manually from the progress page.');
document.getElementById("mode-select").addEventListener("change", async (event) => {
  // Prevent event bubbling that might trigger other dropdowns
  event.stopPropagation();
  
  // Prevent overlapping mode change operations
  if (isUpdatingMode) {
    return;
  }
  
  isUpdatingMode = true;
  
  try {
    currentMode = document.getElementById("mode-select").value;
    isTestMode = currentMode === 'test';
    
  dbg("🔍 Mode changed to:", currentMode, "isTestMode:", isTestMode);
    
    // Update visual indicators for current mode immediately
    updateModeIndicators();
    
    saveLastSelection();
    
    // Reset the mode updating flag immediately after UI updates
    isUpdatingMode = false;
    
    // Use setTimeout instead of requestAnimationFrame for truly async execution
    setTimeout(async () => {
      try {
        await fetchCardsAndUpdateCount();
      } catch (err) {
        console.error("Error updating cards after mode change:", err);
      }
    }, 0);
  } catch (err) {
    console.error("Error in mode change handler:", err);
    isUpdatingMode = false; // Reset flag on error
  }
});

// Function to update visual mode indicators
function updateModeIndicators() {
  const cardCountDisplay = document.getElementById("cardCountDisplay");
  const startBtn = document.getElementById("startSessionBtn");
  
  if (isTestMode) {
    // Test mode: Show test indicator emoji
    if (cardCountDisplay && cardCountDisplay.textContent.includes("Cards:")) {
      const cardText = cardCountDisplay.textContent;
      if (!cardText.includes("🎯")) {
        cardCountDisplay.innerHTML = `${cardText} <span style="color: #f39c12; font-weight: bold;">🎯</span>`;
      }
    }
    
    // Update start button styling
    if (startBtn) {
      startBtn.textContent = "Start";
      startBtn.style.backgroundColor = "#e74c3c"; // Red for test mode
    }
  } else {
    // Casual mode: Show casual indicator emoji  
    if (cardCountDisplay && cardCountDisplay.textContent.includes("🎯")) {
      const cardText = cardCountDisplay.textContent.replace(/\s*🎯.*$/, '');
      cardCountDisplay.innerHTML = `${cardText} <span style="color: #27ae60; font-weight: bold;">📚</span>`;
    } else if (cardCountDisplay && !cardCountDisplay.textContent.includes("📚")) {
      const cardText = cardCountDisplay.textContent;
      cardCountDisplay.innerHTML = `${cardText} <span style="color: #27ae60; font-weight: bold;">📚</span>`;
    }
    
    // Update start button styling
    if (startBtn) {
      startBtn.textContent = "Start";
      startBtn.style.backgroundColor = "#3498db"; // Blue for casual mode
    }
  }
}

  // For non-test (Casual) sessions, determine a robust "finished" state
  try {
    if (!isTestMode) {
      const cert = document.getElementById("deck-select").value.trim();
      const domain = document.getElementById("domain-select").value.trim().split(" ")[0];
      const sub = document.getElementById("subdomain-select")?.value.trim();

      const deckCount = Array.isArray(questions) ? questions.length : 0;
      const seenCount = sessionSeenCardIds ? sessionSeenCardIds.size : 0;
      const correctCountLocal = sessionCorrectCardIds ? sessionCorrectCardIds.size : 0;

      // Require a minimum fraction of the deck to have been seen to avoid false-positives
      const minSeenThreshold = Math.max(Math.ceil(deckCount * 0.5), 3);

      let finished = false;
      let finishedSource = null;

      if (deckCount > 0) {
        // Mark finished if user actually viewed every card, OR
        // if they saw a reasonable portion and achieved high accuracy
        if (seenCount >= deckCount) {
          finished = true;
          finishedSource = 'all-seen';
        } else {
          const correctRatio = correctCountLocal / deckCount;
          if (seenCount >= minSeenThreshold && correctRatio >= 0.8) {
            finished = true;
            finishedSource = 'accuracy';
          }
        }
      }

      if (finished) {
        const progressKey = `${cert}:${domain}:${sub}`.replace(/\./g, '~');
        const progressData = { key: progressKey, finished: true, finishedAt: new Date().toISOString(), finishedSource, total: deckCount, correct: correctCountLocal };
        try {
          if (sessionSeenCardIds && sessionSeenCardIds.size) progressData.cardIds = Array.from(sessionSeenCardIds);
          if (sessionCorrectCardIds && sessionCorrectCardIds.size) progressData.correctCardIds = Array.from(sessionCorrectCardIds);
        } catch (e) {}

        // Persist the finished flag using available APIs
        try {
          const userId = localStorage.getItem('userId');
          if (window.api && typeof window.api.saveProgress === 'function') {
            window.api.saveProgress(userId, progressData.key, progressData).catch(e => console.warn('Failed to persist finished state', e && e.message));
          } else if (window.api && typeof window.api.rpc === 'function') {
            window.api.rpc(`user-progress/${userId}`, 'PATCH', progressData).catch(e => console.warn('Failed to persist finished state', e && e.message));
          } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
            fetch(`/api/user-progress/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(progressData) }).catch(e => console.warn('Failed to persist finished state', e && e.message));
          }
        } catch (e) {
          console.warn('Failed to persist finished state', e && e.message);
        }

        try { window.dispatchEvent(new CustomEvent('kemmei:progressSaved', { detail: { key: progressData.key, finished: true } })); } catch(e){}
      }
    }
  } catch (e) {}
});
