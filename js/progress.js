document.addEventListener("DOMContentLoaded", () => {
  const statsDiv = document.getElementById("progressStats");
  const resetBtn = document.getElementById("resetProgress");

  // Listen for test saves from other pages (flashcards) and refresh
  window.addEventListener('kemmei:testSaved', (ev) => {
    console.log('Received kemmei:testSaved event, refreshing progress view');
    refreshProgress();
  });

  // Kick off initial load
  refreshProgress();
  // refreshProgress is defined below and performs the operations including user resolution
  async function refreshProgress() {
    // Resolve userId: localStorage -> preload helper getCurrentUserId -> getCurrentUser()
    let userIdLocal = localStorage.getItem("userId");
    if (!userIdLocal && window.userApi) {
      try {
        if (typeof window.userApi.getCurrentUserId === 'function') {
          const cur = await window.userApi.getCurrentUserId();
          if (cur) userIdLocal = cur;
        }
        if (!userIdLocal && typeof window.userApi.getCurrentUser === 'function') {
          const cu = await window.userApi.getCurrentUser();
          if (cu && cu.id) userIdLocal = cu.id;
        }
      } catch (e) {
        console.warn('Could not resolve current user via preload API', e && e.message);
      }
    }

    // Load and render progress; always fetch domainMap so we can render all titles
    try {
      let domainMap = { certNames: {}, domainMaps: {}, subdomainMaps: {} };
      let domainErrMsg = null;
      try {
        if (window.api && typeof window.api.rpc === 'function') {
          const rpcRes = await window.api.rpc('domainmap', 'GET');
          if (rpcRes && rpcRes.status >= 200 && rpcRes.status < 300) domainMap = rpcRes.body;
          else {
            domainErrMsg = `RPC ${rpcRes && rpcRes.status}`;
            console.warn('domainmap rpc returned non-ok', rpcRes && rpcRes.status);
          }
        } else if (window.api && typeof window.api.getDomainMap === 'function') {
          const dm = await window.api.getDomainMap();
          domainMap = dm || domainMap;
        } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
          const domainRes = await fetch('/api/domainmap');
          if (domainRes && domainRes.ok) domainMap = await domainRes.json();
          else {
            console.warn('domainmap fetch returned non-ok', domainRes && domainRes.status);
            domainErrMsg = `HTTP ${domainRes && domainRes.status}`;
          }
        } else {
          // last resort: attempt bundled file (works under file://)
          try {
            const res2 = await fetch('data/domainmap.json');
            if (res2 && res2.ok) domainMap = await res2.json();
          } catch (e) {
            console.warn('bundled domainmap failed', e && e.message);
          }
        }
      } catch (e) {
        domainErrMsg = e && e.message ? e.message : String(e);
        console.warn('domainmap fetch failed', domainErrMsg);
      }

      let progress = {};
      let unlocks = {};
      let testCompletions = {};

      if (userIdLocal) {
        try {
          if (window.api && typeof window.api.getUserProgress === 'function') {
            const res = await window.api.getUserProgress(userIdLocal);
            if (res && res.status >= 200 && res.status < 300) progress = res.body;
            else if (res && res.body && typeof res.body === 'object') progress = res.body;
            else console.warn('user-progress rpc returned non-ok', res && res.status);
          } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
            const progressRes = await fetch(`/api/user-progress/${userIdLocal}`);
            if (progressRes && progressRes.ok) progress = await progressRes.json();
          }
        } catch (e) {
          console.warn('user-progress fetch failed', e && e.message);
        }

        try {
          if (window.api && typeof window.api.getUserUnlocks === 'function') {
            const res = await window.api.getUserUnlocks(userIdLocal);
            if (res && res.status >= 200 && res.status < 300) unlocks = res.body;
            else if (res && res.body && typeof res.body === 'object') unlocks = res.body;
            else console.warn('user-unlocks rpc returned non-ok', res && res.status);
          } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
            const unlocksRes = await fetch(`/api/user-unlocks/${userIdLocal}`);
            if (unlocksRes && unlocksRes.ok) unlocks = await unlocksRes.json();
          }
        } catch (e) {
          console.warn('user-unlocks fetch failed', e && e.message);
        }

        // Merge any localStorage mirror entries so UI reflects user's recent
        // force-unlocks without waiting for backend/IPC round-trip.
        try {
          const mirrorRaw = localStorage.getItem(`user:${userIdLocal}:unlocks`);
          if (mirrorRaw) {
            const mirrorObj = JSON.parse(mirrorRaw || '{}');
            unlocks = Object.assign({}, unlocks || {}, mirrorObj || {});
          }
        } catch (e) {}

        try {
          if (window.api && typeof window.api.getTestCompletions === 'function') {
            const res = await window.api.getTestCompletions(userIdLocal);
            if (res && res.status >= 200 && res.status < 300) testCompletions = res.body;
            else if (res && res.body && typeof res.body === 'object') testCompletions = res.body;
            else console.warn('test-completions rpc returned non-ok', res && res.status);
          } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
            const tcRes = await fetch(`/api/test-completions/${userIdLocal}`);
            if (tcRes && tcRes.ok) testCompletions = await tcRes.json();
          }
        } catch (e) {
          console.warn('test-completions fetch failed', e && e.message);
        }
      }

      try {
        renderProgressTree(progress, domainMap, unlocks, testCompletions, domainErrMsg);
      } catch (e) {
        console.error('Failed rendering progress tree', e && e.message);
        if (statsDiv) statsDiv.textContent = 'Error rendering progress: ' + (e && e.message ? e.message : 'unknown');
      }
    } catch (err) {
      console.error("❌ Failed to load user progress:", err);
      if (statsDiv) statsDiv.textContent = "Error loading progress: " + (err && err.message ? err.message : 'unknown');
    }
  }

  // Modal and reset logic
  const confirmModal = document.getElementById("confirmModal");
  const confirmYes = document.getElementById("confirmYes");
  const confirmNo = document.getElementById("confirmNo");

  if (resetBtn && confirmModal) {
    resetBtn.addEventListener("click", () => {
      confirmModal.classList.remove("hidden");
    });
  }
  if (confirmNo && confirmModal) {
    confirmNo.addEventListener("click", () => {
      confirmModal.classList.add("hidden");
    });
  }
  if (confirmYes && confirmModal) {
    confirmYes.addEventListener("click", async () => {
      confirmModal.classList.add("hidden");

      try {
  // Resolve current user id (same strategy as refreshProgress)
  let userId = localStorage.getItem("userId");
  if (!userId && window.userApi) {
    try {
      if (typeof window.userApi.getCurrentUserId === 'function') {
        const cur = await window.userApi.getCurrentUserId();
        if (cur) userId = cur;
      }
      if (!userId && typeof window.userApi.getCurrentUser === 'function') {
        const cu = await window.userApi.getCurrentUser();
        if (cu && cu.id) userId = cu.id;
      }
    } catch (e) {
      console.warn('Could not resolve current user via userApi in reset handler', e && e.message);
    }
  }

  if (!userId) {
    alert('No current user found; cannot clear progress.');
    return;
  }

  // Prefer IPC helper, otherwise only network-delete when not running under file://
  let res = null;
  if (window.api && typeof window.api.rpc === 'function') {
    try { res = await window.api.rpc(`user-progress/${userId}`, 'DELETE'); } catch (e) { console.warn('rpc delete user-progress failed', e && e.message); }
  } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
    try { res = await fetch(`/api/user-progress/${userId}`, { method: 'DELETE' }); } catch (e) { console.warn('network delete user-progress failed', e && e.message); }
  } else {
    console.warn('Skipping user-progress DELETE: running under file:// with no IPC bridge');
  }

        if (res && (res.ok || (res.status && res.status >= 200 && res.status < 300))) {
          showToast("✔️ Your progress has been cleared successfully.", 'success');
          setTimeout(() => {
            location.reload();
          }, 2000);
        } else {
          alert("❌ Failed to clear progress.");
        }
      } catch (err) {
        console.error("❌ Reset error:", err);
        alert("❌ Network error.");
      }
    });
  }
});

function showToast(message, type = 'success', duration = 3000) {
  // Multi-toast stack: create container on first use
  try {
    let container = document.getElementById('toast-stack');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-stack';
      // Inline styles so we don't need to modify CSS files
      container.style.position = 'fixed';
      container.style.right = '24px';
      container.style.bottom = '24px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column-reverse';
      container.style.gap = '10px';
      container.style.zIndex = '9999';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    // Create toast element
    const t = document.createElement('div');
    t.className = 'toast-item';
    t.style.pointerEvents = 'auto';
    t.style.minWidth = '220px';
    t.style.maxWidth = '420px';
    t.style.padding = '14px 18px';
    t.style.borderRadius = '8px';
    t.style.color = '#fff';
    t.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
    t.style.opacity = '0';
    t.style.transition = 'opacity 220ms ease, transform 220ms ease';
    t.style.transform = 'translateY(8px)';

    // color by type
    if (type === 'error') t.style.background = '#e24b4b';
    else if (type === 'warning') t.style.background = '#d6a21f';
    else t.style.background = '#22bdb0'; // success/neutral

    // content
    const icon = document.createElement('span');
    icon.style.marginRight = '8px';
    icon.textContent = type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : '🔒');
    const text = document.createElement('span');
    text.textContent = message;
    t.appendChild(icon);
    t.appendChild(text);

    // add to container
    container.appendChild(t);

    // enforce max toasts (keep most recent up to 5)
    while (container.children.length > 5) {
      const oldest = container.children[0];
      if (oldest) container.removeChild(oldest);
    }

    // show animation
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateY(0)';
    });

    // removal after duration
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(() => { try { if (t.parentNode) t.parentNode.removeChild(t); } catch (e) {} }, 240);
    }, typeof duration === 'number' ? duration : 3000);
  } catch (e) {
    // fallback to single toast element if something goes wrong
    const toast = document.getElementById("toast");
    if (toast) {
      toast.textContent = message;
      toast.classList.remove("hidden", "error", "success");
      toast.classList.add("show", type);
      const d = typeof duration === 'number' ? duration : 3000;
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
          toast.classList.add("hidden");
          toast.classList.remove("error", "success");
        }, 400);
      }, d);
    }
  }
}

// Mirror individual unlocks into a per-user localStorage cache so other
// renderer pages that read from storage (or the runtime cache) can reflect
// force-unlocks immediately without waiting for a backend round-trip.
function mirrorUnlockToLocal(userId, key, unlocked) {
  try {
    if (!userId || !key) return;
    const storageKey = `user:${userId}:unlocks`;
    let raw = localStorage.getItem(storageKey);
    let obj = {};
    try { obj = raw ? JSON.parse(raw) : {}; } catch (e) { obj = {}; }
    obj[key] = (typeof unlocked === 'object') ? unlocked : { unlocked: !!unlocked };
    localStorage.setItem(storageKey, JSON.stringify(obj));
    // Keep runtime mirror too
    try { window._currentProgressUnlocks = window._currentProgressUnlocks || {}; window._currentProgressUnlocks[key] = obj[key]; } catch (e) {}
  } catch (e) { /* ignore */ }
}

async function toggleUnlock(certId, domainId, level, btn) {
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  // Save expanded state before reload
  saveExpandedState();

  try {
    let res = null;
  // Build storage key: omit domain part when domainId is null/undefined so
  // stored keys match the shape used elsewhere (e.g. `certKey:medium` or `certKey:domainKey:medium`).
  const key = (domainId === null || typeof domainId === 'undefined') ? `${certId}:${level}` : `${certId}:${domainId}:${level}`;

    // Fetch current unlocks to determine toggle intention (unlock <-> lock)
    let currentUnlocks = {};
    try {
      if (window.api && typeof window.api.getUserUnlocks === 'function') {
        const r = await window.api.getUserUnlocks(userId);
        if (r && r.status >= 200 && r.status < 300) currentUnlocks = r.body || {};
        else if (r && typeof r === 'object') currentUnlocks = r;
      } else if (window.api && typeof window.api.rpc === 'function') {
        const r = await window.api.rpc(`user-unlocks/${userId}`, 'GET');
        if (r && r.status >= 200 && r.status < 300) currentUnlocks = r.body || {};
      } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
        try {
          const r = await fetch(`/api/user-unlocks/${userId}`);
          if (r && r.ok) currentUnlocks = await r.json();
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      console.warn('Failed to read current unlocks before toggling', e && e.message);
    }

    // If a button element was passed, use it to provide an optimistic UI update.
    let prevBtnState = null;
    if (btn && btn instanceof Element) {
      try {
        prevBtnState = { className: btn.className, innerHTML: btn.innerHTML };
        // Toggle UI immediately
        const isUnlockedNow = btn.classList.contains('unlocked');
        const willUnlock = !isUnlockedNow;
        btn.classList.toggle('unlocked', willUnlock);
        btn.classList.toggle('locked', !willUnlock);
        // Update icon text (keep label word: Medium/Hard)
        const label = (level && level[0].toUpperCase() + level.slice(1)) || '';
        btn.innerHTML = `${willUnlock ? '🔓' : '🔒'} ${label}`;
      } catch (e) { prevBtnState = null; }
    }

    // Stored unlock value may be boolean or object { unlocked: true }
    let currentlyUnlocked = false;
    if (currentUnlocks && Object.prototype.hasOwnProperty.call(currentUnlocks, key)) {
      const val = currentUnlocks[key];
      if (typeof val === 'boolean') currentlyUnlocked = !!val;
      else if (val && typeof val === 'object' && typeof val.unlocked !== 'undefined') currentlyUnlocked = !!val.unlocked;
      else currentlyUnlocked = !!val;
    }
    const desiredUnlocked = !currentlyUnlocked;
    const payload = { certId, domainId, level, unlocked: desiredUnlocked };

    // Helper to find the corresponding button element in the rendered tree
    function findButton(certIdLocal, domainIdLocal, levelLocal) {
      try {
        // Title-level
        const titleBlocks = document.querySelectorAll('.title-block');
        for (const block of titleBlocks) {
          const h3 = block.querySelector('h3');
          if (h3 && h3.textContent && h3.textContent.startsWith(certIdLocal)) {
            if (!domainIdLocal) {
              const btns = block.querySelectorAll('.unlock-buttons button');
              for (const b of btns) {
                if (b.textContent && b.textContent.toLowerCase().includes(levelLocal.toLowerCase())) return b;
              }
            } else {
              // find domain block
              const domains = block.querySelectorAll('.domain-block');
              for (const d of domains) {
                const h4 = d.querySelector('h4');
                if (h4 && h4.textContent && h4.textContent.includes(domainIdLocal)) {
                  const btns = d.querySelectorAll('.unlock-buttons button');
                  for (const b of btns) {
                    if (b.textContent && b.textContent.toLowerCase().includes(levelLocal.toLowerCase())) return b;
                  }
                }
              }
            }
          }
        }
      } catch (e) {}
      return null;
    }

    // Helper to find all child buttons (domains and subdomains) for a given cert/domain
    function findChildButtons(certIdLocal, domainIdLocal, levelLocal) {
      const out = [];
      try {
        const titleBlocks = document.querySelectorAll('.title-block');
        for (const block of titleBlocks) {
          const h3 = block.querySelector('h3');
          if (!h3 || !h3.textContent || !h3.textContent.startsWith(certIdLocal)) continue;
          // If domainIdLocal is null, collect all domain and subdomain matching buttons
          if (!domainIdLocal) {
            const domainBlocks = block.querySelectorAll('.domain-block');
            for (const db of domainBlocks) {
              const btns = db.querySelectorAll('.unlock-buttons button');
              btns.forEach(b => { if (b && b.textContent && b.textContent.toLowerCase().includes(levelLocal.toLowerCase())) out.push({ btn: b, domainBlock: db }); });
            }
            // Also include title-level children? skip title-level (caller already has title button)
          } else {
            // find matching domain block
            const domainBlocks = block.querySelectorAll('.domain-block');
            for (const db of domainBlocks) {
              const h4 = db.querySelector('h4');
              if (h4 && h4.textContent && h4.textContent.includes(domainIdLocal)) {
                const btns = db.querySelectorAll('.unlock-buttons button');
                btns.forEach(b => { if (b && b.textContent && b.textContent.toLowerCase().includes(levelLocal.toLowerCase())) out.push({ btn: b, domainBlock: db }); });
                // subdomains under this domain
                const subBtns = db.querySelectorAll('.subdomain-block .unlock-buttons button');
                subBtns.forEach(b => { if (b && b.textContent && b.textContent.toLowerCase().includes(levelLocal.toLowerCase())) out.push({ btn: b, domainBlock: db }); });
                break;
              }
            }
          }
        }
      } catch (e) {}
      return out;
    }

    // Helper to perform a save+mirror for a given key/payload and update UI element
    async function saveAndMirror(userIdLocal, keyLocal, payloadLocal, btnLocal) {
      try {
        // persist via available bridges
        if (window.api && typeof window.api.saveUserUnlock === 'function') {
          try { await window.api.saveUserUnlock(userIdLocal, keyLocal, payloadLocal); } catch (e) {}
        } else if (window.api && typeof window.api.rpc === 'function') {
          try { await window.api.rpc(`user-unlocks/${userIdLocal}/${encodeURIComponent(keyLocal)}`, 'POST', payloadLocal); } catch (e) {}
        } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
          try { await fetch(`/api/user-unlocks/${userIdLocal}/${encodeURIComponent(keyLocal)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadLocal) }); } catch (e) {}
        }
        // mirror locally and runtime cache
        try { mirrorUnlockToLocal(userIdLocal, keyLocal, payloadLocal); window._currentProgressUnlocks = window._currentProgressUnlocks || {}; window._currentProgressUnlocks[keyLocal] = { unlocked: !!payloadLocal.unlocked }; } catch (e) {}
        // update UI
        try { if (btnLocal && btnLocal instanceof Element) { btnLocal.classList.toggle('unlocked', !!payloadLocal.unlocked); btnLocal.classList.toggle('locked', !payloadLocal.unlocked); const lbl = (btnLocal.textContent || '').trim(); const labelWord = lbl.split(' ').slice(1).join(' ') || (payloadLocal.level && payloadLocal.level[0].toUpperCase() + payloadLocal.level.slice(1)); btnLocal.innerHTML = `${payloadLocal.unlocked ? '🔓' : '🔒'} ${labelWord}`; } } catch (e) {}
      } catch (e) {}
    }

    // Save via IPC helper if available (direct saveUserUnlock returns plain object)
    // Helper to ensure the key was actually persisted; if not, attempt alternate save paths.
    async function ensureSaved(userIdLocal, keyLocal, payloadLocal) {
      try {
        // Try to read back unlocks
        let current = {};
        if (window.api && typeof window.api.getUserUnlocks === 'function') {
          try { const r = await window.api.getUserUnlocks(userIdLocal); current = (r && r.body) ? r.body : (r || {}); } catch (e) { current = {}; }
        } else if (window.api && typeof window.api.rpc === 'function') {
          try { const r = await window.api.rpc(`user-unlocks/${userIdLocal}`, 'GET'); current = (r && r.body) ? r.body : {}; } catch (e) { current = {}; }
        } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
          try { const r = await fetch(`/api/user-unlocks/${userIdLocal}`); if (r && r.ok) current = await r.json(); } catch (e) { current = {}; }
        }

        if (current && Object.prototype.hasOwnProperty.call(current, keyLocal)) return true;

        // Missing: try alternate save paths
        if (window.api && typeof window.api.saveUserUnlock === 'function') {
          try { const s = await window.api.saveUserUnlock(userIdLocal, keyLocal, payloadLocal); if (s && (s.ok || s === true)) return true; } catch (e) {}
        }
        if (window.api && typeof window.api.rpc === 'function') {
          try { const s = await window.api.rpc(`user-unlocks/${userIdLocal}/${encodeURIComponent(keyLocal)}`, 'POST', payloadLocal); if (s && s.status >= 200 && s.status < 300) return true; } catch (e) {}
        }
        if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
          try { const s = await fetch(`/api/user-unlocks/${userIdLocal}/${encodeURIComponent(keyLocal)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadLocal) }); if (s && s.ok) return true; } catch (e) {}
        }
      } catch (e) {}
      return false;
    }

    if (window.api && typeof window.api.saveUserUnlock === 'function') {
      try {
        res = await window.api.saveUserUnlock(userId, key, payload);
      } catch (e) { console.warn('ipc saveUserUnlock failed', e && e.message); }
      // res is likely a plain object like { ok: true }
      if (res && (res.ok || res === true)) {
        const action = desiredUnlocked ? 'unlocked' : 'locked';
        showToast(getPrettyUnlockMessage(certId, domainId, level, action), 'success', 3000);
        // If unlocking hard, also ensure medium is unlocked visually and persisted
        if (desiredUnlocked && String(level).toLowerCase() === 'hard') {
          const mediumKey = (domainId === null || typeof domainId === 'undefined') ? `${certId}:medium` : `${certId}:${domainId}:medium`;
          const mediumPayload = { certId, domainId, level: 'medium', unlocked: true };
          try {
            // Persist medium unlock too via IPC/rpc
            if (window.api && typeof window.api.saveUserUnlock === 'function') {
              await window.api.saveUserUnlock(userId, mediumKey, mediumPayload);
            } else if (window.api && typeof window.api.rpc === 'function') {
              await window.api.rpc(`user-unlocks/${userId}/${encodeURIComponent(mediumKey)}`, 'POST', mediumPayload);
            } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
              await fetch(`/api/user-unlocks/${userId}/${encodeURIComponent(mediumKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mediumPayload) });
            }

            // Verify persistence and retry via alternates if necessary
            try {
              const ok = await ensureSaved(userId, mediumKey, mediumPayload);
              if (!ok) console.warn('Medium unlock may not have persisted for', mediumKey);
            } catch (e) {}
          } catch (e) { /* ignore medium save errors */ }
            try { mirrorUnlockToLocal(userId, mediumKey, { unlocked: true }); } catch (e) {}
        }

  // Update runtime cache and dispatch event for other pages
        try {
          window._currentProgressUnlocks = window._currentProgressUnlocks || {}; window._currentProgressUnlocks[key] = { unlocked: !!desiredUnlocked };
          mirrorUnlockToLocal(userId, key, { unlocked: !!desiredUnlocked });
          window.dispatchEvent(new CustomEvent('kemmei:unlockToggled', { detail: { userId, key, unlocked: desiredUnlocked, certId, domainId, level } }));
        } catch (e) {}

        // Ensure button visuals persist: keep optimistic state and update related child buttons if needed
        try {
          if (btn && btn instanceof Element) {
            btn.classList.toggle('unlocked', desiredUnlocked);
            btn.classList.toggle('locked', !desiredUnlocked);
            const label = (level && level[0].toUpperCase() + level.slice(1)) || '';
            btn.innerHTML = `${desiredUnlocked ? '🔓' : '🔒'} ${label}`;
          }
          // If toggling at title/domain level, propagate to child domain/subdomain buttons
          if (domainId === null || typeof domainId === 'undefined') {
            // title-level toggle -> propagate to all domain and subdomain child buttons
            const children = findChildButtons(certId, null, level);
            for (const c of children) {
              try { saveAndMirror(userId, `${certId}:${(c.domainBlock ? (c.domainBlock.querySelector('h4')?.textContent || '').split(' ')[0] : '')}:${level}`, { certId, domainId: null, level, unlocked: desiredUnlocked }, c.btn); } catch (e) {}
            }
          } else {
            // domain-level toggle -> propagate to subdomains under this domain
            const children = findChildButtons(certId, domainId, level);
            for (const c of children) {
              try {
                const domainText = c.domainBlock?.querySelector('h4')?.textContent || '';
                const domainKey = domainText.split(' ')[0] || domainId;
                const payloadChild = { certId, domainId, level, unlocked: desiredUnlocked };
                const childKey = `${certId}:${domainKey}:${level}`;
                saveAndMirror(userId, childKey, payloadChild, c.btn);
              } catch (e) {}
            }
          }
        } catch (e) {}

        try {
          const persisted = await ensureSaved(userId, key, payload);
          if (!persisted) {
            // revert optimistic UI if present
            if (prevBtnState && btn && btn instanceof Element) {
              try { btn.className = prevBtnState.className; btn.innerHTML = prevBtnState.innerHTML; } catch (e) {}
            }
            showToast('❌ Failed to verify unlock persistence.', 'error', 3000);
            return;
          }
        } catch (e) {}
        return;
      } else {
        // revert optimistic UI if present
        if (prevBtnState && btn && btn instanceof Element) {
          try { btn.className = prevBtnState.className; btn.innerHTML = prevBtnState.innerHTML; } catch (e) {}
        }
        showToast('❌ Failed to update unlock status.', 'error', 3000);
        return;
      }
    }

    // Fallback to generic RPC which returns { status, body }
    if (window.api && typeof window.api.rpc === 'function') {
      try {
        // rpc handler expects POST to user-unlocks/:userId/:key
        res = await window.api.rpc(`user-unlocks/${userId}/${encodeURIComponent(key)}`, 'POST', payload);
      } catch (e) { console.warn('rpc user-unlocks failed', e && e.message); }
  if (res && res.status >= 200 && res.status < 300) {
        const result = res.body || {};
        const action = result.unlocked === undefined ? (desiredUnlocked ? 'unlocked' : 'locked') : (result.unlocked ? 'unlocked' : 'locked');
        showToast(getPrettyUnlockMessage(certId, domainId, level, action), 'success', 3000);
        try {
          window._currentProgressUnlocks = window._currentProgressUnlocks || {}; window._currentProgressUnlocks[key] = { unlocked: !!desiredUnlocked };
          mirrorUnlockToLocal(userId, key, { unlocked: !!desiredUnlocked });
          window.dispatchEvent(new CustomEvent('kemmei:unlockToggled', { detail: { userId, key, unlocked: desiredUnlocked, certId, domainId, level } }));
        } catch (e) {}
        // keep optimistic UI and update medium if unlocking hard
        try {
          if (btn && btn instanceof Element) {
            btn.classList.toggle('unlocked', desiredUnlocked);
            btn.classList.toggle('locked', !desiredUnlocked);
            const label = (level && level[0].toUpperCase() + level.slice(1)) || '';
            btn.innerHTML = `${desiredUnlocked ? '🔓' : '🔒'} ${label}`;
          }
          if (desiredUnlocked && String(level).toLowerCase() === 'hard') {
            const mediumBtn = findButton(certId, domainId, 'medium');
            if (mediumBtn) { mediumBtn.classList.add('unlocked'); mediumBtn.classList.remove('locked'); mediumBtn.innerHTML = `🔓 Medium`; }
            // persist medium unlock as well
            try {
              const mediumKey = (domainId === null || typeof domainId === 'undefined') ? `${certId}:medium` : `${certId}:${domainId}:medium`;
              const mediumPayload = { certId, domainId, level: 'medium', unlocked: true };
              if (window.api && typeof window.api.rpc === 'function') {
                await window.api.rpc(`user-unlocks/${userId}/${encodeURIComponent(mediumKey)}`, 'POST', mediumPayload);
              } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
                await fetch(`/api/user-unlocks/${userId}/${encodeURIComponent(mediumKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mediumPayload) });
              }
              try { await ensureSaved(userId, mediumKey, mediumPayload); } catch (e) {}
              try { mirrorUnlockToLocal(userId, mediumKey, { unlocked: true }); } catch (e) {}
            } catch (e) {}
          }
          // propagate to children similar to IPC path
          try {
            if (domainId === null || typeof domainId === 'undefined') {
              const children = findChildButtons(certId, null, level);
              for (const c of children) {
                try { saveAndMirror(userId, `${certId}:${(c.domainBlock ? (c.domainBlock.querySelector('h4')?.textContent || '').split(' ')[0] : '')}:${level}`, { certId, domainId: null, level, unlocked: desiredUnlocked }, c.btn); } catch (e) {}
              }
            } else {
              const children = findChildButtons(certId, domainId, level);
              for (const c of children) {
                try {
                  const domainText = c.domainBlock?.querySelector('h4')?.textContent || '';
                  const domainKey = domainText.split(' ')[0] || domainId;
                  const payloadChild = { certId, domainId, level, unlocked: desiredUnlocked };
                  const childKey = `${certId}:${domainKey}:${level}`;
                  saveAndMirror(userId, childKey, payloadChild, c.btn);
                } catch (e) {}
              }
            }
          } catch (e) {}
        } catch (e) {}
        try {
          const persisted = await ensureSaved(userId, key, payload);
          if (!persisted) {
            if (prevBtnState && btn && btn instanceof Element) {
              try { btn.className = prevBtnState.className; btn.innerHTML = prevBtnState.innerHTML; } catch (e) {}
            }
            showToast('❌ Failed to verify unlock persistence.', 'error', 3000);
            return;
          }
        } catch (e) {}
        return;
      } else {
        if (prevBtnState && btn && btn instanceof Element) {
          try { btn.className = prevBtnState.className; btn.innerHTML = prevBtnState.innerHTML; } catch (e) {}
        }
        showToast('❌ Failed to update unlock status.', 'error', 3000);
        return;
      }
    }

    // Final fallback: network POST when running in server mode
    if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
      try {
        res = await fetch(`/api/user-unlocks/${userId}/${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res && res.ok) {
          let result = {};
          try { result = await res.json(); } catch (e) { result = {}; }
          const action = result.unlocked === undefined ? (desiredUnlocked ? 'unlocked' : 'locked') : (result.unlocked ? 'unlocked' : 'locked');
          showToast(getPrettyUnlockMessage(certId, domainId, level, action), 'success', 3000);
          try {
            window._currentProgressUnlocks = window._currentProgressUnlocks || {}; window._currentProgressUnlocks[key] = { unlocked: !!desiredUnlocked };
            mirrorUnlockToLocal(userId, key, { unlocked: !!desiredUnlocked });
            window.dispatchEvent(new CustomEvent('kemmei:unlockToggled', { detail: { userId, key, unlocked: desiredUnlocked, certId, domainId, level } }));
          } catch (e) {}
          try {
            if (btn && btn instanceof Element) {
              btn.classList.toggle('unlocked', desiredUnlocked);
              btn.classList.toggle('locked', !desiredUnlocked);
              const label = (level && level[0].toUpperCase() + level.slice(1)) || '';
              btn.innerHTML = `${desiredUnlocked ? '🔓' : '🔒'} ${label}`;
            }
            if (desiredUnlocked && String(level).toLowerCase() === 'hard') {
              const mediumBtn = findButton(certId, domainId, 'medium');
              if (mediumBtn) { mediumBtn.classList.add('unlocked'); mediumBtn.classList.remove('locked'); mediumBtn.innerHTML = `🔓 Medium`; }
              try {
                const mediumKey = (domainId === null || typeof domainId === 'undefined') ? `${certId}:medium` : `${certId}:${domainId}:medium`;
                const mediumPayload = { certId, domainId, level: 'medium', unlocked: true };
                if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
                  await fetch(`/api/user-unlocks/${userId}/${encodeURIComponent(mediumKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mediumPayload) });
                }
                try { await ensureSaved(userId, mediumKey, mediumPayload); } catch (e) {}
                try { mirrorUnlockToLocal(userId, mediumKey, { unlocked: true }); } catch (e) {}
              } catch (e) {}
            }
          } catch (e) {}
          try {
            const persisted = await ensureSaved(userId, key, payload);
            if (!persisted) {
              if (prevBtnState && btn && btn instanceof Element) {
                try { btn.className = prevBtnState.className; btn.innerHTML = prevBtnState.innerHTML; } catch (e) {}
              }
              showToast('❌ Failed to verify unlock persistence.', 'error', 3000);
              return;
            }
          } catch (e) {}
          return;
        }
      } catch (e) { console.warn('network user-unlocks POST failed', e && e.message); }
    }

    console.warn('Skipping user-unlocks POST: no supported bridge available');
    showToast('❌ Failed to update unlock status.', 'error');
  } catch (err) {
    console.error("❌ Toggle unlock error:", err);
    showToast("❌ Network error.", 'error');
  }
}

function saveExpandedState() {
  // Save expanded certs/domains/subdomains
  const expanded = {
    certs: [],
    domains: [],
    subdomains: []
  };
  document.querySelectorAll('.domain-list:not(.hidden)').forEach(el => {
    const certBlock = el.closest('.title-block');
    if (certBlock) {
      const certId = certBlock.querySelector('h3')?.textContent?.split(':')[0]?.trim();
      if (certId) expanded.certs.push(certId);
    }
  });
  document.querySelectorAll('.subdomain-list:not(.hidden)').forEach(el => {
    const domainBlock = el.closest('.domain-block');
    if (domainBlock) {
      const domainId = domainBlock.querySelector('h4')?.textContent?.split(' ')[1]?.trim();
      if (domainId) expanded.domains.push(domainId);
    }
  });
  try {
    const userId = localStorage.getItem('userId');
    if (userId) {
      localStorage.setItem(`user:${userId}:progressExpanded`, JSON.stringify(expanded));
    } else {
      // no user: do not store a global progressExpanded for clean-start behavior
    }
  } catch (e) {
    // ignore storage errors
  }
}

function restoreExpandedState() {
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) return; // no user -> nothing to restore
    const raw = localStorage.getItem(`user:${userId}:progressExpanded`);
    const expanded = raw ? JSON.parse(raw) : null;
    if (!expanded) return;
  // Expand certs
  expanded.certs?.forEach(certId => {
    document.querySelectorAll('.title-block').forEach(block => {
      const h3 = block.querySelector('h3');
      if (h3 && h3.textContent && h3.textContent.startsWith(certId)) {
        const domainList = block.querySelector('.domain-list');
        if (domainList) domainList.classList.remove('hidden');
      }
    });
  });
  // Expand domains
  expanded.domains?.forEach(domainId => {
    document.querySelectorAll('.domain-block').forEach(block => {
      const h4 = block.querySelector('h4');
      if (h4 && h4.textContent.includes(domainId)) {
        const subList = block.querySelector('.subdomain-list');
        if (subList) subList.classList.remove('hidden');
      }
    });
  });
  // Clear after restoring
  localStorage.removeItem(`user:${userId}:progressExpanded`);
  } catch (e) {
    // ignore JSON parse/storage errors
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

// Call restore after rendering tree
function renderProgressTree(userProgress, domainMap, unlocks, testCompletions, domainErrMsg) {
  const container = document.getElementById("progressStats");
  if (!container) {
    console.warn('progressStats container not found');
    return;
  }
  container.innerHTML = "";

  const certNames = (domainMap && domainMap.certNames) ? domainMap.certNames : {};
  const domainMaps = (domainMap && domainMap.domainMaps) ? domainMap.domainMaps : {};
  const subdomainMaps = (domainMap && domainMap.subdomainMaps) ? domainMap.subdomainMaps : {};

  // If domainMap is effectively empty, show a small hint rather than throwing
  if (Object.keys(certNames).length === 0) {
    const hint = document.createElement('div');
    hint.className = 'progress-hint';
    hint.textContent = 'No certification mapping found (domainmap). If this is unexpected, check your installation.' + (domainErrMsg ? (' Error: ' + domainErrMsg) : '');
    container.appendChild(hint);
    return;
  }

  const progressTree = {};
  // Build a lookup structure for user progress
  for (const [key, data] of Object.entries(userProgress || {})) {
    const parts = key.split(":");
    // expected format: cert:domain:sub:difficulty  (some keys may be shorter)
    const cert = parts[0] || 'unknown';
    const domain = parts[1] || 'all';
    const sub = parts[2] || 'all';
    const difficulty = parts[3] || 'easy';
    if (!progressTree[cert]) progressTree[cert] = {};
    if (!progressTree[cert][domain]) progressTree[cert][domain] = {};
    if (!progressTree[cert][domain][sub]) progressTree[cert][domain][sub] = {};
    progressTree[cert][domain][sub][difficulty] = data;
  }

  // Helper to get percentage indicators for a given key
  function getPercentIndicators(certId, domainId = null) {
    const difficulties = ["easy", "medium", "hard"];
    const colors = { easy: "🟢", medium: "🟡", hard: "🔴" };
    let indicators = "";

    // Helper: normalize a token (cert/domain/sub) for comparison.
    function normalizeToken(t) {
      if (!t && t !== 0) return '';
      return String(t).replace(/~/g, '.').replace(/_/g, '.').trim();
    }

    // Parse a stored key into tokens [cert, domain, sub, difficulty]
    function parseStoredKey(key) {
      const raw = String(key || '');
      const parts = raw.split(':').map(p => p.trim());
      return parts; // may be shorter/longer
    }

    // Strict matching for test completions: prefer exact token matches where possible.
    // certOnly: when domainPart==null -> only consider keys where domain token is 'all' (title-level)
    // domainOnly: when domain provided without sub -> consider keys where sub token === 'all'
    // subdomain: when both domain and sub provided -> match exact cert:domain:sub:diff
    function findTestScoreStrict(cert, domainPart, subPart, difficulty) {
      if (!testCompletions) return null;
      const wantedCert = normalizeToken(cert);
      const wantedDomain = domainPart ? normalizeToken(domainPart).split(' ')[0] : null; // compare numeric id (e.g., '2.0') if present
      const wantedSub = subPart ? normalizeToken(subPart).split(' ')[0] : null;

      for (const [k, v] of Object.entries(testCompletions)) {
        const parts = parseStoredKey(k);
        if (parts.length < 4) continue; // expecting cert:domain:sub:difficulty
        const [kc, kd, ks, kdifficulty] = parts;
        const kcNorm = normalizeToken(kc);
        const kdNorm = normalizeToken(kd).split(' ')[0];
        const ksNorm = normalizeToken(ks).split(' ')[0];
        const kdiffNorm = normalizeToken(kdifficulty).toLowerCase();

        if (kdiffNorm !== difficulty) continue;
        if (kcNorm !== normalizeToken(wantedCert)) continue;

        // Subdomain-level request: require exact domain & sub match
        if (wantedDomain && wantedSub) {
          if (kdNorm === wantedDomain && ksNorm === wantedSub) {
            const score = v && (v.score || v.score === 0) ? Number(v.score) : (v && v.data && v.data.score ? Number(v.data.score) : null);
            if (typeof score === 'number' && !isNaN(score)) return Math.min(Math.round(score), 100);
          }
          continue;
        }

        // Domain-level request (no sub): accept keys where sub token is 'all' for domain-level completions
        if (wantedDomain && !wantedSub) {
          if (kdNorm === wantedDomain && (ksNorm === 'all' || ksNorm === '' || ksNorm === 'all')) {
            const score = v && (v.score || v.score === 0) ? Number(v.score) : (v && v.data && v.data.score ? Number(v.data.score) : null);
            if (typeof score === 'number' && !isNaN(score)) return Math.min(Math.round(score), 100);
          }
          continue;
        }

        // Cert-level request (no domain): accept keys where domain token is 'all' and sub is 'all'
        if (!wantedDomain) {
          if ((kdNorm === 'all' || kdNorm === '') && (ksNorm === 'all' || ksNorm === '')) {
            const score = v && (v.score || v.score === 0) ? Number(v.score) : (v && v.data && v.data.score ? Number(v.data.score) : null);
            if (typeof score === 'number' && !isNaN(score)) return Math.min(Math.round(score), 100);
          }
        }
      }
      return null;
    }

    // Search userProgress for flashcard-derived percent
    function findFlashcardPercent(cert, domain, sub, difficulty) {
      if (!userProgress) return null;
      // Strict token matching: compare cert/domain/sub tokens by position.
      const wantedCert = normalizeToken(cert);
      const wantedDomain = domain ? normalizeToken(domain).split(' ')[0] : null;
      const wantedSub = sub ? normalizeToken(sub).split(' ')[0] : null;

      for (const [k, v] of Object.entries(userProgress)) {
        const rawParts = String(k || '').split(':').map(p => normalizeToken(p));
        const kc = rawParts[0] || '';
        const kd = rawParts[1] || 'all';
        const ks = rawParts[2] || 'all';
        const kdiff = (rawParts[3] || 'easy').toLowerCase();

        // difficulty must match stored entry
        if (String(difficulty || 'easy').toLowerCase() !== kdiff) continue;

        if (kc !== wantedCert) continue;

        // Cert-level request: only accept entries where domain and sub are 'all'
        if (!wantedDomain) {
          if (!(kd === 'all' || kd === '')) continue;
        } else {
          // Domain-level or subdomain-level request
          if (kd !== wantedDomain) continue;
        }

        if (wantedSub) {
          if (ks !== wantedSub) continue;
        } else {
          // For domain-level requests, only accept entries with sub='all'
          if (!(ks === 'all' || ks === '')) continue;
        }

        const entry = v && v[0] ? v[0] : v; // handle possible array wrapping
        if (entry && typeof entry.total === 'number' && entry.total > 0) {
          return Math.round((entry.correct || 0) / entry.total * 100);
        }
      }
      return null;
    }

    // Parse domainId param to separate domain and sub if provided
    let domainPart = null;
    let subPart = null;
    if (domainId && domainId.includes(':')) {
      const parts = String(domainId).split(':').map(s => s.trim());
      domainPart = parts[0] || null;
      subPart = parts[1] || null;
    } else if (domainId) {
      domainPart = domainId;
    }

    // Determine easy percent first (prefer strict testCompletions, then flashcard progress)
    let easyPercent = findTestScoreStrict(certId, domainPart, subPart, 'easy');
    if (easyPercent === null) easyPercent = findFlashcardPercent(certId, domainPart, subPart, 'easy') || 0;

    const paleClass = easyPercent === 0 ? 'pale' : '';

    for (const diff of difficulties) {
  let percent = findTestScoreStrict(certId, domainPart, subPart, diff);
  if (percent === null) percent = findFlashcardPercent(certId, domainPart, subPart, diff) || 0;

      let show = true;
      if (diff !== 'easy' && easyPercent === 0) show = false;
      indicators += `<span class='percent-indicator ${diff} ${show ? '' : paleClass}'>${colors[diff]} ${show ? percent + '%' : ''}</span> `;
    }

    return indicators.trim();
  }

  // Render everything regardless of progress
  for (const certId of Object.keys(certNames)) {
    const certBlock = document.createElement("div");
    certBlock.className = "title-block";

    const titleHeader = document.createElement("div");
    titleHeader.className = "title-header";
    
    const titleText = document.createElement("h3");
    // Add percentage indicators for cert level (all domains)
    const certIndicators = getPercentIndicators(certId);
    titleText.innerHTML = `📘 ${certId}: ${certNames[certId]} <span class='percent-indicators'>${certIndicators}</span>`;
    titleText.style.cursor = "pointer";
    
    const titleUnlocks = document.createElement("div");
    titleUnlocks.className = "unlock-buttons";
    
    // Title level unlock buttons (replace dots with underscores for MongoDB compatibility)
    const certKey = certId.replace(/\./g, '_');
  const mediumUnlocked = unlockValue(unlocks, `${certKey}:medium`);
  const hardUnlocked = unlockValue(unlocks, `${certKey}:hard`);
    
    const mediumBtn = document.createElement("button");
    mediumBtn.className = `unlock-btn ${mediumUnlocked ? 'unlocked' : 'locked'}`;
    mediumBtn.innerHTML = `${mediumUnlocked ? '🔓' : '🔒'} Medium`;
  mediumBtn.dataset.tooltip = 'This button unlocks the relevant level cards for this title and all sections it includes';
  mediumBtn.classList.add('has-tooltip');
    mediumBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUnlock(certKey, null, "medium", mediumBtn);
    });
    
    const hardBtn = document.createElement("button");
    hardBtn.className = `unlock-btn ${hardUnlocked ? 'unlocked' : 'locked'}`;
    hardBtn.innerHTML = `${hardUnlocked ? '🔓' : '🔒'} Hard`;
  hardBtn.dataset.tooltip = 'This button unlocks the relevant level cards for this title and all sections it includes';
  hardBtn.classList.add('has-tooltip');
    hardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUnlock(certKey, null, "hard", hardBtn);
    });
    
    titleUnlocks.appendChild(mediumBtn);
    titleUnlocks.appendChild(hardBtn);
    
    titleHeader.appendChild(titleText);
    titleHeader.appendChild(titleUnlocks);

    const domainList = document.createElement("div");
    domainList.className = "domain-list hidden"; // collapsed initially

    titleText.addEventListener("click", () => {
      const currentlyOpen = document.querySelector(".domain-list:not(.hidden)");
      if (currentlyOpen && currentlyOpen !== domainList) {
        currentlyOpen.classList.add("hidden");
      }
      domainList.classList.toggle("hidden");
    });

    certBlock.appendChild(titleHeader);

    const domains = domainMaps[certId] || {};
    for (const domainId of Object.keys(domains)) {
      const domainTitle = domains[domainId];
      const domainBlock = document.createElement("div");
      domainBlock.className = "domain-block";
      
      const domainHeader = document.createElement("div");
      domainHeader.className = "domain-header";
      
      const domainText = document.createElement("h4");
      // Add percentage indicators for domain level
      const domainIndicators = getPercentIndicators(certId, domainId);
      domainText.innerHTML = `📂 ${domainId} ${domainTitle} <span class='percent-indicators'>${domainIndicators}</span>`;
      domainText.style.cursor = "pointer";
      
      const domainUnlocks = document.createElement("div");
      domainUnlocks.className = "unlock-buttons";
      
      // Domain level unlock buttons (replace dots with underscores for MongoDB compatibility)
      const domainKey = domainId.replace(/\./g, '_');
  const domainMediumUnlocked = unlockValue(unlocks, `${certKey}:${domainKey}:medium`);
  const domainHardUnlocked = unlockValue(unlocks, `${certKey}:${domainKey}:hard`);
      
      const domainMediumBtn = document.createElement("button");
      domainMediumBtn.className = `unlock-btn ${domainMediumUnlocked ? 'unlocked' : 'locked'}`;
      domainMediumBtn.innerHTML = `${domainMediumUnlocked ? '🔓' : '🔒'} Medium`;
  domainMediumBtn.dataset.tooltip = 'This button unlocks the relevant level cards for this title and all sections it includes';
  domainMediumBtn.classList.add('has-tooltip');
      domainMediumBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleUnlock(certKey, domainKey, "medium", domainMediumBtn);
      });
      
      const domainHardBtn = document.createElement("button");
      domainHardBtn.className = `unlock-btn ${domainHardUnlocked ? 'unlocked' : 'locked'}`;
      domainHardBtn.innerHTML = `${domainHardUnlocked ? '🔓' : '🔒'} Hard`;
  domainHardBtn.dataset.tooltip = 'This button unlocks the relevant level cards for this title and all sections it includes';
  domainHardBtn.classList.add('has-tooltip');
      domainHardBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleUnlock(certKey, domainKey, "hard", domainHardBtn);
      });
      
      domainUnlocks.appendChild(domainMediumBtn);
      domainUnlocks.appendChild(domainHardBtn);
      
      domainHeader.appendChild(domainText);
      domainHeader.appendChild(domainUnlocks);
      domainBlock.appendChild(domainHeader);

      const subdomainWrapper = document.createElement("div");
      subdomainWrapper.className = "subdomain-list hidden"; // initially hidden

      domainText.addEventListener("click", () => {
        const openDomains = domainList.querySelectorAll(".subdomain-list:not(.hidden)");
        openDomains.forEach(el => {
          if (el !== subdomainWrapper) el.classList.add("hidden");
        });
        subdomainWrapper.classList.toggle("hidden");
      });

      const subMap = subdomainMaps[certId]?.[domainId] || {};
      for (const subId of Object.keys(subMap)) {
        const subTitle = subMap[subId];
        const subBlock = document.createElement("div");
        subBlock.className = "subdomain-block";

        // Create header container for title and difficulty list
        const subHeader = document.createElement("div");
        subHeader.className = "subdomain-header";

        const subTitleElement = document.createElement("h5");
        // Add percentage indicators for subdomain level
        const subIndicators = getPercentIndicators(certId, `${domainId}:${subId}`);
        subTitleElement.innerHTML = `🔹 ${subId} ${subTitle} <span class='percent-indicators'>${subIndicators}</span>`;
        subTitleElement.className = "subdomain-title";

        subHeader.appendChild(subTitleElement);
        subBlock.appendChild(subHeader);
        subdomainWrapper.appendChild(subBlock);

  // After rendering subIndicators — tooltips for subdomains are temporarily disabled
  // per design decision (unlock schema not finalized). Leave spans without tooltips.
      }

      domainBlock.appendChild(subdomainWrapper);
      domainList.appendChild(domainBlock);
    }

    certBlock.appendChild(domainList);
    container.appendChild(certBlock);

    // After rendering certIndicators, add data-tooltip to green/yellow circles
    setTimeout(() => {
      const certPercentSpans = titleText.querySelectorAll('.percent-indicator.easy, .percent-indicator.medium');
      certPercentSpans.forEach(span => {
        span.dataset.tooltip = 'Completing decks in Test mode will unlock next level for this section';
        span.classList.add('has-tooltip');
      });
    }, 0);
  }

  // After rendering domain indicators, add tooltips to green/yellow circles
  setTimeout(() => {
    const domainPercentSpans = document.querySelectorAll('.domain-header .percent-indicator.easy, .domain-header .percent-indicator.medium');
    domainPercentSpans.forEach(span => {
    span.dataset.tooltip = 'Completing decks in Test mode will unlock next level for this section';
    span.classList.add('has-tooltip');
    });
  }, 0);

  restoreExpandedState();
}

// Floating tooltip manager for progress page
function initFloatingTooltips() {
  let activeTip = null;
  let showTimeout = null;

  function createTip(text) {
    const tip = document.createElement('div');
    tip.className = 'progress-tooltip';
    tip.textContent = text;
    document.body.appendChild(tip);
    return tip;
  }

  function positionTip(tip, target) {
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const PAD = 8;

    // Prefer placing above the element unless there isn't space
    let top = rect.top - tipRect.height - PAD;
    let left = rect.left + (rect.width - tipRect.width) / 2;

    if (top < PAD) {
      // place below
      top = rect.bottom + PAD;
    }

    // Clamp horizontally
    left = Math.max(PAD, Math.min(left, window.innerWidth - PAD - tipRect.width));

    tip.style.position = 'fixed';
    tip.style.top = Math.round(top) + 'px';
    tip.style.left = Math.round(left) + 'px';
  }

  document.addEventListener('mouseover', (ev) => {
    const el = ev.target.closest && ev.target.closest('.has-tooltip');
    if (!el) return;
    const text = el.dataset && (el.dataset.tooltip || el.getAttribute('data-tooltip'));
    if (!text) return;

    // Delay slightly so accidental hovers don't show tooltip
    showTimeout = setTimeout(() => {
      activeTip = createTip(text);
      // Initially hide to measure without flicker
      activeTip.style.opacity = '0';
      activeTip.style.pointerEvents = 'none';
      // Allow browser to layout
      requestAnimationFrame(() => {
        positionTip(activeTip, el);
        activeTip.style.opacity = '1';
      });
    }, 160);
  });

  document.addEventListener('mouseout', (ev) => {
    const el = ev.target.closest && ev.target.closest('.has-tooltip');
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    if (activeTip) {
      activeTip.remove();
      activeTip = null;
    }
  });

  // Also close on scroll/resize to avoid orphaned tips
  ['scroll', 'resize'].forEach(evt => window.addEventListener(evt, () => {
    if (showTimeout) { clearTimeout(showTimeout); showTimeout = null; }
    if (activeTip) { activeTip.remove(); activeTip = null; }
  }, true));
}

// Initialize tooltip manager for the progress page
setTimeout(initFloatingTooltips, 50);

// Tooltip fade logic (CSS required for fade effect)
// Add this to your CSS:
// .has-tooltip[title]:hover::after {
//   content: attr(title);
//   position: absolute;
//   background: #222;
//   color: #fff;
//   padding: 6px 12px;
//   border-radius: 6px;
//   font-size: 0.95em;
//   opacity: 0;
//   transition: opacity 0.5s;
//   pointer-events: none;
//   z-index: 100;
// }
// .has-tooltip[title]:hover::after {
//   opacity: 1;
//   transition-delay: 0.5s;
// }
// .has-tooltip[title]:not(:hover)::after {
//   opacity: 0;
//   transition-delay: 5s;
// }

function getPrettyUnlockMessage(certId, domainId, level, action) {
  // Convert back from MongoDB-safe keys to display keys
  const displayCertId = certId.replace(/_/g, '.');
  const displayDomainId = domainId ? domainId.replace(/_/g, '.') : null;
  // Get certification name mapping
  const certNameMap = {
    '220-1201': 'CompTIA A+ Core 1',
    '220-1202': 'CompTIA A+ Core 2',
    'N10-009': 'CompTIA Network+',
    'SY0-701': 'CompTIA Security+'
  };
  const certName = certNameMap[displayCertId] || displayCertId;
  const emoji = action === "unlocked" ? "🔓" : "🔒";
  const actionText = action === "unlocked" ? "unlocked" : "locked";
  if (displayDomainId) {
    return `${emoji} ${level.charAt(0).toUpperCase() + level.slice(1)} difficulty for ${certName}, domain ${displayDomainId} ${actionText}.`;
  } else {
    return `${emoji} ${level.charAt(0).toUpperCase() + level.slice(1)} difficulty for ${certName} ${actionText}.`;
  }
}
