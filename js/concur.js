import { analyzeCoverage } from "./covmap.js";

document.addEventListener("DOMContentLoaded", () => {
  loadConcurTree();
});

async function loadConcurTree() {
  try {
    const res = await fetch("http://localhost:3000/api/domainmap");
    const data = await res.json();
    renderConcurTree(data.certNames, data.domainMaps, data.subdomainMaps);
  } catch (err) {
    console.error("❌ Failed to load domainmap.json:", err);
  }
}

function sanitize(text) {
  return (text || "").replace(/[^\x20-\x7E]/g, "");
}

function renderConcurTree(certNames, domainMaps, subdomainMaps) {
  const tree = document.getElementById("concurTree");
  tree.innerHTML = "";

  Object.entries(certNames).forEach(([certId, certTitle]) => {
    const certItem = document.createElement("div");
    certItem.className = "cert-node";

    const certHeader = document.createElement("span");
    certHeader.className = "cert-header";
    certHeader.textContent = sanitize(certTitle);

    const certToggle = document.createElement("span");
    certToggle.textContent = "\u25B6";
    certToggle.className = "toggle-arrow";
    certToggle.style.cursor = "pointer";
    certToggle.style.marginRight = "0.4rem";

    const certLine = document.createElement("div");
    certLine.style.display = "flex";
    certLine.style.alignItems = "center";
    certLine.style.cursor = "pointer";
    certLine.appendChild(certToggle);
    certLine.appendChild(certHeader);

    const domainContainer = document.createElement("div");
    domainContainer.className = "domain-block";
    domainContainer.style.display = "none";

    certLine.addEventListener("click", () => {
      const open = domainContainer.style.display === "block";
      domainContainer.style.display = open ? "none" : "block";
      certToggle.textContent = open ? "\u25B6" : "\u25BC";
    });

    const domainMap = domainMaps[certId] || {};
    Object.entries(domainMap).forEach(([domainId, domainTitle]) => {
      const domainItem = document.createElement("div");
      domainItem.className = "domain-node";

      const domainToggle = document.createElement("span");
      domainToggle.textContent = "\u25B6";
      domainToggle.className = "toggle-arrow";
      domainToggle.style.cursor = "pointer";
      domainToggle.style.marginRight = "0.4rem";

      const domainLabel = document.createElement("span");
      domainLabel.textContent = `${domainId} ${sanitize(domainTitle)}`;

      const domainLine = document.createElement("div");
      domainLine.style.display = "flex";
      domainLine.style.alignItems = "center";
      domainLine.style.cursor = "pointer";
      domainLine.appendChild(domainToggle);
      domainLine.appendChild(domainLabel);

      const subContainer = document.createElement("ul");
      subContainer.className = "subdomain-list";
      subContainer.style.display = "none";

      domainLine.addEventListener("click", () => {
        const open = subContainer.style.display === "block";
        subContainer.style.display = open ? "none" : "block";
        domainToggle.textContent = open ? "\u25B6" : "\u25BC";
      });

      const subMap = subdomainMaps[certId]?.[domainId] || {};
      Object.entries(subMap).forEach(([subId, subTitle]) => {
        const subItem = document.createElement("li");
        subItem.textContent = `${subId} ${sanitize(subTitle)}`;
        subItem.dataset.certId = certId;
        subItem.dataset.domainId = domainId;
        subItem.dataset.subId = subId;

        subItem.addEventListener("click", () => {
          loadSubdomainSummary(certId, domainId, subId, subTitle);
        });

        subContainer.appendChild(subItem);
      });

      domainItem.appendChild(domainLine);
      domainItem.appendChild(subContainer);
      domainContainer.appendChild(domainItem);
    });

    certItem.appendChild(certLine);
    certItem.appendChild(domainContainer);
    tree.appendChild(certItem);
  });
}

async function loadSubdomainSummary(certId, domainId, subId, subTitle) {
  try {
    const res = await fetch(`http://localhost:3000/api/cards?cert_id=${certId}&domain_id=${domainId}&subdomain_id=${subId}`);
    const cards = await res.json();

    const panel = document.getElementById("concurDetails");
    panel.innerHTML = `<h2>📂 ${sanitize(subId)} ${sanitize(subTitle)}</h2>`;

    const easy = cards.filter(c => c.difficulty === "easy").length;
    const med = cards.filter(c => c.difficulty === "medium").length;
    const hard = cards.filter(c => c.difficulty === "hard").length;

    const summary = document.createElement("p");
    summary.innerHTML = `Cards: ${cards.length} | 🕹️ Easy: ${easy} | ⚔️ Medium: ${med} | 💀 Hard: ${hard}`;
    panel.appendChild(summary);

    const covmap = await fetch("/data/covmap.json").then(res => res.json());
    const covmapSub = covmap[certId]?.[domainId]?.[subId];

    if (covmapSub) {
      const report = analyzeCoverage(cards, covmapSub);

      const coverageHeader = document.createElement("h3");
      coverageHeader.textContent = "📊 Concept Coverage:";
      panel.appendChild(coverageHeader);

      Object.entries(report.conceptCoverage).forEach(([concept, info]) => {
        const row = document.createElement("div");
        row.textContent = `${concept}: ${info.hitCount} card(s)`;
        if (info.hitCount === 0) {
          row.style.color = "red";
        }
        panel.appendChild(row);
      });
    }

  } catch (err) {
    console.error("❌ Failed to load cards for subdomain:", err);
  }
}
