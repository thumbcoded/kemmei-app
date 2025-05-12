async function loadTitleTree() {
  try {
    const res = await fetch("http://localhost:3000/api/domainmap")
    const data = await res.json();

    renderTitleTree(data.certNames, data.domainMaps, data.subdomainMaps);
  } catch (err) {
    console.error("❌ Failed to load domainmap.json:", err);
  }
}

function renderTitleTree(certNames, domainMaps, subdomainMaps) {
  const builtinList = document.getElementById("builtinTitleList");
  const userList = document.getElementById("userTitleList");
  const isBuiltIn = id => /^220-|^120|^N10-|^SY0-/.test(id);

  builtinList.innerHTML = "";
  userList.innerHTML = "";

Object.entries(certNames).forEach(([certId, certTitle]) => {

    const certItem = document.createElement("li");
    certItem.className = "title-item";

    const certHeader = document.createElement("div");
    certHeader.className = "title-main";

const domainMap = domainMaps[certId] || {};
const hasDomains = Object.keys(domainMap).length > 0;

const toggle = document.createElement("span");
toggle.className = "toggle-arrow";
toggle.textContent = hasDomains ? "▶" : "▷";
toggle.style.color = hasDomains ? "#333" : "#aaa";


const label = document.createElement("span");
label.textContent = certTitle;

// ////////////////////// ACTION COG AND BUTTONS //////////////////////

if (!isBuiltIn(certId)) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "space-between";
  wrapper.style.flex = "1";
  wrapper.style.position = "relative";

  // Left side: toggle + label
  const leftGroup = document.createElement("div");
  leftGroup.style.display = "flex";
  leftGroup.style.alignItems = "center";
  leftGroup.style.gap = "0.4rem";

  const label = document.createElement("span");
  label.textContent = certTitle;

  leftGroup.appendChild(toggle);
  leftGroup.appendChild(label);

  // Right side: gear + hidden actions
  const actionWrapper = document.createElement("div");
  actionWrapper.style.position = "relative";
  actionWrapper.style.display = "flex";
  actionWrapper.style.alignItems = "center";

  const gearBtn = document.createElement("button");
  gearBtn.textContent = "⚙️";
  gearBtn.className = "gear-btn";

  const actionRow = document.createElement("div");
  actionRow.className = "action-row";
  actionRow.style.display = "none";

  actionWrapper.addEventListener("mouseenter", () => {
    actionRow.style.display = "flex";
  });
  actionWrapper.addEventListener("mouseleave", () => {
    actionRow.style.display = "none";
  });

  const renameBtn = document.createElement("button");
  renameBtn.innerHTML = "✏️";

renameBtn.addEventListener("click", () => {
  startInlineRename({
    parent: label,
    oldValue: certTitle,
    type: "title",
    certId,
    onSuccess: async () => {
      await window.refreshAllPanels?.();
    }
  });
});



  const deleteBtn = document.createElement("button");
  deleteBtn.innerHTML = "🗑️";

deleteBtn.addEventListener("click", () => {
  startInlineDelete({
    label,
    type: "title",
    certId,
    onSuccess: async () => {
  await window.refreshAllPanels?.();
}

  });
});


  const exportBtn = document.createElement("button");
  exportBtn.innerHTML = "📤";

exportBtn.addEventListener("click", async () => {
  try {
    const res = await fetch(`http://localhost:3000/api/cards?cert_id=${encodeURIComponent(certId)}`);
    const cards = await res.json();

    if (!cards || !cards.length) {
      showManagerMessage?.("ℹ️ No cards found under this title.");
      return;
    }

    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${certId}_cards_export.json`;
    a.click();

    URL.revokeObjectURL(url);
    showManagerMessage?.("📤 Exported card data.");
  } catch (err) {
    console.error("❌ Export error:", err);
    showManagerMessage?.("❌ Failed to export cards.");
  }
});

  actionRow.append(renameBtn, deleteBtn, exportBtn);

  actionWrapper.appendChild(gearBtn);
  actionWrapper.appendChild(actionRow);

  wrapper.appendChild(leftGroup);
  wrapper.appendChild(actionWrapper);
  certHeader.appendChild(wrapper);
}

else {
  certHeader.appendChild(toggle);
  certHeader.appendChild(label);
}

certHeader.style.cursor = "pointer";

const domainContainer = document.createElement("div");
domainContainer.className = "title-detail";
domainContainer.style.display = "none";

Object.entries(domainMap).forEach(([domainId, domainTitle]) => {

  const subMap = subdomainMaps[certId]?.[domainId] || {};
const hasSubdomains = Object.keys(subMap).length > 0;

const domainSection = document.createElement("div");
domainSection.className = "domain-section";

const domainHeader = document.createElement("div");
domainHeader.className = "domain-main";

const domainToggle = document.createElement("span");
domainToggle.className = "toggle-arrow";
domainToggle.textContent = hasSubdomains ? "▶" : "▷";
domainToggle.style.color = hasSubdomains ? "#333" : "#aaa";

const domainLabel = document.createElement("span");
domainLabel.textContent = `${domainId} ${domainTitle}`;

  const domainWrapper = document.createElement("div");
  domainWrapper.style.display = "flex";
  domainWrapper.style.alignItems = "center";
  domainWrapper.style.justifyContent = "space-between";

  const leftGroup = document.createElement("div");
  leftGroup.style.display = "flex";
  leftGroup.style.alignItems = "center";
  leftGroup.style.gap = "0.4rem";
  leftGroup.appendChild(domainToggle);
  leftGroup.appendChild(domainLabel);

  domainWrapper.appendChild(leftGroup);

  if (!isBuiltIn(certId)) {
    const actionWrapper = document.createElement("div");
    actionWrapper.style.position = "relative";

    const gearBtn = document.createElement("button");
    gearBtn.textContent = "⚙️";
    gearBtn.className = "gear-btn";

    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.style.display = "none";

    actionWrapper.addEventListener("mouseenter", () => {
      actionRow.style.display = "flex";
    });
    actionWrapper.addEventListener("mouseleave", () => {
      actionRow.style.display = "none";
    });

    const renameBtn = document.createElement("button");
    renameBtn.innerHTML = "✏️";

renameBtn.addEventListener("click", () => {
  startInlineRename({
    parent: domainLabel,
    oldValue: domainTitle,
    type: "domain",
    certId,
    domainId,
    onSuccess: async () => {
      await window.refreshAllPanels?.();
    }
  });
});




    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "🗑️";

deleteBtn.addEventListener("click", () => {
  startInlineDelete({
    label: domainLabel,
    type: "domain",
    certId,
    domainId,
    onSuccess: async () => {
  await window.refreshAllPanels?.();
}

  });
});



    actionRow.append(renameBtn, deleteBtn);
    actionWrapper.appendChild(gearBtn);
    actionWrapper.appendChild(actionRow);
    domainWrapper.appendChild(actionWrapper);
  }



domainHeader.appendChild(domainWrapper);

domainHeader.style.cursor = "pointer";


const subdomainList = document.createElement("div");
subdomainList.className = "subdomain-list";
subdomainList.style.display = "none";

Object.entries(subMap).forEach(([subId, subTitle]) => {

  const subItem = document.createElement("div");
subItem.className = "subdomain-item";

const subLabel = document.createElement("span");
subLabel.textContent = `${subId} ${subTitle}`;

const subWrapper = document.createElement("div");
subWrapper.style.display = "flex";
subWrapper.style.alignItems = "center";
subWrapper.style.justifyContent = "space-between";

subWrapper.appendChild(subLabel);

if (!isBuiltIn(certId)) {
  const actionWrapper = document.createElement("div");
  actionWrapper.style.position = "relative";

  const gearBtn = document.createElement("button");
  gearBtn.textContent = "⚙️";
  gearBtn.className = "gear-btn";

  const actionRow = document.createElement("div");
  actionRow.className = "action-row";
  actionRow.style.display = "none";

  actionWrapper.addEventListener("mouseenter", () => {
    actionRow.style.display = "flex";
  });
  actionWrapper.addEventListener("mouseleave", () => {
    actionRow.style.display = "none";
  });

  const renameBtn = document.createElement("button");
  renameBtn.innerHTML = "✏️";

renameBtn.addEventListener("click", () => {
  startInlineRename({
    parent: subLabel,
    oldValue: subTitle,
    type: "subdomain",
    certId,
    domainId,
    subId,
    onSuccess: async () => {
      await window.refreshAllPanels?.();
    }
  });
});


  const deleteBtn = document.createElement("button");
  deleteBtn.innerHTML = "🗑️";

deleteBtn.addEventListener("click", () => {
  startInlineDelete({
    label: subLabel,
    type: "subdomain",
    certId,
    domainId,
    subId,
    onSuccess: async () => {
  await window.refreshAllPanels?.();
}

  });
});



  actionRow.append(renameBtn, deleteBtn);
  actionWrapper.appendChild(gearBtn);
  actionWrapper.appendChild(actionRow);
  subWrapper.appendChild(actionWrapper);
}

subItem.appendChild(subWrapper);
subdomainList.appendChild(subItem);

subdomainList.appendChild(subItem);
});

domainHeader.addEventListener("click", () => {
  if (!hasSubdomains) return;

  const open = subdomainList.style.display === "block";
  subdomainList.style.display = open ? "none" : "block";
  domainToggle.textContent = open ? "▶" : "▼";
});


domainSection.appendChild(domainHeader);
domainSection.appendChild(subdomainList);
domainContainer.appendChild(domainSection);
});

certHeader.addEventListener("click", () => {
  if (!hasDomains) return;

  const open = domainContainer.style.display === "block";
  domainContainer.style.display = open ? "none" : "block";
  toggle.textContent = open ? "▶" : "▼";
});


certItem.appendChild(certHeader);
certItem.appendChild(domainContainer);
(isBuiltIn(certId) ? builtinList : userList).appendChild(certItem);
});
}
// Auto-run when managerPanel is shown
document.addEventListener("DOMContentLoaded", () => {
  const toggleManager = document.getElementById("toggleManager");
  toggleManager.addEventListener("change", () => {
    if (toggleManager.checked) {
      loadTitleTree();
    }
  });
});

window.refreshTitleManager = loadTitleTree;

document.addEventListener("DOMContentLoaded", () => {
  const exportAllBtn = document.getElementById("exportAllBtn");
  exportAllBtn?.addEventListener("click", async () => {
    try {
      const res = await fetch("http://localhost:3000/api/cards");
      const cards = await res.json();

      const userCerts = Object.keys(cards.reduce((acc, c) => {
        c.cert_id.forEach(id => {
          if (!/^220-|^120|^N10-|^SY0-/.test(id)) acc[id] = true;
        });
        return acc;
      }, {}));

      const filtered = cards.filter(c => userCerts.some(id => c.cert_id.includes(id)));

      if (!filtered.length) {
        showManagerMessage?.("ℹ️ No user-created cards to export.");
        return;
      }

      const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `kemmei_user_cards_export.json`;
      a.click();

      URL.revokeObjectURL(url);
      showManagerMessage?.("📤 Exported all user-created cards.");
    } catch (err) {
      console.error("❌ Export all error:", err);
      showManagerMessage?.("❌ Failed to export user cards.");
    }
  });
});

function showManagerMessage(message, type = "info") {
  const el = document.getElementById("managerMessageArea");
  if (!el) return;

  el.className = `system-message ${type}`;
  el.textContent = message;

  requestAnimationFrame(() => {
    el.classList.remove("hidden");
  });

  clearTimeout(el._hideTimeout);
  el._hideTimeout = setTimeout(() => {
    el.classList.add("hidden");
  }, 3000);
}

function startInlineRename({ parent, oldValue, type, certId, domainId, subId, onSuccess }) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = oldValue;
  input.style.marginLeft = "0.5rem";
  input.style.fontSize = "0.9rem";
  input.style.padding = "0.2rem 0.4rem";
  input.style.border = "1px solid #ccc";
  input.style.borderRadius = "4px";
  input.style.maxWidth = "240px";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "✔";
  saveBtn.className = "save-btn";
  saveBtn.style.marginLeft = "0.4rem";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "✖";
  cancelBtn.className = "cancel-btn";

  // Replace old element content
  const oldText = parent.textContent;
parent.innerHTML = "";
parent.appendChild(input);

const btnGroup = document.createElement("div");
btnGroup.className = "inline-rename-controls";
btnGroup.style.display = "inline-flex";
btnGroup.style.gap = "0.4rem";
btnGroup.appendChild(saveBtn);
btnGroup.appendChild(cancelBtn);

parent.appendChild(btnGroup);
  input.focus();
  input.select();

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    saveBtn.click();
    e.preventDefault();
  } else if (e.key === "Escape") {
    cancelBtn.click();
    e.preventDefault();
  }
});

  cancelBtn.addEventListener("click", () => {
    parent.textContent = oldText;
  });

  saveBtn.addEventListener("click", async () => {
    const newValue = input.value.trim();
    if (!newValue || newValue === oldValue) {
      parent.textContent = oldText;
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/api/domainmap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          cert_id: certId,
          domain_id: domainId,
          sub_id: subId,
          new_title: newValue
        })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        showManagerMessage(`✔️ ${type[0].toUpperCase() + type.slice(1)} renamed.`, "success");
        await  onSuccess?.();
      } else {
        showManagerMessage(`❌ Failed to rename ${type}.`, "error");
        parent.textContent = oldText;
      }
    } catch (err) {
      console.error("❌ Rename error:", err);
      showManagerMessage("❌ Network error.", "error");
      parent.textContent = oldText;
    }
  });
}

function startInlineDelete({ label, type, certId, domainId, subId, onSuccess }) {
  const itemName = label?.textContent || "this item";

  // Clear old content
  const oldText = label.textContent;
  label.innerHTML = "";

  const confirmText = document.createElement("span");
  confirmText.textContent = `Delete ${type}?`;
  confirmText.style.marginRight = "0.5rem";

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "✔";
  confirmBtn.className = "save-btn";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "✖";
  cancelBtn.className = "cancel-btn";

  const btnGroup = document.createElement("div");
  btnGroup.style.display = "inline-flex";
  btnGroup.style.gap = "0.4rem";
  btnGroup.append(confirmBtn, cancelBtn);

  label.append(confirmText, btnGroup);

  cancelBtn.addEventListener("click", () => {
    label.textContent = oldText;
  });

  confirmBtn.addEventListener("click", async () => {
    const body = {
      type,
      cert_id: certId,
      domain_id: domainId,
      sub_id: subId,
    };

    try {
      const res = await fetch("http://localhost:3000/api/domainmap", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showManagerMessage(`🗑️ ${type[0].toUpperCase() + type.slice(1)} deleted.`, "success");
        await onSuccess?.();
      } else if (res.status === 409) {
        showManagerMessage(`❌ Cannot delete — cards still exist.`, "error");
        label.textContent = oldText;
      } else {
        showManagerMessage(`❌ Failed to delete ${type}.`, "error");
        label.textContent = oldText;
      }
    } catch (err) {
      console.error(`❌ ${type} delete error:`, err);
      showManagerMessage("❌ Network error.", "error");
      label.textContent = oldText;
    }
  });
}

window.refreshAllPanels = async function () {
  await window.loadDomainMap?.();

  window.dropdowns.populateAdminFormDropdownsFromMaps(
    window.certNames,
    window.domainMaps,
    window.subdomainMaps
  );

  window.refreshTitleManager?.();
};

window.dropdowns.populateAdminFormDropdownsFromMaps(certNames, domainMaps, subdomainMaps);

