document.addEventListener("DOMContentLoaded", async () => {
  const statsDiv = document.getElementById("progressStats");
  const resetBtn = document.getElementById("resetProgress");
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  // Load and render progress
  try {
    const [progressRes, domainRes] = await Promise.all([
      fetch(`http://localhost:3000/api/user-progress/${userId}`),
      fetch("/data/domainmap.json")
    ]);

    const progress = await progressRes.json();
    const domainMap = await domainRes.json();

    renderProgressTree(progress, domainMap);
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
          const toast = document.getElementById("toast");
          if (toast) {
            toast.textContent = "✔️ Your progress has been cleared.";
            toast.classList.remove("hidden");
            toast.classList.add("show");

            setTimeout(() => {
              toast.classList.remove("show");
              setTimeout(() => {
                toast.classList.add("hidden");
                location.reload();
              }, 400);
            }, 2000);
          } else {
            location.reload();
          }
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

function renderProgressTree(userProgress, domainMap) {
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

  // Render everything regardless of progress
  for (const certId of Object.keys(certNames)) {
    const certBlock = document.createElement("div");
    certBlock.className = "title-block";

    const titleHeader = document.createElement("h3");
    titleHeader.innerHTML = `📘 ${certId}: ${certNames[certId]}`;

    const domainList = document.createElement("div");
    domainList.className = "domain-list hidden"; // collapsed initially

    titleHeader.addEventListener("click", () => {
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
      domainBlock.innerHTML = `<h4>📂 ${domainId} ${domainTitle}</h4>`;

      const subdomainWrapper = document.createElement("div");
      subdomainWrapper.className = "subdomain-list hidden"; // initially hidden

      const domainHeader = domainBlock.querySelector("h4");
      domainHeader.style.cursor = "pointer";
      domainHeader.addEventListener("click", () => {
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
        subTitleElement.textContent = `🔹 ${subId} ${subTitle}`;
        subTitleElement.className = "subdomain-title";

        const diffList = document.createElement("ul");
        diffList.className = "difficulty-list";

        const difficulties = ["easy", "medium", "hard"];
        let unlocked = true;
        for (let i = 0; i < difficulties.length; i++) {
          const difficulty = difficulties[i];
          const entry = progressTree[certId]?.[domainId]?.[subId]?.[difficulty];
          const li = document.createElement("li");

          if (!unlocked) {
            // Locked state
            let lockEmoji = "🔒";
            li.textContent = `${difficulty}: ${lockEmoji} Locked`;
            li.style.opacity = "0.5";
          } else if (entry) {
            li.textContent = `${difficulty}: ✅ ${entry.correct} / ${entry.total} (${entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0}%)`;
            // Unlock next level if all correct
            unlocked = entry.total > 0 && entry.correct === entry.total;
          } else {
            // Available but not started
            let emoji = "🟢";
            if (difficulty === "medium") emoji = "🟡";
            if (difficulty === "hard") emoji = "🔴";
            li.textContent = `${difficulty}: ${emoji} Available`;
            // Only easy is available by default; medium/hard only if unlocked
            unlocked = false;
          }
          diffList.appendChild(li);
        }

        subHeader.appendChild(subTitleElement);
        subHeader.appendChild(diffList);
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
