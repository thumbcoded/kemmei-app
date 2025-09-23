document.addEventListener("DOMContentLoaded", () => {
// Toggle this to true to enable developer debug logs in the flashcards UI
const DEBUG = false;
function dbg(...args) { if (DEBUG) console.log(...args); }

let domainMaps = {};
let subdomainMaps = {};
let certNames = {};
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

// Hide floating toggle when it would overlap header controls.
function setupToggleOverlapWatcher() {
  const toggle = document.querySelector('.floating-dark-toggle');
  const header = document.querySelector('.flashcards-header');
  if (!toggle || !header) return;

  function checkOverlap() {
    const t = toggle.getBoundingClientRect();
    const h = header.getBoundingClientRect();

    // Hide only when the header's right edge is within the toggle width + buffer
    // of the viewport right edge. This prevents accidental hiding at wide sizes.
    const toggleWidth = Math.max(t.width || 56, 56);
    const buffer = 12; // pixels of breathing room
    const shouldHide = (h.right > (window.innerWidth - (toggleWidth + buffer)));

    // Animate fade then remove from layout (display:none) to guarantee no
    // residual reserved space can cause horizontal scrollbars.
    if (shouldHide) {
      if (!toggle.classList.contains('hidden-by-overlap')) {
        // start fade
        toggle.classList.add('hidden-by-overlap');

        // after transition, remove from layout to avoid any subtle reserved space
        const cleanup = () => {
          try { toggle.style.display = 'none'; } catch (e) {}
          toggle.removeEventListener('transitionend', cleanup);
        };
        toggle.addEventListener('transitionend', cleanup);

        // fallback in case transitionend doesn't fire
        setTimeout(() => { if (toggle.style.display !== 'none') toggle.style.display = 'none'; }, 350);
      }
    } else {
      // ensure it's part of layout before removing the hidden class so the
      // reveal transition runs. If it was display:none, reset it first.
      if (toggle.style.display === 'none') {
        toggle.style.display = '';
        // force a reflow so the transition will run when we remove the class
        // (read a layout property)
        // eslint-disable-next-line no-unused-expressions
        toggle.offsetWidth;
      }
      toggle.classList.remove('hidden-by-overlap');
    }
  }

  // Run on resize and on DOM mutations that may change layout
  window.addEventListener('resize', checkOverlap);
  const ro = new MutationObserver(checkOverlap);
  ro.observe(header, { attributes: true, childList: true, subtree: true });

  // initial check
  setTimeout(checkOverlap, 120);
}

// initialize overlap watcher now that we're inside the main DOMContentLoaded handler
setTimeout(setupToggleOverlapWatcher, 300);

async function loadDomainMap() {
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
        return data;
      }
    } catch (err2) {
      console.error('failed to load bundled domainmap.json', err2 && err2.message);
    }
    return { certNames: {}, domainMaps: {}, subdomainMaps: {} };
  }
}

function populateDeckDropdown(certNames, selectedId = null) {
  const deckSelect = document.getElementById("deck-select");
  deckSelect.innerHTML = ""; // Clear old static options

  Object.entries(certNames).forEach(([id, title]) => {
    const opt = new Option(title, id);
    deckSelect.appendChild(opt);
  });

  // If we have a stored deck, use that — otherwise pick first
  if (selectedId && certNames[selectedId]) {
    deckSelect.value = selectedId;
  } else {
    deckSelect.selectedIndex = 0;
  }

  // Don't trigger change event here - let initialization handle it
}

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
          localStorage.removeItem('lastDeck');
          localStorage.removeItem('lastDomain');
          localStorage.removeItem('lastSub');
          localStorage.removeItem('lastDifficulty');
          localStorage.removeItem('lastMode');
          // Also remove any per-user keys for this user to ensure a fresh start
          localStorage.removeItem(`user:${currentUserId}:lastDeck`);
          localStorage.removeItem(`user:${currentUserId}:lastDomain`);
          localStorage.removeItem(`user:${currentUserId}:lastSub`);
          localStorage.removeItem(`user:${currentUserId}:lastDifficulty`);
          localStorage.removeItem(`user:${currentUserId}:lastMode`);
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

  // One-time fresh-start: if backend reports a fresh start was performed,
  // clear any renderer-local saved selections (both legacy global and per-user)
  // and apply the requested defaults.
  if (window.api && typeof window.api.ensureFreshStart === 'function') {
    try {
      const res = await window.api.ensureFreshStart()
      if (res && res.cleared) {
        // Clear saved users and selections in renderer storage
        try {
          // remove global legacy keys
          localStorage.removeItem('userId')
          localStorage.removeItem('lastDeck')
          localStorage.removeItem('lastDomain')
          localStorage.removeItem('lastSub')
          localStorage.removeItem('lastDifficulty')
          localStorage.removeItem('lastMode')
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
  const savedMode = currentUserId ? (localStorage.getItem(`user:${currentUserId}:lastMode`) || null) : null;

  // ✅ Populate deck dropdown without triggering events
  // Use the certNames exposed by loadDomainMap; if empty, show a friendly placeholder
  const hasTitles = data && Object.keys(data.certNames || {}).length;
  if (hasTitles) {
    populateDeckDropdown(data.certNames, savedDeck);
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

function saveLastSelection() {
  // Save per-user when possible to avoid leaking selections across users.
  let userId = null;
  try { userId = localStorage.getItem('userId'); } catch (e) {}
  if (!userId && window.userApi && typeof window.userApi.getCurrentUserId === 'function') {
    try { userId = window.userApi.getCurrentUserId(); } catch (e) {}
  }

  const deckVal = document.getElementById("deck-select").value;
  const domainVal = document.getElementById("domain-select").value;
  const subVal = document.getElementById("subdomain-select").value;
  const diffVal = document.getElementById("difficulty-select").value;
  const modeVal = document.getElementById("mode-select").value;

  try {
    if (userId) {
      localStorage.setItem(`user:${userId}:lastDeck`, deckVal);
      localStorage.setItem(`user:${userId}:lastDomain`, domainVal);
      localStorage.setItem(`user:${userId}:lastSub`, subVal);
      localStorage.setItem(`user:${userId}:lastDifficulty`, diffVal);
      localStorage.setItem(`user:${userId}:lastMode`, modeVal);
    } else {
      // Fallback for legacy behavior when no user is available
      localStorage.setItem("lastDeck", deckVal);
      localStorage.setItem("lastDomain", domainVal);
      localStorage.setItem("lastSub", subVal);
      localStorage.setItem("lastDifficulty", diffVal);
      localStorage.setItem("lastMode", modeVal);
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
  document.getElementById("deck-select").dispatchEvent(new Event("change"));

  setTimeout(() => {
    if (domain) document.getElementById("domain-select").value = domain;
    document.getElementById("domain-select").dispatchEvent(new Event("change"));

    setTimeout(() => {
      if (sub) document.getElementById("subdomain-select").value = sub;
      document.getElementById("subdomain-select").dispatchEvent(new Event("change"));

      if (difficulty) document.getElementById("difficulty-select").value = difficulty;
      document.getElementById("difficulty-select").dispatchEvent(new Event("change"));
    }, 150);
  }, 150);
}

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
          userData = await window.api.getUserProgress(userId) || {};
        }
      } catch (e) {
        console.warn('ipc getUserProgress failed', e && e.message);
      }

      try {
        if (typeof window.api.getTestCompletions === 'function') {
          testCompletions = await window.api.getTestCompletions(userId) || {};
        }
      } catch (e) {
        console.warn('ipc getTestCompletions failed', e && e.message);
      }

      try {
        if (typeof window.api.getUserUnlocks === 'function') {
          unlocks = await window.api.getUserUnlocks(userId) || {};
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
      
      mediumUnlocked = testCompletions[mediumKey]?.unlocked || false;
      hardUnlocked = testCompletions[hardKey]?.unlocked || false;
    } else {
      // Casual mode: use the new unlock preference system
      const certKey = cert.replace(/\./g, '_');
      const currentDomain = domain === "All" ? null : domain.split(" ")[0];
      
      if (currentDomain) {
        // Check domain-specific unlocks first
        const domainKey = currentDomain.replace(/\./g, '_');
        mediumUnlocked = unlocks[`${certKey}:${domainKey}:medium`] || false;
        hardUnlocked = unlocks[`${certKey}:${domainKey}:hard`] || false;
        
        // If domain-specific unlocks aren't set, fall back to title-level unlocks
        if (!mediumUnlocked) {
          mediumUnlocked = unlocks[`${certKey}:medium`] || false;
        }
        if (!hardUnlocked) {
          hardUnlocked = unlocks[`${certKey}:hard`] || false;
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

  // Handle difficulty filtering based on normalized decision
  if (!useUnlockedSet && requestedDifficulty && requestedDifficulty !== 'All') {
    // Single difficulty - make one API call
    const query = new URLSearchParams(baseQuery);
    query.append("difficulty", requestedDifficulty.toLowerCase());
    
    const url = `/api/cards?${query.toString()}`;
    // Prefer IPC getCards when available (Electron) to avoid file:// errors
    let data = [];
    if (window.api && typeof window.api.getCards === 'function') {
      try {
        const params = Object.fromEntries(query.entries());
        data = await window.api.getCards(params);
        fetchDebug.source = 'ipc';
        fetchDebug.query = params;
      } catch (e) {
        console.warn('ipc getCards failed, falling back to fetch', e && e.message);
      }
    }
    if ((!data || !data.length)) {
      // Only attempt a network fetch if not running under file:// to avoid file:///api/... errors
      if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
        try {
          const r = await fetch(url);
          if (r && r.ok) data = await r.json();
          else console.warn('fetch returned non-ok for', url, r && r.status);
        } catch (err) {
          console.warn('fetch failed for', url, err && err.message);
        }
      } else {
        console.warn('Skipping network fetch for cards under file://; no IPC available');
      }
    }
    allCards = data || [];
    fetchDebug.counts.single = allCards.length;
  } else if (useUnlockedSet) {
    // Multiple difficulties - use the computedUnlocked set (unlocked difficulties)
    const unlocked = computedUnlocked || await getUnlockedDifficulties();
    
    // Make parallel API calls for each unlocked difficulty
    const promises = unlocked.map(async (diff) => {
      const query = new URLSearchParams(baseQuery);
      query.append("difficulty", diff);
      // Prefer ipc.getCards
      if (window.api && typeof window.api.getCards === 'function') {
        try {
          const params = Object.fromEntries(query.entries());
          return await window.api.getCards(params);
        } catch (e) {
          console.warn('ipc getCards failed for diff', diff, e && e.message);
        }
      }
      // fallback to network
      const url = `/api/cards?${query.toString()}`;
      if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
        try {
          const r = await fetch(url);
          if (r && r.ok) return await r.json();
          console.warn('fetch returned non-ok for', url, r && r.status);
        } catch (err) {
          console.warn('fetch failed for', url, err && err.message);
        }
      } else {
        console.warn('Skipping network fetch for cards under file://; no IPC available');
      }
      return [];
    });
    
    const results = await Promise.all(promises);
    // Combine all results into a single array and remove duplicates
    const combinedCards = results.flat();
    const uniqueCards = combinedCards.filter((card, index, self) => 
      index === self.findIndex(c => (c._id || c.id) === (card._id || card.id))
    );
    allCards = uniqueCards || [];
    fetchDebug.source = fetchDebug.source || 'multi';
    try { fetchDebug.query = { cert: deck, domain: domain && domain.split(' ')[0] || null, sub: subdomain, unlocked: unlocked }; } catch (e) {}
    fetchDebug.counts.multi = results.map(r => (r && r.length) || 0);
  } else {
    // Fallback: treat as Easy (should not reach here due to normalization)
    const query = new URLSearchParams(baseQuery);
    query.append('difficulty', 'easy');
    const url = `/api/cards?${query.toString()}`;
    if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
      try {
        const res = await fetch(url);
        if (res && res.ok) allCards = await res.json();
      } catch (e) {
        console.warn('fetch failed for all-cards fallback', e && e.message);
      }
    } else {
      console.warn('Skipping network fetch for all cards under file:// (fallback)');
    }
  }
  // Fallback: only probe the local data directory when running under file://
  // or when no IPC bridge is present. Previously this condition used
  // `protocol !== 'http:'` which incorrectly triggered in https and other
  // contexts. Limit probing to file:// or when `window.api` is missing.
  if ((!allCards || allCards.length === 0) && (document.location.protocol === 'file:' || !window.api)) {
    try {
      const cert = document.getElementById("deck-select").value.trim();
      const domainVal = document.getElementById("domain-select").value.trim();
      const domainId = domainVal && domainVal !== 'All' ? domainVal.split(' ')[0] : null;
      const subVal = document.getElementById("subdomain-select")?.value.trim();
      let foldersToProbe = [];

      if (subVal && subVal !== 'All' && domainId) {
        foldersToProbe.push({ domain: domainId, sub: subVal });
      } else if (domainId) {
        // probe every subdomain under this domain for the cert using loaded maps
        const subs = subdomainMaps[cert]?.[domainId] ? Object.keys(subdomainMaps[cert][domainId]) : [];
        subs.forEach(s => foldersToProbe.push({ domain: domainId, sub: s }));
      } else if (cert) {
        // probe every domain/subdomain for this cert
        const domains = domainMaps[cert] ? Object.keys(domainMaps[cert]) : [];
        domains.forEach(d => {
          const subs = subdomainMaps[cert]?.[d] ? Object.keys(subdomainMaps[cert][d]) : [];
          subs.forEach(s => foldersToProbe.push({ domain: d, sub: s }));
        });
      }

      const localCards = [];

      // Helper to probe a folder for sequentially numbered files
      async function probeFolder(certId, domainId, subId) {
        const consecutiveMissLimit = 8; // stop after several misses
        let misses = 0;
        // Try up to 500 file numbers as an upper bound
        for (let i = 1; i <= 500; i++) {
          const num = String(i).padStart(3, '0');
          const path = `data/cards/${certId}/${domainId}/${subId}/Q-${certId}-${domainId}-${subId}-${num}.json`;
          try {
            const r = await fetch(path);
            if (r && r.ok) {
              const c = await r.json();
              localCards.push(c);
              misses = 0; // reset misses on success
            } else {
              misses++;
            }
          } catch (e) {
            misses++;
          }
          if (misses >= consecutiveMissLimit) break;
        }
      }

      // Run probes sequentially to avoid too many concurrent fetches from file://
      for (const f of foldersToProbe) {
        // respect selected difficulty filter
        await probeFolder(cert, f.domain, f.sub);
      }

      // If we found local cards, filter by difficulty (if specified).
      // Important: when `difficulty === 'All'` we should still restrict to
      // only the unlocked difficulties for the current user (fresh users
      // should only have Easy unlocked). Previously this branch treated
      // 'All' as "no filter" and returned cards of all difficulties.
      if (localCards.length) {
        let desiredLevels = null;
        if (difficulty && difficulty !== 'All') {
          desiredLevels = [difficulty.toLowerCase()];
        } else {
          // respect unlocked difficulties if provided, otherwise query for them
          const unlocked = unlockedDifficulties || await getUnlockedDifficulties();
          desiredLevels = (unlocked || ['easy']).map(d => d.toLowerCase());
        }

        if (desiredLevels && desiredLevels.length) {
          allCards = localCards.filter(c => desiredLevels.includes(((c.difficulty || '')).toLowerCase()));
        } else {
          allCards = localCards;
        }

        fetchDebug.source = 'probe';
        fetchDebug.counts.probeRaw = localCards.length;
        fetchDebug.counts.probeFiltered = (allCards || []).length;
        fetchDebug.query = { cert, domain: domainId, sub: subVal, difficultyLevels: desiredLevels };
      }
    } catch (e) {
      // ignore fallback errors
      console.warn('local data/cards fallback failed', e && e.message);
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
  const certLabel = document.getElementById("deck-select").value;
  const certId = certLabel;

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

  saveLastSelection();
  fetchCardsAndUpdateCount();
});


  async function fetchCardsAndUpdateCount() {
    // Prevent overlapping card fetch operations
    if (isUpdatingCards) {
      return;
    }
    
    isUpdatingCards = true;
    
    try {
      // Get unlocked difficulties once and pass to both functions
      const unlockedDifficulties = await getUnlockedDifficulties();
      
      await fetchCards(unlockedDifficulties);
      updateCardCount();

        // debug overlay update removed
      
      // Update difficulty dropdown based on unlock status, passing the already-fetched data
      await updateDifficultyDropdown(unlockedDifficulties);
    } catch (err) {
      console.error("Error in fetchCardsAndUpdateCount:", err);
    } finally {
      isUpdatingCards = false;
    }
  }

  async function updateDifficultyDropdown(unlockedDifficulties = null) {
    // Set flag to prevent difficulty change events during rebuild
    isRebuildingDifficulty = true;
    
    // Fetch user progress and test completions to update difficulty dropdown
    const userId = localStorage.getItem("userId");
    const difficultySelect = document.getElementById("difficulty-select");
    
    if (!userId) {
      // Show Easy + locked Medium/Hard when no user is logged in so the UI matches expectations
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
      // Use pre-fetched data if available, otherwise fetch it
      const unlocked = unlockedDifficulties || await getUnlockedDifficulties();
      
      const currentDifficulty = difficultySelect.value; // Store current selection before clearing
      difficultySelect.innerHTML = ""; // Clear existing options
      
      // Determine unlock status from the array
      const mediumUnlocked = unlocked.includes("medium");
      const hardUnlocked = unlocked.includes("hard");
      
      // Add "Easy" option
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);

      // Add "Medium" option (locked if not unlocked in test mode)
      const mediumOption = document.createElement("option");
      mediumOption.value = "Medium";
      mediumOption.textContent = mediumUnlocked ? "Medium" : "🔒 Medium";
      mediumOption.disabled = !mediumUnlocked;
      difficultySelect.appendChild(mediumOption);

      // Add "Hard" option (locked if not unlocked in test mode)
      const hardOption = document.createElement("option");
      hardOption.value = "Hard";
      hardOption.textContent = hardUnlocked ? "Hard" : "🔒 Hard";
      hardOption.disabled = !hardUnlocked;
      difficultySelect.appendChild(hardOption);

      // Add "All" option only if more than one level is unlocked
      if (mediumUnlocked || hardUnlocked) {
        const allOption = document.createElement("option");
        allOption.value = "All";
        allOption.textContent = "All";
        difficultySelect.appendChild(allOption);
      }

      // Restore the previously selected difficulty if it's still available and unlocked
      if (currentDifficulty) {
        const optionExists = Array.from(difficultySelect.options).some(opt => opt.value === currentDifficulty && !opt.disabled);
        if (optionExists) {
          difficultySelect.value = currentDifficulty;
        } else {
          // If the previously selected difficulty is no longer available, default to Easy
          difficultySelect.value = "Easy";
        }
      } else {
        // If no previous selection, default to Easy
        difficultySelect.value = "Easy";
      }
      
    } catch (err) {
      console.error("❌ Failed to fetch user progress:", err);
      
      // Fallback: show only Easy difficulty for both modes when there's an error
      const currentDifficulty = difficultySelect.value; // Store current selection before clearing
      difficultySelect.innerHTML = "";
      
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);
      
      // In error state, lock Medium and Hard regardless of mode
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

      // In error state, only Easy is available, so default to Easy
      difficultySelect.value = "Easy";
    } finally {
      // Always reset the flag, even if there was an error
      isRebuildingDifficulty = false;
        // Ensure tooltip attributes are present on the difficulty control
        try {
          const modeSelect = document.getElementById('mode-select');
          if (modeSelect) {
            modeSelect.setAttribute('title', 'Mode: Casual shows learning decks; Test runs a scored test to unlock next levels');
            modeSelect.classList.add('has-tooltip');
          }

          const diffSelect = document.getElementById('difficulty-select');
          if (diffSelect) {
            diffSelect.setAttribute('title', 'Difficulty: choose the level to study; locked levels show a 🔒 and are disabled');
            diffSelect.classList.add('has-tooltip');
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
      startBtn.disabled = false;
      randomToggle.disabled = true;
      randomToggle.checked = false;
    } else {
      startBtn.disabled = false;
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
  window.location.href = "flashcards.html";
});

// Also restore header when the end message (completion) is shown or when restarting
function restoreHeaderCompact() {
  const collapsedBar = document.getElementById('collapsedBar');
  const headerBar = document.querySelector('.flashcards-header');
  const sessionRight = document.querySelector('.session-right');
  if (collapsedBar) {
    if (sessionRight) sessionRight.appendChild(abortBtn);
    collapsedBar.style.display = 'none';
    collapsedBar.setAttribute('aria-hidden', 'true');
  }
  if (headerBar) headerBar.classList.remove('collapsed');
}

// Hook into endMessage and restart flows if they exist in the file's logic
try {
  // When showing the end message, ensure header is restored
  const observer = new MutationObserver(() => {
    if (endMessage && !endMessage.classList.contains('hidden')) {
      restoreHeaderCompact();
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

  // Dark Mode Toggle Functionality
  const darkModeToggle = document.getElementById("darkModeToggle");

  // Load saved dark mode preference
  const savedDarkMode = localStorage.getItem("darkMode") === "true";
  if (savedDarkMode) {
    document.body.classList.add("dark-theme");
    darkModeToggle.checked = true;
  }

  // Toggle dark mode
  darkModeToggle.addEventListener("change", () => {
    const isDark = darkModeToggle.checked;
    document.body.classList.toggle("dark-theme", isDark);
    localStorage.setItem("darkMode", isDark);
  });
  
  // Small helper: attach a hover tooltip to a select element by creating an overlay div.
  function attachSelectTooltip(selectEl, text) {
    if (!selectEl) return;
    // Create wrapper so we can position tooltip relative to the select
    const wrapper = document.createElement('div');
    wrapper.style.display = 'inline-block';
    wrapper.style.position = 'relative';
    wrapper.className = 'select-tooltip-wrapper';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

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
    tip.style.zIndex = 99999;
    tip.style.pointerEvents = 'auto';
    tip.style.opacity = 0;
    tip.style.transition = 'opacity 120ms ease, transform 120ms ease';
    tip.style.maxHeight = '70vh';
    tip.style.overflowY = 'auto';
    document.body.appendChild(tip);

    // On hover, show tooltip and compute a fixed position so it never gets clipped
    wrapper.addEventListener('mouseenter', () => {
      // Make visible to measure
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
      tip.style.opacity = 0;
    });
  }

  // Attach hover tooltips to Mode and Difficulty selects (user-requested wording)
  attachSelectTooltip(document.getElementById('mode-select'), 'Run through selected filters freely at any time. Scores are not recorded.');
  attachSelectTooltip(document.getElementById('difficulty-select'), 'Title/domain/subdomain testing with 90% passing requirement to unlock next difficulty.');
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
