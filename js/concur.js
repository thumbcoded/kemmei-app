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

async function renderSubdomainSummary(certId, domainId, subId, subTitle) {
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
      const strayNote = document.createElement("p");
strayNote.style.marginTop = "1rem";
strayNote.innerHTML = `🧩 <b>${report.unmatchedCards.length}</b> card(s) did not match any concept.`;
panel.appendChild(strayNote);

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
