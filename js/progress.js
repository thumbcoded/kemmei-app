document.addEventListener("DOMContentLoaded", async () => {
  const statsDiv = document.getElementById("progressStats");
  const resetBtn = document.getElementById("resetProgress");
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  // Floating kanji words logic (copied from index.html)
  const kanjiWords = ["賢明", "懸命"];
  const kanjiContainer = document.body;

  function createKanji() {
    const kanji = document.createElement("span");
    kanji.className = "kanji-scatter";
    kanji.textContent = kanjiWords[Math.floor(Math.random() * kanjiWords.length)];
    kanji.style.top = `${Math.random() * 100}%`;
    kanji.style.left = `${Math.random() * 100}%`;

    // Generate random values for movement directions
    kanji.style.setProperty("--random-x1", Math.random());
    kanji.style.setProperty("--random-y1", Math.random());
    kanji.style.setProperty("--random-x2", Math.random());
    kanji.style.setProperty("--random-y2", Math.random());
    kanji.style.setProperty("--random-x3", Math.random());
    kanji.style.setProperty("--random-y3", Math.random());
    kanji.style.setProperty("--random-x4", Math.random());
    kanji.style.setProperty("--random-y4", Math.random());

    kanji.style.animation = `float ${30 + Math.random() * 30}s linear infinite`;
    kanjiContainer.appendChild(kanji);

    kanji.addEventListener("animationend", () => {
      kanji.remove();
      createKanji(); // Replace the kanji after it finishes floating
    });
  }

  // Ensure 5-7 kanji are always floating
  for (let i = 0; i < 7; i++) {
    createKanji();
  }

  // Original progress.js logic
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
    statsDiv.textContent = "Error loading progress.";
  }

  const confirmModal = document.getElementById("confirmModal");
  const confirmYes = document.getElementById("confirmYes");
  const confirmNo = document.getElementById("confirmNo");

  resetBtn.addEventListener("click", () => {
    confirmModal.classList.remove("hidden");
  });

  confirmNo.addEventListener("click", () => {
    confirmModal.classList.add("hidden");
  });

  confirmYes.addEventListener("click", async () => {
    confirmModal.classList.add("hidden");

    try {
      const res = await fetch(`http://localhost:3000/api/user-progress/${userId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const toast = document.getElementById("toast");
        toast.textContent = "✔️ Your progress has been cleared.";
        toast.classList.remove("hidden");
        toast.classList.add("show");

        setTimeout(() => {
          toast.classList.remove("show");
          setTimeout(() => {
            toast.classList.add("hidden");
            location.reload(); // after fade out
          }, 400);
        }, 2000);
      } else {
        alert("❌ Failed to clear progress.");
      }
    } catch (err) {
      console.error("❌ Reset error:", err);
      alert("❌ Network error.");
    }
  });
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
        subdomainWrapper.classList.toggle("hidden");
      });

      const subList = document.createElement("div");
      subList.className = "subdomain-list";

      const subMap = subdomainMaps[certId]?.[domainId] || {};
      for (const subId of Object.keys(subMap)) {
        const subTitle = subMap[subId];
        const subBlock = document.createElement("div");
        subBlock.className = "subdomain-block";
        subBlock.innerHTML = `<h5>🔹 ${subId} ${subTitle}</h5>`;

        const diffList = document.createElement("ul");
        diffList.className = "difficulty-list";

        for (const difficulty of ["easy", "medium", "hard"]) {
          const entry = progressTree[certId]?.[domainId]?.[subId]?.[difficulty];
          const li = document.createElement("li");

          if (difficulty === "easy") {
            li.textContent = entry
              ? `easy: ✅ ${entry.correct} / ${entry.total} (${Math.round((entry.correct / entry.total) * 100)}%)`
              : "easy: 🟢 Available";
          } else if (entry) {
            const acc = Math.round((entry.correct / entry.total) * 100);
            const passed = acc >= 80;
            li.textContent = `${difficulty}: ${passed ? "✅" : "⚠️"} ${entry.correct} / ${entry.total} (${acc}%)`;
          } else {
            li.textContent = `${difficulty}: 🔒 Locked`;
          }

          diffList.appendChild(li);
        }

        subBlock.appendChild(diffList);
        subdomainWrapper.appendChild(subBlock);
      }

      domainBlock.appendChild(subdomainWrapper);
      domainList.appendChild(domainBlock);
    }

    certBlock.appendChild(domainList);
    container.appendChild(certBlock);
  }
}
