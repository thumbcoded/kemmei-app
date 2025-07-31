document.addEventListener("DOMContentLoaded", async () => {
  const statsDiv = document.getElementById("progressStats");
  const resetBtn = document.getElementById("resetProgress");
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  // Load and render progress
  try {
    const [progressRes, domainRes, unlocksRes] = await Promise.all([
      fetch(`http://localhost:3000/api/user-progress/${userId}`),
      fetch("/data/domainmap.json"),
      fetch(`http://localhost:3000/api/user-unlocks/${userId}`)
    ]);

    const progress = await progressRes.json();
    const domainMap = await domainRes.json();
    const unlocks = unlocksRes.ok ? await unlocksRes.json() : {};

    renderProgressTree(progress, domainMap, unlocks);
  } catch (err) {
    console.error("❌ Failed to load user progress:", err);
    if (statsDiv) statsDiv.textContent = "Error loading progress.";
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
        const res = await fetch(`http://localhost:3000/api/user-progress/${userId}`, {
          method: "DELETE",
        });

        if (res.ok) {
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

  try {
    const res = await fetch(`http://localhost:3000/api/user-unlocks/${userId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certId,
        domainId,
        level
      }),
    });

    if (res.ok) {
      const result = await res.json();
      const action = result.unlocked ? "unlocked" : "locked";
      
      // Get the pretty names for the toast message
      const prettyMessage = getPrettyUnlockMessage(certId, domainId, level, action);
      showToast(prettyMessage);
      
      // Reload the page to reflect changes
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

function renderProgressTree(userProgress, domainMap, unlocks, testCompletions) {
  const container = document.getElementById("progressStats");
  container.innerHTML = "";

  const { certNames, domainMaps, subdomainMaps } = domainMap;

  const progressTree = {};

  // Build a lookup structure for user progress
  for (const [key, data] of Object.entries(userProgress)) {
    const [cert, domain, sub, difficulty] = key.split(":");
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
    let easyKey = domainId ? `${certId}:${domainId}:easy` : `${certId}:all:easy`;
    let easyEntry = testCompletions && testCompletions[easyKey];
    let easyPercent = easyEntry && typeof easyEntry.score === "number" ? (easyEntry.score > 90 ? 100 : easyEntry.score) : 0;
    // If easy is 0, pale out medium/hard
    let paleClass = easyPercent === 0 ? "pale" : "";
    for (const diff of difficulties) {
      let key = domainId ? `${certId}:${domainId}:${diff}` : `${certId}:all:${diff}`;
      let entry = testCompletions && testCompletions[key];
      let percent = entry && typeof entry.score === "number" ? (entry.score > 90 ? 100 : entry.score) : 0;
      let show = true;
      if (diff !== "easy" && easyPercent === 0) show = false;
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
    mediumBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUnlock(certKey, null, "medium");
    });
    
    const hardBtn = document.createElement("button");
    hardBtn.className = `unlock-btn ${hardUnlocked ? 'unlocked' : 'locked'}`;
    hardBtn.innerHTML = `${hardUnlocked ? '🔓' : '🔒'} Hard`;
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
      domainMediumBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleUnlock(certKey, domainKey, "medium");
      });
      
      const domainHardBtn = document.createElement("button");
      domainHardBtn.className = `unlock-btn ${domainHardUnlocked ? 'unlocked' : 'locked'}`;
      domainHardBtn.innerHTML = `${domainHardUnlocked ? '🔓' : '🔒'} Hard`;
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
      }

      domainBlock.appendChild(subdomainWrapper);
      domainList.appendChild(domainBlock);
    }

    certBlock.appendChild(domainList);
    container.appendChild(certBlock);
  }
}
