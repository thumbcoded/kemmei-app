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
  renderSubdomainSummary(certId, domainId, subId, subTitle);
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

function balanceGroupInputs(group) {
  const inputs = group.map(sel => document.querySelector(sel));
  const values = inputs.map(input => parseFloat(input.value) || 0);
  const total = values.reduce((a, b) => a + b, 0);

  const changedIndex = inputs.findIndex(input => document.activeElement === input);
  if (changedIndex === -1) return;

  const fixedValue = values[changedIndex];
  const remaining = 100 - fixedValue;

  // Redistribute among the other two
  const otherIndices = [0, 1, 2].filter(i => i !== changedIndex);
  const otherTotal = otherIndices.map(i => values[i]).reduce((a, b) => a + b, 0) || 1;

  otherIndices.forEach(i => {
    const proportion = values[i] / otherTotal;
    const adjusted = Math.max(0, Math.round(remaining * proportion));
    inputs[i].value = adjusted;
  });

  inputs[changedIndex].value = Math.min(100, Math.round(fixedValue)); // cap max
}

async function renderSubdomainSummary(certId, domainId, subId, subTitle) {
  try {
    const res = await fetch(`http://localhost:3000/api/cards?cert_id=${certId}&domain_id=${domainId}&subdomain_id=${subId}`);
    const cards = await res.json();

    const panel = document.getElementById("concurDetails");
    let report = null;
    panel.innerHTML = `
  <div class="details-layout">
    <div class="subdomain-left">
      <h2>📂 ${sanitize(subId)} ${sanitize(subTitle)}</h2>
    </div>
<div class="subdomain-right">
  <!-- We'll populate this later -->
</div>

  </div>
`;

const targetRes = await fetch("http://localhost:3000/api/targetmap");

const targetMap = await targetRes.json();

const key = `${certId}:${domainId}:${subId}`;
const target = targetMap[key] || targetMap.default;

function areTargetsEqualToDefault() {
  const def = targetMap.default;
  return (
    parseInt(document.querySelector(".input-cards-per-concept").value, 10) === def.cardsPerConcept &&
    parseInt(document.querySelector(".input-difficulty-easy").value, 10) === def.difficulty.easy &&
    parseInt(document.querySelector(".input-difficulty-medium").value, 10) === def.difficulty.medium &&
    parseInt(document.querySelector(".input-difficulty-hard").value, 10) === def.difficulty.hard &&
    parseInt(document.querySelector(".input-type-mcq").value, 10) === def.types.multiple_choice &&
    parseInt(document.querySelector(".input-type-multi").value, 10) === def.types.select_multiple &&
    parseInt(document.querySelector(".input-type-all").value, 10) === def.types.select_all
  );
}

const left = panel.querySelector(".subdomain-left");
const right = panel.querySelector(".subdomain-right");

// 📋 Coverage Input UI
const headerRow = document.createElement("div");
headerRow.style.display = "flex";
headerRow.style.alignItems = "center";
headerRow.style.justifyContent = "space-between";

const coverageHeader = document.createElement("h3");
coverageHeader.textContent = "📋 Coverage Targets and Status";

const toggleEdit = document.createElement("button");
toggleEdit.textContent = "🔒 Lock";
toggleEdit.className = "coverage-toggle-btn";

headerRow.appendChild(coverageHeader);
headerRow.appendChild(toggleEdit);
right.appendChild(headerRow);

// 🔁 Lock/Unlock logic
let locked = true;
toggleEdit.textContent = "🔓 Unlock";
setTimeout(() => {
  coverageForm.querySelectorAll("input").forEach(input => {
    input.disabled = true;
  });
});

toggleEdit.addEventListener("click", () => {
  locked = !locked;
  resetInline.style.display = (targetMap[key] && !locked && !areTargetsEqualToDefault())
  ? "inline-block"
  : "none";

  toggleEdit.textContent = locked ? "🔓 Unlock" : "🔒 Lock";
  coverageForm.querySelectorAll("input").forEach(input => {
    input.disabled = locked;
  });
});

// Wrapper
const coverageForm = document.createElement("div");
coverageForm.className = "coverage-form";
right.appendChild(coverageForm);

const masterWrap = document.createElement("div");
masterWrap.className = "master-bar-wrap";
masterWrap.innerHTML = `
  <label style="display: block; margin-top: 1rem;">🏁 Total Subdomain Coverage</label>
  <div class="bar master-bar"><div class="bar-fill master-bar-fill"></div></div>
`;
right.appendChild(masterWrap);


// 💡 Update bars based on actual card data vs targets
function updateBarsFromData() {
  const totalCards = cards.length;

  const countDifficulty = {
    easy: cards.filter(c => c.difficulty === "easy").length,
    medium: cards.filter(c => c.difficulty === "medium").length,
    hard: cards.filter(c => c.difficulty === "hard").length,
  };

  const countType = {
    mcq: cards.filter(c => c.question_type === "multiple_choice").length,
    multi: cards.filter(c => c.question_type === "select_multiple").length,
    all: cards.filter(c => c.question_type === "select_all").length,
  };

  const getColorForRatio = (r) => {
    if (r >= 1.0) return "#27ae60";
    if (r >= 0.8) return "#2ecc71";
    if (r >= 0.6) return "#f39c12";
    if (r >= 0.4) return "#f1c40f";
    if (r >= 0.2) return "#e67e22";
    return "#e74c3c";
  };

  const applyBar = (selector, current, target) => {
    const barWrap = document.querySelector(selector);
    if (!barWrap) return;
    let fill = barWrap.querySelector(".bar-fill");
    if (!fill) {
      fill = document.createElement("div");
      fill.className = "bar-fill";
      barWrap.appendChild(fill);
    }
    const ratio = target ? Math.min(current / target, 1) : 0;
    fill.style.width = (ratio * 100) + "%";
    fill.style.backgroundColor = getColorForRatio(ratio);
    fill.title = `${current} / ${Math.round(target)} (${Math.round(ratio * 100)}%)`;
  };

  const easyTarget = parseInt(document.querySelector(".input-difficulty-easy").value, 10);
  const medTarget = parseInt(document.querySelector(".input-difficulty-medium").value, 10);
  const hardTarget = parseInt(document.querySelector(".input-difficulty-hard").value, 10);
  const mcqTarget = parseInt(document.querySelector(".input-type-mcq").value, 10);
  const multiTarget = parseInt(document.querySelector(".input-type-multi").value, 10);
  const allTarget = parseInt(document.querySelector(".input-type-all").value, 10);
  const cardsPerConcept = parseInt(document.querySelector(".input-cards-per-concept").value, 10);

  const conceptCount = Object.keys(report.conceptCoverage).length;
  const conceptGoal = conceptCount * cardsPerConcept;
  const matchedCount = totalCards - report.unmatchedCards.length;

  applyBar(".bar-cards-per-concept", matchedCount, conceptGoal);
  applyBar(".bar-difficulty-easy", countDifficulty.easy, totalCards * (easyTarget / 100));
  applyBar(".bar-difficulty-medium", countDifficulty.medium, totalCards * (medTarget / 100));
  applyBar(".bar-difficulty-hard", countDifficulty.hard, totalCards * (hardTarget / 100));
  applyBar(".bar-type-mcq", countType.mcq, totalCards * (mcqTarget / 100));
  applyBar(".bar-type-multi", countType.multi, totalCards * (multiTarget / 100));
  applyBar(".bar-type-all", countType.all, totalCards * (allTarget / 100));

  // ✅ Master bar (Conqueror Bar™)
  const ratio = (curr, targ) => targ ? Math.min(curr / targ, 1) : 0;
  const conceptRatio = ratio(matchedCount, conceptGoal);
  const easyRatio = ratio(countDifficulty.easy, totalCards * (easyTarget / 100));
  const medRatio = ratio(countDifficulty.medium, totalCards * (medTarget / 100));
  const hardRatio = ratio(countDifficulty.hard, totalCards * (hardTarget / 100));
  const mcqRatio = ratio(countType.mcq, totalCards * (mcqTarget / 100));
  const multiRatio = ratio(countType.multi, totalCards * (multiTarget / 100));
  const allRatio = ratio(countType.all, totalCards * (allTarget / 100));

  const overall = (
    conceptRatio +
    easyRatio +
    medRatio +
    hardRatio +
    mcqRatio +
    multiRatio +
    allRatio
  ) / 7;

  const masterBar = document.querySelector(".master-bar-fill");
  if (masterBar) {
    masterBar.style.width = `${Math.round(overall * 100)}%`;
    masterBar.style.backgroundColor = getColorForRatio(overall);
    masterBar.title = `Overall coverage: ${Math.round(overall * 100)}%`;
    masterBar.textContent = `${Math.round(overall * 100)}%`;
  }
}


coverageForm.innerHTML += `

  <div class="input-row">
    <label>🧠 Cards per concept:
      <input type="number" class="input-cards-per-concept" min="0" value="2">
    </label>
    <div class="bar bar-cards-per-concept"></div>
  </div>

  <hr>

  <label><b>🎯 Difficulty Distribution</b></label><br>

  <div class="input-row">
    <label>Easy
      <input type="number" class="input-difficulty-easy" min="0" value="60">%
    </label>
    <div class="bar bar-difficulty-easy"></div>
  </div>

  <div class="input-row">
    <label>Medium
      <input type="number" class="input-difficulty-medium" min="0" value="30">%
    </label>
    <div class="bar bar-difficulty-medium"></div>
  </div>

  <div class="input-row">
    <label>Hard
      <input type="number" class="input-difficulty-hard" min="0" value="10">%
    </label>
    <div class="bar bar-difficulty-hard"></div>
  </div>

  <hr>

  <label><b>🧪 Question Types</b></label><br>

  <div class="input-row">
    <label>Multiple Choice
      <input type="number" class="input-type-mcq" min="0" value="60">%
    </label>
    <div class="bar bar-type-mcq"></div>
  </div>

  <div class="input-row">
    <label>Select Multiple
      <input type="number" class="input-type-multi" min="0" value="25">%
    </label>
    <div class="bar bar-type-multi"></div>
  </div>

  <div class="input-row">
    <label>Select All That Apply
      <input type="number" class="input-type-all" min="0" value="15">%
    </label>
    <div class="bar bar-type-all"></div>
  </div>
`;

coverageForm.querySelectorAll("input").forEach(input => {
  input.addEventListener("input", updateBarsFromData);
});

const difficultyInputs = [
  ".input-difficulty-easy",
  ".input-difficulty-medium",
  ".input-difficulty-hard"
];

const typeInputs = [
  ".input-type-mcq",
  ".input-type-multi",
  ".input-type-all"
];

[...difficultyInputs, ...typeInputs].forEach(selector => {
  const input = document.querySelector(selector);
  input.addEventListener("input", () => {
    balanceGroupInputs(
      difficultyInputs.includes(selector) ? difficultyInputs : typeInputs
    );
    updateBarsFromData();
  });
});

document.querySelector(".input-cards-per-concept").value = target.cardsPerConcept || targetMap.default.cardsPerConcept;
document.querySelector(".input-difficulty-easy").value = target.difficulty?.easy ?? targetMap.default.difficulty.easy;
document.querySelector(".input-difficulty-medium").value = target.difficulty?.medium ?? targetMap.default.difficulty.medium;
document.querySelector(".input-difficulty-hard").value = target.difficulty?.hard ?? targetMap.default.difficulty.hard;
document.querySelector(".input-type-mcq").value = target.types?.multiple_choice ?? targetMap.default.types.multiple_choice;
document.querySelector(".input-type-multi").value = target.types?.select_multiple ?? targetMap.default.types.select_multiple;
document.querySelector(".input-type-all").value = target.types?.select_all ?? targetMap.default.types.select_all;

const configNotice = document.createElement("div");
configNotice.className = "target-status";
configNotice.style.display = "flex";
configNotice.style.alignItems = "center";
configNotice.style.gap = "1rem";
configNotice.style.justifyContent = "flex-start";

const statusText = document.createElement("span");
statusText.textContent = areTargetsEqualToDefault()
  ? "📌 Using: Global default"
  : "📌 Using: Custom override";

const resetInline = document.createElement("button");
resetInline.textContent = "Reset to default";
resetInline.style.marginLeft = "1rem";
resetInline.style.display = (targetMap[key] && !locked && !areTargetsEqualToDefault())
  ? "inline-block"
  : "none";


resetInline.addEventListener("click", () => {
  const def = targetMap.default;
  document.querySelector(".input-cards-per-concept").value = def.cardsPerConcept;
  document.querySelector(".input-difficulty-easy").value = def.difficulty.easy;
  document.querySelector(".input-difficulty-medium").value = def.difficulty.medium;
  document.querySelector(".input-difficulty-hard").value = def.difficulty.hard;
  document.querySelector(".input-type-mcq").value = def.types.multiple_choice;
  document.querySelector(".input-type-multi").value = def.types.select_multiple;
  document.querySelector(".input-type-all").value = def.types.select_all;

  updateBarsFromData();
  saveBtn.click();
setTimeout(() => {
  statusText.textContent = areTargetsEqualToDefault()
    ? "📌 Using: Global default"
    : "📌 Using: Custom override";
  resetInline.style.display = (targetMap[key] && !locked && !areTargetsEqualToDefault()) ? "inline-block" : "none";
}, 250); // slight delay to allow saveBtn click to propagate

  showGlobalMessage("↩️ Reset to default values");
});

configNotice.appendChild(statusText);
configNotice.appendChild(resetInline);
coverageForm.prepend(configNotice);


// Create Save/Cancel/Restore buttons (initially hidden)
const buttonRow = document.createElement("div");
buttonRow.style.marginTop = "1rem";
buttonRow.style.display = "none";

const saveBtn = document.createElement("button");
saveBtn.textContent = "💾 Save for this subdomain";
const cancelBtn = document.createElement("button");
cancelBtn.textContent = "Cancel";
cancelBtn.style.marginLeft = "0.5rem";
const restoreBtn = document.createElement("button");
restoreBtn.textContent = "Restore Defaults";
restoreBtn.style.marginLeft = "0.5rem";

buttonRow.appendChild(saveBtn);
buttonRow.appendChild(cancelBtn);
buttonRow.appendChild(restoreBtn);
coverageForm.appendChild(buttonRow);

const loadedTarget = JSON.stringify(target);

coverageForm.querySelectorAll("input").forEach(input => {
  input.addEventListener("input", () => {
    const current = {
      cardsPerConcept: parseInt(document.querySelector(".input-cards-per-concept").value),
      difficulty: {
        easy: parseInt(document.querySelector(".input-difficulty-easy").value),
        medium: parseInt(document.querySelector(".input-difficulty-medium").value),
        hard: parseInt(document.querySelector(".input-difficulty-hard").value),
      },
      types: {
        multiple_choice: parseInt(document.querySelector(".input-type-mcq").value),
        select_multiple: parseInt(document.querySelector(".input-type-multi").value),
        select_all: parseInt(document.querySelector(".input-type-all").value),
      }
    };
    const changed = JSON.stringify(current) !== loadedTarget;
    buttonRow.style.display = changed ? "block" : "none";
  });
});

cancelBtn.addEventListener("click", () => {
  document.querySelector(".input-cards-per-concept").value = target.cardsPerConcept || targetMap.default.cardsPerConcept;
  document.querySelector(".input-difficulty-easy").value = target.difficulty?.easy ?? targetMap.default.difficulty.easy;
  document.querySelector(".input-difficulty-medium").value = target.difficulty?.medium ?? targetMap.default.difficulty.medium;
  document.querySelector(".input-difficulty-hard").value = target.difficulty?.hard ?? targetMap.default.difficulty.hard;
  document.querySelector(".input-type-mcq").value = target.types?.multiple_choice ?? targetMap.default.types.multiple_choice;
  document.querySelector(".input-type-multi").value = target.types?.select_multiple ?? targetMap.default.types.select_multiple;
  document.querySelector(".input-type-all").value = target.types?.select_all ?? targetMap.default.types.select_all;

  buttonRow.style.display = "none";
  updateBarsFromData();
});

restoreBtn.addEventListener("click", () => {
  const def = targetMap.default;
  document.querySelector(".input-cards-per-concept").value = def.cardsPerConcept;
  document.querySelector(".input-difficulty-easy").value = def.difficulty.easy;
  document.querySelector(".input-difficulty-medium").value = def.difficulty.medium;
  document.querySelector(".input-difficulty-hard").value = def.difficulty.hard;
  document.querySelector(".input-type-mcq").value = def.types.multiple_choice;
  document.querySelector(".input-type-multi").value = def.types.select_multiple;
  document.querySelector(".input-type-all").value = def.types.select_all;

  configNotice.textContent = "📌 Using: Global default";
  buttonRow.style.display = "block";
  updateBarsFromData();
});

saveBtn.addEventListener("click", async () => {
  const update = {
    cardsPerConcept: parseInt(document.querySelector(".input-cards-per-concept").value, 10),
    difficulty: {
      easy: parseInt(document.querySelector(".input-difficulty-easy").value, 10),
      medium: parseInt(document.querySelector(".input-difficulty-medium").value, 10),
      hard: parseInt(document.querySelector(".input-difficulty-hard").value, 10),
    },
    types: {
      multiple_choice: parseInt(document.querySelector(".input-type-mcq").value, 10),
      select_multiple: parseInt(document.querySelector(".input-type-multi").value, 10),
      select_all: parseInt(document.querySelector(".input-type-all").value, 10),
    }
  };

  const key = `${certId}:${domainId}:${subId}`;
  
  try {
    const res = await fetch("http://localhost:3000/api/targetmap", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, update })
    });

    if (!res.ok) throw new Error("Save failed");

    showGlobalMessage("✔️ Targets for subdomain saved");
    buttonRow.style.display = "none";
    statusText.textContent = areTargetsEqualToDefault()
  ? "📌 Using: Global default"
  : "📌 Using: Custom override";
resetInline.style.display = (targetMap[key] && !locked && !areTargetsEqualToDefault()) ? "inline-block" : "none";

  } catch (err) {
    console.error("❌ Save failed:", err);
    alert("Failed to save target settings");
  }
});

function showGlobalMessage(msg) {
  const note = document.createElement("div");
  note.textContent = msg;
  note.style.position = "fixed";
  note.style.bottom = "20px";
  note.style.left = "50%";
  note.style.transform = "translateX(-50%)";
  note.style.background = "#333";
  note.style.color = "white";
  note.style.padding = "10px 20px";
  note.style.borderRadius = "5px";
  note.style.zIndex = "9999";
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 3000);
}

    const easy = cards.filter(c => c.difficulty === "easy").length;
    const med = cards.filter(c => c.difficulty === "medium").length;
    const hard = cards.filter(c => c.difficulty === "hard").length;

    const summary = document.createElement("p");
    summary.innerHTML = `Cards: ${cards.length} | 🕹️ Easy: ${easy} | ⚔️ Medium: ${med} | 💀 Hard: ${hard}`;
    // right.appendChild(summary);

    const bottomRow = document.createElement("div");
bottomRow.className = "summary-bar-row";
bottomRow.appendChild(summary);
bottomRow.appendChild(masterWrap);
right.appendChild(bottomRow);

    const covmap = await fetch("/data/covmap.json").then(res => res.json());
    const covmapSub = covmap[certId]?.[domainId]?.[subId];

    if (covmapSub) {
      report = analyzeCoverage(cards, covmapSub);
      const cardsPerConcept = parseInt(document.querySelector(".input-cards-per-concept").value, 10);

      updateBarsFromData();

      const coverageHeader = document.createElement("h3");
      coverageHeader.textContent = "📊 Concept Coverage:";
      left.appendChild(coverageHeader);

Object.entries(report.conceptCoverage).forEach(([concept, info]) => {
  const row = document.createElement("div");
  let icon = "🟢"; // default

  if (info.hitCount === 0) {
    icon = "🔴";
    row.style.color = "red";
  } else if (info.hitCount < cardsPerConcept) {
    icon = "🟡";
  }

  row.textContent = `${icon} ${concept}: ${info.hitCount} card(s)`;
  row.title = `Target: ${cardsPerConcept} card(s)`;
  left.appendChild(row);
});

      const strayNote = document.createElement("p");
strayNote.style.marginTop = "1rem";
strayNote.innerHTML = `🧩 <b>${report.unmatchedCards.length}</b> card(s) did not match any concept.`;
left.appendChild(strayNote);

const toggleBtn = document.createElement("button");
toggleBtn.textContent = "🔍 Show unmatched cards";
toggleBtn.style.marginTop = "0.5rem";
toggleBtn.style.cursor = "pointer";

const unmatchedList = document.createElement("ul");
unmatchedList.style.display = "none";
unmatchedList.className = "unmatched-list";

toggleBtn.addEventListener("click", () => {
  unmatchedList.style.display = unmatchedList.style.display === "none" ? "block" : "none";
  toggleBtn.textContent = unmatchedList.style.display === "block"
    ? "🔽 Hide unmatched cards"
    : "🔍 Show unmatched cards";
});

panel.appendChild(toggleBtn);
panel.appendChild(unmatchedList);

report.unmatchedCards.forEach((cardId) => {
  const card = cards.find(c => c._id === cardId);
  if (!card) return;

  const wrapper = document.createElement("li");
  wrapper.classList.add("unmatched-card");

  // 🧱 Header row: buttons + question text
  const headerRow = document.createElement("div");
  headerRow.style.display = "flex";
  headerRow.style.alignItems = "center";
  headerRow.style.gap = "0.5rem";
  headerRow.style.marginBottom = "0.25rem";

  const editBtn = document.createElement("button");
  editBtn.textContent = "✏️ Edit";

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "🗑️ Delete";

  const questionText = document.createElement("span");
  questionText.textContent = card.question_text;
  questionText.style.fontWeight = "normal";

  headerRow.appendChild(editBtn);
  headerRow.appendChild(deleteBtn);
  headerRow.appendChild(questionText);
  wrapper.appendChild(headerRow);

  // 📝 Inline editor (hidden initially)
  const editor = document.createElement("div");
  editor.style.marginTop = "0.5rem";
  editor.style.display = "none";

  const qInput = document.createElement("textarea");
  qInput.value = card.question_text;
  qInput.rows = 2;
  qInput.style.width = "100%";
  qInput.placeholder = "Edit question text";

  const optInput = document.createElement("textarea");
  optInput.value = (card.answer_options || []).join("\n");
  optInput.rows = 4;
  optInput.style.width = "100%";
  optInput.style.marginTop = "0.5rem";
  optInput.placeholder = "One answer option per line";

  const correctInput = document.createElement("textarea");
  correctInput.value = (card.correct_answer || []).join("\n");
  correctInput.rows = 3;
  correctInput.style.width = "100%";
  correctInput.style.marginTop = "0.5rem";
  correctInput.placeholder = "One correct answer per line";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "💾 Save";
  saveBtn.style.marginTop = "0.5rem";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.marginLeft = "0.5rem";

  editor.appendChild(qInput);
  editor.appendChild(optInput);
  editor.appendChild(correctInput);
  editor.appendChild(saveBtn);
  editor.appendChild(cancelBtn);
  wrapper.appendChild(editor);

  // 🖱️ Edit
  editBtn.addEventListener("click", () => {
    editor.style.display = "block";
    unmatchedList.querySelectorAll("li").forEach(li => {
      if (li !== wrapper) li.style.display = "none";
    });
    toggleBtn.style.display = "none";
    editBtn.disabled = true;
    deleteBtn.disabled = true;
  });

  // 🚫 Cancel
  cancelBtn.addEventListener("click", () => {
    editor.style.display = "none";
    unmatchedList.querySelectorAll("li").forEach(li => {
      li.style.display = "list-item";
    });
    toggleBtn.style.display = "inline-block";
    editBtn.disabled = false;
    deleteBtn.disabled = false;
  });

  // 💾 Save
  saveBtn.addEventListener("click", async () => {
    const updated = {
      ...card,
      question_text: qInput.value.trim(),
      answer_options: optInput.value.split("\n").map(s => s.trim()).filter(Boolean),
      correct_answer: correctInput.value.split("\n").map(s => s.trim()).filter(Boolean)
    };

    try {
  const res = await fetch(`http://localhost:3000/api/cards/${card._id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated)
  });

  if (res.ok) {
    await renderSubdomainSummary(certId, domainId, subId, subTitle);
  } else {
    alert("❌ Failed to update card");
  }
} catch (err) {
  console.error(err);
  alert("❌ Network error");
}

  });

  // 🗑️ Delete
  deleteBtn.addEventListener("click", () => {
    deleteBtn.style.display = "none";
    const confirmRow = document.createElement("div");
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "✔ Confirm";
    const cancelDelBtn = document.createElement("button");
    cancelDelBtn.textContent = "✖ Cancel";
    cancelDelBtn.style.marginLeft = "0.5rem";
    confirmRow.appendChild(confirmBtn);
    confirmRow.appendChild(cancelDelBtn);
    wrapper.appendChild(confirmRow);

    cancelDelBtn.addEventListener("click", () => {
      confirmRow.remove();
      deleteBtn.style.display = "inline-block";
    });

    confirmBtn.addEventListener("click", async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/cards/${card._id}`, {
          method: "DELETE"
        });

        if (res.ok) {
          wrapper.remove();
        } else {
          alert("❌ Failed to delete");
        }
      } catch (err) {
        console.error(err);
        alert("❌ Network error");
      }
    });
  });

  unmatchedList.appendChild(wrapper);
});

}

  } catch (err) {
    console.error("❌ Failed to load cards for subdomain:", err);
  }
}
