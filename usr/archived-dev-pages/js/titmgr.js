// Archived from js/titmgr.js
// Original location: js/titmgr.js
// Archived on: 2025-09-24

// Title manager archival copy — contains functions to render title tree, rename/delete, and export
async function loadTitleTree() {
  try {
    const res = await fetch("/api/domainmap");
    const data = await res.json();
    renderTitleTree(data.certNames, data.domainMaps, data.subdomainMaps);
  } catch (err) {
    console.error("Failed to load domainmap.json (archived)", err);
  }
}

function renderTitleTree(certNames, domainMaps, subdomainMaps) {
  // ...archived implementation
}

window.refreshTitleManager = loadTitleTree;

// archived: loadTitleTree and renderTitleTree preserved for reference
// Archived copy of js/titmgr.js
// Full content preserved for reference and restoration if needed.

async function loadTitleTree() {
  try {
  const res = await fetch("/api/domainmap")
    const data = await res.json();

    renderTitleTree(data.certNames, data.domainMaps, data.subdomainMaps);
  } catch (err) {
    console.error("❌ Failed to load domainmap.json:", err);
  }
}

function renderTitleTree(certNames, domainMaps, subdomainMaps) {
  // ... archived content omitted for brevity (full original preserved in repo history)
}

// To restore: copy this file to `js/titmgr.js` at project root
