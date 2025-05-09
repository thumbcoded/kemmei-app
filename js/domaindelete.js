function fetchDomainMap() {
  fetch("http://localhost:3000/api/domainmap")
    .then(res => res.json())
    .then(renderDeletePanel)
    .catch(err => console.error("Failed to fetch domain map:", err));
}

function renderDeletePanel(domainData) {
  const certNames = domainData.certNames || {};
  console.log("🔥 renderDeletePanel loaded with certNames:", certNames);

  const builtinList = document.getElementById("builtinTitleList");
  const userList = document.getElementById("userTitleList");
  if (!builtinList || !userList) {
    console.warn("⚠️ DOM elements not found for title lists");
    return;
  }

  builtinList.innerHTML = "";
  userList.innerHTML = "";

  const isBuiltIn = id => /^220-|^120|^N10-|^SY0-/.test(id);

  Object.entries(certNames).forEach(([certId, titleName]) => {
    const li = document.createElement("li");
    li.className = "title-item";
    li.classList.add(isBuiltIn(certId) ? "built-in-template" : "user-template");

    const titleMain = document.createElement("div");
    titleMain.className = "title-main";
    
    if (!isBuiltIn(certId)) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "title-checkbox";
      checkbox.dataset.certId = certId;
      titleMain.appendChild(checkbox);
    }
    
    const titleText = document.createElement("div");
    titleText.className = "title-text";
    titleText.textContent = `${certId}: ${titleName}`;
    titleMain.appendChild(titleText);
    
    li.appendChild(titleMain);  // ✅ now the left side is one flex row
    
    // RIGHT: action buttons
    const actions = document.createElement("div");
    actions.className = "actions";

    if (isBuiltIn(certId)) {
      const resetBtn = document.createElement("button");
      resetBtn.className = "reset-btn";
      resetBtn.textContent = "Reset";
      resetBtn.addEventListener("click", () => handleReset(certId));
      actions.appendChild(resetBtn);
    } else {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "✏️";
      editBtn.addEventListener("click", () => handleEdit(certId, titleName));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "🗑️";
      deleteBtn.addEventListener("click", () => handleDelete(certId));

      actions.append(editBtn, deleteBtn);
    }

    li.appendChild(actions);
    (isBuiltIn(certId) ? builtinList : userList).appendChild(li);
  });

  setupBulkActions(certNames);
}
  
  function handleReset(certId) {
    if (!confirm(`Reset ${certId} to factory defaults?`)) return;
    fetch(`/api/reset/${certId}`, { method: "POST" })
      .then(res => {
        if (!res.ok) throw new Error("Reset failed");
        fetchDomainMap();
      })
      .catch(err => alert("❌ Reset failed: " + err.message));
  }
  
  function handleDelete(certId) {
    if (!confirm(`Delete user-created title ${certId}? This action is irreversible.`)) return;
    fetch(`/api/domainmap/${certId}`, { method: "DELETE" })
      .then(res => {
        if (!res.ok) throw new Error("Deletion failed");
        fetchDomainMap();
      })
      .catch(err => alert("❌ Deletion failed: " + err.message));
  }
  
  function handleEdit(certId, currentName) {
    const newName = prompt(`Rename title ${certId} to:`, currentName);
    if (!newName || newName === currentName) return;
    fetch(`/api/domainmap/${certId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName })
    })
      .then(res => {
        if (!res.ok) throw new Error("Rename failed");
        fetchDomainMap();
      })
      .catch(err => alert("❌ Rename failed: " + err.message));
  }
  
  function setupBulkActions(domainData) {
    const deleteBtn = document.getElementById("deleteSelectedBtn");
    const exportBtn = document.getElementById("exportAllBtn");
  
    deleteBtn.onclick = () => {
      const selected = getCheckedUserCertIds();
      if (selected.length === 0) return alert("No titles selected.");
      if (!confirm(`Delete ${selected.length} selected titles?`)) return;
  
      Promise.all(
        selected.map(certId =>
          fetch(`/api/domainmap/${certId}`, { method: "DELETE" })
        )
      )
        .then(() => fetchDomainMap())
        .catch(err => alert("❌ Bulk deletion failed: " + err.message));
    };
  
    exportBtn.onclick = () => {
      const userTitles = {};
      Object.entries(domainData).forEach(([certId, entry]) => {
        if (!/^220-|^120|^N10-|^SY0-/.test(certId)) {
          userTitles[certId] = entry;
        }
      });
  
      const blob = new Blob([JSON.stringify(userTitles, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kemmei_user_titles_export_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }
  
  function getCheckedUserCertIds() {
    return Array.from(document.querySelectorAll(".user-template .title-checkbox"))
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.certId);
  }

export { renderDeletePanel, fetchDomainMap };

  