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

function showToast(message, type = 'success') {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = message;
    toast.classList.remove("hidden", "error", "success");
    toast.classList.add("show", type);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.classList.add("hidden");
        toast.classList.remove("error", "success");
      }, 400);
    }, 3000);
  }
}

async function toggleUnlock(certId, domainId, level) {
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  // Save expanded state before reload
  saveExpandedState();

  try {
  let res = null;
  const payload = { certId, domainId, level };
  if (window.api && typeof window.api.saveUserUnlock === 'function') {
    try { res = await window.api.saveUserUnlock(userId, `${certId}:${domainId}:${level}`, payload); } catch (e) { console.warn('ipc saveUserUnlock failed', e && e.message); }
  } else if (window.api && typeof window.api.rpc === 'function') {
    try { res = await window.api.rpc(`user-unlocks/${userId}`, 'POST', payload); } catch (e) { console.warn('rpc user-unlocks failed', e && e.message); }
  } else if (document.location.protocol !== 'file:' && typeof fetch === 'function') {
    try { res = await fetch(`/api/user-unlocks/${userId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) { console.warn('network user-unlocks POST failed', e && e.message); }
  } else {
    console.warn('Skipping user-unlocks POST: running under file:// with no IPC bridge');
  }

    if (res.ok) {
      const result = await res.json();
      const action = result.unlocked ? "unlocked" : "locked";
      const prettyMessage = getPrettyUnlockMessage(certId, domainId, level, action);
      showToast(prettyMessage);
      setTimeout(() => {
        location.reload();
      }, 1000);
    } else {
      showToast("❌ Failed to update unlock status.", 'error');
    }
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
  localStorage.setItem('progressExpanded', JSON.stringify(expanded));
}

function restoreExpandedState() {
  const expanded = JSON.parse(localStorage.getItem('progressExpanded') || '{}');
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
  localStorage.removeItem('progressExpanded');
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
    const mediumUnlocked = unlocks[`${certKey}:medium`] || false;
    const hardUnlocked = unlocks[`${certKey}:hard`] || false;
    
    const mediumBtn = document.createElement("button");
    mediumBtn.className = `unlock-btn ${mediumUnlocked ? 'unlocked' : 'locked'}`;
    mediumBtn.innerHTML = `${mediumUnlocked ? '🔓' : '🔒'} Medium`;
    mediumBtn.setAttribute('title', 'This button unlocks the relevant level cards for this title and all sections it includes');
    mediumBtn.classList.add('has-tooltip');
    mediumBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUnlock(certKey, null, "medium");
    });
    
    const hardBtn = document.createElement("button");
    hardBtn.className = `unlock-btn ${hardUnlocked ? 'unlocked' : 'locked'}`;
    hardBtn.innerHTML = `${hardUnlocked ? '🔓' : '🔒'} Hard`;
    hardBtn.setAttribute('title', 'This button unlocks the relevant level cards for this title and all sections it includes');
    hardBtn.classList.add('has-tooltip');
    hardBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUnlock(certKey, null, "hard");
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
      const domainMediumUnlocked = unlocks[`${certKey}:${domainKey}:medium`] || false;
      const domainHardUnlocked = unlocks[`${certKey}:${domainKey}:hard`] || false;
      
      const domainMediumBtn = document.createElement("button");
      domainMediumBtn.className = `unlock-btn ${domainMediumUnlocked ? 'unlocked' : 'locked'}`;
      domainMediumBtn.innerHTML = `${domainMediumUnlocked ? '🔓' : '🔒'} Medium`;
      domainMediumBtn.setAttribute('title', 'This button unlocks the relevant level cards for this title and all sections it includes');
      domainMediumBtn.classList.add('has-tooltip');
      domainMediumBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleUnlock(certKey, domainKey, "medium");
      });
      
      const domainHardBtn = document.createElement("button");
      domainHardBtn.className = `unlock-btn ${domainHardUnlocked ? 'unlocked' : 'locked'}`;
      domainHardBtn.innerHTML = `${domainHardUnlocked ? '🔓' : '🔒'} Hard`;
      domainHardBtn.setAttribute('title', 'This button unlocks the relevant level cards for this title and all sections it includes');
      domainHardBtn.classList.add('has-tooltip');
      domainHardBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleUnlock(certKey, domainKey, "hard");
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

        // After rendering subIndicators, add tooltips to green/yellow circles in subdomain
        setTimeout(() => {
          const subPercentSpans = subTitleElement.querySelectorAll('.percent-indicator.easy, .percent-indicator.medium');
          subPercentSpans.forEach(span => {
            span.setAttribute('title', 'Completing decks in Test mode will unlock next level for this section');
            span.classList.add('has-tooltip');
          });
        }, 0);
      }

      domainBlock.appendChild(subdomainWrapper);
      domainList.appendChild(domainBlock);
    }

    certBlock.appendChild(domainList);
    container.appendChild(certBlock);

    // After rendering certIndicators, add tooltips to green/yellow circles
    setTimeout(() => {
      const certPercentSpans = titleText.querySelectorAll('.percent-indicator.easy, .percent-indicator.medium');
      certPercentSpans.forEach(span => {
        span.setAttribute('title', 'Completing decks in Test mode will unlock next level for this section');
        span.classList.add('has-tooltip');
      });
    }, 0);
  }

  // After rendering domain indicators, add tooltips to green/yellow circles
  setTimeout(() => {
    const domainPercentSpans = document.querySelectorAll('.domain-header .percent-indicator.easy, .domain-header .percent-indicator.medium');
    domainPercentSpans.forEach(span => {
      span.setAttribute('title', 'Completing decks in Test mode will unlock next level for this section');
      span.classList.add('has-tooltip');
    });
  }, 0);

  restoreExpandedState();
}

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
