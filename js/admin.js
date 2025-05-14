let certNames = {}, domainMaps = {}, subdomainMaps = {};
window.certNames = certNames;
window.domainMaps = domainMaps;
window.subdomainMaps = subdomainMaps;
import dropdowns from "./dropdowns.js";
window.dropdowns = dropdowns;


async function loadDomainMap() {
  console.log("🔍 loadDomainMap called");
  try {
    const res = await fetch("http://localhost:3000/api/domainmap");
    console.log("🧪 Raw fetch response:", res);

    const data = await res.json();

    // Update local vars
    certNames = data.certNames || {};
    domainMaps = data.domainMaps || {};
    subdomainMaps = data.subdomainMaps || {};

    // Sync with window for global access (e.g. from titmgr)
    window.certNames = certNames;
    window.domainMaps = domainMaps;
    window.subdomainMaps = subdomainMaps;

    console.log("✅ Loaded domain map JSON");
  } catch (err) {
    console.error("❌ Failed to load domainmap.json:", err);
  }
}


window.loadDomainMap = loadDomainMap;

let allCards = [];

function showGlobalMessage(message, type = "info") {
  const el = document.getElementById("globalMessageArea");
  if (!el) return;

  // Clear previous class and set new one
  el.className = `system-message ${type}`;
  el.textContent = message;

  // Show it
  requestAnimationFrame(() => {
    el.classList.remove("hidden");
  });

  // Hide it after 3 sec
  clearTimeout(el._hideTimeout);
  el._hideTimeout = setTimeout(() => {
    el.classList.add("hidden");
  }, 3000);
}

window.showGlobalMessage = showGlobalMessage;

function wireSaveButton(inputId) {
  const saveBtnId = "save" + inputId.replace("Input", "").replace(/^\w/, s => s.toUpperCase());
  const input = document.getElementById(inputId);
  const saveBtn = document.getElementById(saveBtnId);

  if (!input || !saveBtn) {
    console.warn(`Missing input or button for ${inputId}`);
    return;
  }

  saveBtn.addEventListener("click", () => {
    const newValue = input.value.trim();
    if (!newValue) {
      showGlobalMessage("⚠️ Please enter a value.");
      return;
    }

    const exists = [...document.getElementById("certIdSelect").options].some(opt => opt.value === newValue);
    if (exists) {
      showGlobalMessage("⚠️ Title already exists.");
      return;
    }

    if (inputId === "certIdInput") {
      const certId = newValue;

      fetch("http://localhost:3000/api/add-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: certId, title: newValue })
      })
      .then((res) => {
        if (res.status === 409) {
          showGlobalMessage("⚠️ Title already exists.");
          throw new Error("duplicate");
        }
        if (!res.ok) throw new Error("Server responded with " + res.status);
        return res.json();
      })
      .then(() => {
        const select = document.getElementById("certIdSelect");
        const option = new Option(newValue, certId);
        select.appendChild(option);
        select.value = certId;

        input.value = "";
        document.getElementById("certIdInputGroup").style.display = "none";
        document.getElementById("certIdSelectGroup").style.display = "flex";

        showGlobalMessage("✅ New title added.");
        refreshTitleManager?.();

      })
      .catch((err) => {
        if (err.message !== "duplicate") {
          console.error("❌ Unexpected error:", err);
          showGlobalMessage("❌ Failed to add title.");
        }
      });
    }

    // Same structure for domainTitleInput and subdomainIdInput can be added later
  });
}

////////////////////////////////////// DOM CONTENT LOADED ///////////////////////////////////////

console.log("📦 admin.js script running");
document.addEventListener("DOMContentLoaded", () => {
  console.log("🔥 DOMContentLoaded triggered");

  (async () => {
    await loadDomainMap();  // ✅ wait for domain data to load
    console.log("certNames after load:", certNames);  // check it's non-empty

    dropdowns.populateAdminFormDropdownsFromMaps(certNames, domainMaps, subdomainMaps);

 // ✅ now safe to call
    
dropdowns.setupCreateNewSwitch({
  selectId: "subdomainIdSelect",
  inputId: "subdomainIdInput",
  saveBtnId: "saveSubdomainIdBtn",
  cancelBtnId: "cancelSubdomainIdBtn",
});

    dropdowns.wireDomainConfirmCancelButtons();
    dropdowns.wireSubdomainConfirmCancelButtons();

    console.log("📦 certNames at load:", certNames);

  })();

const toggleEditor = document.getElementById("toggleEditor");
const editorPanel = document.getElementById("editorPanel");

const toggleManager = document.getElementById("toggleManager");
const managerPanel = document.getElementById("managerPanel");

toggleEditor.addEventListener("change", () => {
  const isEditorOn = toggleEditor.checked;
  editorPanel.style.display = isEditorOn ? "block" : "none";

  if (isEditorOn) {
    fetchAllCards(); // Only fetch if showing
    // Turn off Manager
    toggleManager.checked = false;
    managerPanel.style.display = "none";
  }
});

toggleManager.addEventListener("change", () => {
  const isManagerOn = toggleManager.checked;
  managerPanel.style.display = isManagerOn ? "block" : "none";

  if (isManagerOn) {
    // Turn off Editor
    toggleEditor.checked = false;
    editorPanel.style.display = "none";

    // 🔥 Now fetch domain map for Title Manager panel
    // fetchDomainMap();
  }
});


const importBtn = document.getElementById("importBtn");
  const clearBtn = document.getElementById("clearBtn");
  const addCardBtn = document.getElementById("addCardBtn");
  const addAnswerBtn = document.getElementById("addAnswerBtn");
  const addImageBtn = document.getElementById("addImageBtn");
  const exportFileBtn = document.getElementById("exportFileBtn");
  const submitBtn = document.getElementById("submitToBackendBtn");

  submitBtn.addEventListener("click", async () => {
    if (cards.length === 0) {
      showGlobalMessage("No cards to submit.");
      return;
    }
  
      // Fetch fresh batch of unique IDs
            if (ids.length !== cards.length) {
        showGlobalMessage("❌ Failed to allocate unique IDs for all cards.");
        return;
      }
  
      for (let i = 0; i < cards.length; i++) {
        cards[i]._id = ids[i];
      }
  
      for (const card of cards) {
        try {
          const res = await fetch("http://localhost:3000/api/cards", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(card)
          });
  
          const result = await res.json();
          if (result.success) {
            console.log("✅ Submitted:", card.question_text);
          } else {
            console.error("❌ Submission failed:", result.error);
          }
        } catch (err) {
          console.error("❌ Network error:", err);
        }
      }
  
      successMessage.textContent = "✔️ Card(s) submitted to backend!";
      successMessage.style.display = "block";
      setTimeout(() => {
        successMessage.style.display = "none";
      }, 2500);
    });
  const cardPreviewList = document.getElementById("cardPreviewList");
  const cardCount = document.getElementById("cardCount");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const cardGrid = document.getElementById("cardGrid");
  const successMessage = document.createElement("p");
  successMessage.id = "submitMessage";
  successMessage.style.color = "green";
  successMessage.style.display = "none";
  submitBtn.insertAdjacentElement("afterend", successMessage);

  const cards = [];

  ["filterCert", "filterDomain", "filterDifficulty", "filterKeyword"].forEach(id => {
    document.getElementById(id).addEventListener("input", applyFilters);
  });


  async function fetchAllCards() {
    try {
      const res = await fetch("http://localhost:3000/api/cards");
      const data = await res.json();
      allCards = data;

populateDropdownFilters(allCards);
generateSuggestions(allCards); 
renderCardGrid(allCards);

// SUBDOMAIN — show input group when "Create new..." selected

const subdomainIdSelect = document.getElementById("subdomainIdSelect");
const subdomainIdInput = document.getElementById("subdomainIdInput");
const subdomainIdInputGroup = document.getElementById("subdomainIdInputGroup");
const subdomainIdSelectGroup = document.getElementById("subdomainIdSelectGroup");

subdomainIdSelect.addEventListener("change", () => {
  if (subdomainIdSelect.value === "create_new") {
    const certId = certIdSelect.value;
    const domainRaw = domainTitleSelect.value;
    const domainId = domainRaw.split(" ")[0]; // expects "1.0 Mobile Devices"
    const nextSubId = getNextSubdomainId(certId, domainId);
    document.getElementById("subdomainIdDisplay").value = nextSubId;

    subdomainIdSelectGroup.style.display = "none";
    subdomainIdInputGroup.style.display = "flex";
    subdomainIdInput.focus();
  }
});


} catch (err) {
      console.error("❌ Failed to load cards:", err);
    }
      }

const certIdInput = document.getElementById("certIdInput");
const certTitleInput = document.getElementById("certTitleInput");
const saveCertBtn = document.getElementById("saveCertBtn");
const cancelCertBtn = document.getElementById("cancelCertBtn");
      
saveCertBtn.addEventListener("click", async () => {
  const certId = certIdInput.value.trim();
  const certTitle = certTitleInput.value.trim();

  // 🔒 Basic input validation
  if (!certId || !certTitle) {
    showGlobalMessage("⚠️ Both ID and title are required.", "warning");
    return;
  }

  // ❌ Check for duplicate ID in dropdown
  const existingIds = [...document.getElementById("certIdSelect").options].map(opt => opt.value);
  if (existingIds.includes(certId)) {
    showGlobalMessage("⚠️ This cert ID already exists.", "warning");
    return;
  }

  try {
    const res = await fetch("http://localhost:3000/api/add-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _id: certId, title: certTitle })
    });

    if (res.status === 409) {
      showGlobalMessage("⚠️ That ID already exists.", "warning");
      return;
    }
    if (!res.ok) throw new Error("Server error " + res.status);

    // 🔄 Refresh updated domain map and dropdowns
await window.refreshAllPanels?.();


    // 🧼 Reset UI
    certIdInput.value = "";
    certTitleInput.value = "";
    document.getElementById("certIdInputGroup").style.display = "none";
    document.getElementById("certIdSelectGroup").style.display = "flex";

    // ✅ Show success
    showGlobalMessage("✅ Title added.", "success");

  } catch (err) {
    console.error("❌ Error adding title:", err);
    showGlobalMessage("❌ Failed to add title.", "error");
  }
});



      cancelCertBtn.addEventListener("click", () => {
        certIdInput.value = "";
        certTitleInput.value = "";
        document.getElementById("certIdInputGroup").style.display = "none";
        document.getElementById("certIdSelectGroup").style.display = "flex";
        document.getElementById("certIdSelect").selectedIndex = 0;
      });
      
   
  const filterKeywordInput = document.getElementById("filterKeyword");
const clearSearchBtn = document.getElementById("clearSearch");

filterKeywordInput.addEventListener("input", () => {
  clearSearchBtn.style.display = filterKeywordInput.value ? "inline" : "none";
});

clearSearchBtn.addEventListener("click", () => {
  filterKeywordInput.value = "";
  clearSearchBtn.style.display = "none";
  applyFilters();
});


function generateSuggestions(cards) {
  const ignore = new Set([
    "the", "in", "is", "what", "of", "a", "to", "for", "and", "which",
    "are", "used", "good", "system", "following", "two", "common", "commonly",
    "how", "can", "be", "with", "at", "by", "an", "on", "it", "as", "this", "that", "all"
  ]);
  const freq = {};
  const tagSet = new Set();

  cards.forEach(card => {
    // From question text
    card.question_text
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // <- remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !ignore.has(word))
      .forEach(word => freq[word] = (freq[word] || 0) + 1);

    // From tags
    (card.tags || []).forEach(tag => tagSet.add(tag.toLowerCase()));
  });

  // Combine top keywords + tags
  const keywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // show more if you want
    .map(([word]) => word);

  const allSuggestions = [...new Set([...keywords, ...tagSet])];

  renderSuggestionChips(allSuggestions);
}
  
  
  function renderSuggestionChips(suggestions) {
    const container = document.getElementById("suggestions");
    container.innerHTML = "";
  
    suggestions.forEach(word => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = word;
      chip.addEventListener("click", () => {
        document.getElementById("filterKeyword").value = word;
        applyFilters();
      });
      container.appendChild(chip);
    });
  }
  
  function populateDropdownFilters(cards) {
    const certSelect = document.getElementById("filterCert");
    const domainSelect = document.getElementById("filterDomain");
    const subdomainSelect = document.getElementById("filterSubdomain");
    const difficultySelect = document.getElementById("filterDifficulty");
  
    const certs = new Set();
    const difficulties = new Set();
  
    cards.forEach(card => {
      card.cert_id.forEach(c => certs.add(c));
      difficulties.add(card.difficulty);
    });
  
    // Certs
    certSelect.innerHTML = `<option value="">All Titles</option>`;
    certs.forEach(c => {
      const option = document.createElement("option");
      option.value = c;
      option.textContent = certNames[c] || c;
      certSelect.appendChild(option);
    });
  
    // Domains will be populated dynamically when cert is selected
    domainSelect.innerHTML = `<option value="">All Domains</option>`;
    domainSelect.disabled = true;
  
    subdomainSelect.innerHTML = `<option value="">All Subdomains</option>`;
    subdomainSelect.disabled = true;
  
    // Difficulties
    difficultySelect.innerHTML = `<option value="">All Difficulty Levels</option>`;
    difficulties.forEach(diff => {
      const option = document.createElement("option");
      option.value = diff.toLowerCase();
      option.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
      difficultySelect.appendChild(option);
    });
  }
  const certSelect = document.getElementById("filterCert");
const domainSelect = document.getElementById("filterDomain");
const subdomainSelect = document.getElementById("filterSubdomain");

certSelect.addEventListener("change", () => {
  const selectedCert = certSelect.value;

  // Reset domains and subdomains
  domainSelect.innerHTML = `<option value="">All domains</option>`;
  subdomainSelect.innerHTML = `<option value="">All Subdomains</option>`;
  domainSelect.disabled = true;
  subdomainSelect.disabled = true;

  if (!selectedCert) return;

  // Get domain usage from current card set
  const domainsUsed = new Set(
    allCards
      .filter(card => card.cert_id.includes(selectedCert))
      .map(card => card.domain_id)
  );

  if (!domainMaps[selectedCert]) return;

  const domainMap = domainMaps[selectedCert];
  Object.entries(domainMap).forEach(([domainId, domainTitle]) => {
    if (domainsUsed.has(domainId)) {
      const opt = document.createElement("option");
      opt.value = domainId;
      opt.textContent = `${domainId} ${domainTitle}`;
      domainSelect.appendChild(opt);
    }
  });

  domainSelect.disabled = domainSelect.options.length <= 1;
});

domainSelect.addEventListener("change", () => {
  const selectedCert = certSelect.value;
  const selectedDomain = domainSelect.value;

  subdomainSelect.innerHTML = `<option value="">All Subdomains</option>`;
  subdomainSelect.disabled = true;

  if (!selectedCert || !selectedDomain || !subdomainMaps[selectedCert]) return;

  // Get subdomain usage
  const subdomainsUsed = new Set(
    allCards
      .filter(card =>
        card.cert_id.includes(selectedCert) &&
        card.domain_id === selectedDomain &&
        card._id && card.question_text // sanity check
      )
      .map(card => {
        // Expect domain_id to be "4.1", "4.2", etc.
        return card.domain_id;
      })
  );

  const subMap = subdomainMaps[selectedCert];
  Object.entries(subMap).forEach(([subId, subTitle]) => {
    if (subId.startsWith(selectedDomain + ".") && subdomainsUsed.has(subId)) {
      const opt = document.createElement("option");
      opt.value = subId;
      opt.textContent = `${subId} ${subTitle}`;
      subdomainSelect.appendChild(opt);
    }
  });

  subdomainSelect.disabled = subdomainSelect.options.length <= 1;
});

  
function applyFilters() {
  const cert = document.getElementById("filterCert").value;
  const domain = document.getElementById("filterDomain").value;
  const difficulty = document.getElementById("filterDifficulty").value;
  const keyword = document.getElementById("filterKeyword").value.toLowerCase();

  let filtered = allCards;

  // Step 1: cert filter
  if (cert) {
    filtered = filtered.filter(card => card.cert_id.includes(cert));
  }

  // Step 2: difficulty filter
  if (difficulty) {
    filtered = filtered.filter(card => card.difficulty === difficulty);
  }

  // Step 3: domain filter
  if (domain) {
    filtered = filtered.filter(card => card.domain_id === domain);
  }

  const subdomain = document.getElementById("filterSubdomain").value;
if (subdomain) {
  filtered = filtered.filter(card => card.subdomain_id === subdomain);
}

  // Step 4: keyword filter
  if (keyword) {
    filtered = filtered.filter(card =>
      card.question_text.toLowerCase().includes(keyword) ||
      (card.tags || []).some(tag => tag.toLowerCase().includes(keyword))
    );
  }

  // 🔁 Always repopulate domain list based on selected cert
  const domainSelect = document.getElementById("filterDomain");
  domainSelect.innerHTML = `<option value="">All domains</option>`;

  if (cert && domainMaps[cert]) {
    const domains = domainMaps[cert];
    Object.entries(domains).forEach(([id, title]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${id} ${title}`;
      domainSelect.appendChild(option);
    });
    domainSelect.disabled = false;
  } else {
    domainSelect.disabled = true;
  }

  renderCardGrid(filtered);
}

    let editingCardId = null; // Tracks if we are editing existing card

  const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");

function updateBulkDeleteButton() {
  if (selectedCardIds.length >= 2) {
    bulkDeleteBtn.style.display = "inline-block";
  } else {
    bulkDeleteBtn.style.display = "none";
  }
}
bulkDeleteBtn.addEventListener("click", async () => {
  if (!confirm(`❗ Are you sure you want to delete ${selectedCardIds.length} cards? This cannot be undone.`)) {
    return;
  }

  try {
    for (const id of selectedCardIds) {
      await fetch(`http://localhost:3000/api/cards/${id}`, {
        method: "DELETE"
      });
    }
    showGlobalMessage("✔️ Selected cards deleted.");
    selectedCardIds = [];
    fetchAllCards(); // Reload
  } catch (err) {
    console.error("❌ Bulk delete failed:", err);
    showGlobalMessage("❌ Failed to delete cards.");
  }
});

function updateSelectAllCheckbox() {
  const allCheckboxes = document.querySelectorAll(".select-card-checkbox");
  const checkedCheckboxes = document.querySelectorAll(".select-card-checkbox:checked");

  selectAllCheckbox.checked = allCheckboxes.length > 0 && allCheckboxes.length === checkedCheckboxes.length;
}

selectAllCheckbox.addEventListener("change", () => {
  const allCheckboxes = document.querySelectorAll(".select-card-checkbox");
  allCheckboxes.forEach(cb => {
    cb.checked = selectAllCheckbox.checked;
    const id = cb.dataset.id;
    if (selectAllCheckbox.checked && !selectedCardIds.includes(id)) {
      selectedCardIds.push(id);
    }
    if (!selectAllCheckbox.checked) {
      selectedCardIds = [];
    }
  });
  updateBulkDeleteButton();
});
function renderCard(card) {
  const cardDiv = document.createElement("div");
  cardDiv.className = "admin-card";
  cardDiv.dataset.id = card._id;

  cardDiv.innerHTML = `
    <div class="card-info">
      <h4>${card.question_text.slice(0, 50)}...</h4>
      <p><strong>Domain:</strong> ${card.domain_id} — ${card.domain_title}</p>
      <p><strong>Difficulty:</strong> ${capitalizeFirstLetter(card.difficulty)}</p>
    </div>
    <div class="card-actions">
      <button class="delete-btn">🗑️ Delete</button>
      <div class="confirm-actions hidden">
        <button class="confirm-btn">✅ Confirm</button>
        <button class="cancel-btn">❌ Cancel</button>
      </div>
    </div>
  `;

  const deleteBtn = cardDiv.querySelector(".delete-btn");
  const confirmActions = cardDiv.querySelector(".confirm-actions");
  const confirmBtn = cardDiv.querySelector(".confirm-btn");
  const cancelBtn = cardDiv.querySelector(".cancel-btn");

  deleteBtn.addEventListener("click", () => {
    deleteBtn.classList.add("hidden");
    confirmActions.classList.remove("hidden");
  });

  cancelBtn.addEventListener("click", () => {
    confirmActions.classList.add("hidden");
    deleteBtn.classList.remove("hidden");
  });

  confirmBtn.addEventListener("click", async () => {
    const cardId = cardDiv.dataset.id;
    try {
      const res = await fetch(`http://localhost:3000/api/cards/${cardId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        cardDiv.remove();
        console.log(`🗑️ Card ${cardId} deleted successfully`);
      } else {
        showGlobalMessage("Failed to delete card.");
      }
    } catch (err) {
      console.error(err);
      showGlobalMessage("Error deleting card.");
    }
  });

  document.getElementById("cardBrowserContainer").appendChild(cardDiv);
}

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function loadCardIntoForm(card) {
  const certIdSelect = document.getElementById("certIdSelect");
  const domainTitleSelect = document.getElementById("domainTitleSelect");
  const subdomainIdSelect = document.getElementById("subdomainIdSelect");

  if (!certIdSelect || !domainTitleSelect || !subdomainIdSelect) {
    console.warn("❌ One or more form dropdowns are missing. Aborting edit.");
    return;
  }

  // 🔁 Populate dropdowns
  certIdSelect.value = Array.isArray(card.cert_id) ? card.cert_id[0] : card.cert_id || "";

  // Match domain by ID
  const domainOpt = [...domainTitleSelect.options].find(opt => opt.value.startsWith(card.domain_id));
  if (domainOpt) domainTitleSelect.value = domainOpt.value;

  // Match subdomain by ID
  const subOpt = [...subdomainIdSelect.options].find(opt => opt.value === card.subdomain_id);
  if (subOpt) subdomainIdSelect.value = subOpt.value;

  // 🔁 Populate text fields
  document.getElementById("difficulty").value = card.difficulty || "easy";
  document.getElementById("questionType").value = card.question_type || "multiple_choice";
  document.getElementById("questionText").value = card.question_text || "";
  document.getElementById("options").value = (card.answer_options || []).join("\n");
  document.getElementById("correctAnswers").value = (Array.isArray(card.correct_answer) ? card.correct_answer : [card.correct_answer]).join("\n");
  document.getElementById("explanation").value = card.explanation || "";
  document.getElementById("tags").value = (card.tags || []).join(", ");
  document.getElementById("status").value = card.status || "approved";

  editingCardId = card._id;

  // Toggle buttons
  document.getElementById("addCardBtn").style.display = "none";
  document.getElementById("submitToBackendBtn").style.display = "none";
  document.getElementById("saveChangesBtn").style.display = "inline-block";
  document.getElementById("cancelEditBtn").style.display = "inline-block";

  console.log("📝 Loaded card for editing:", card);
}

  
  const saveChangesBtn = document.getElementById("saveChangesBtn");

saveChangesBtn.addEventListener("click", async () => {
  if (!editingCardId) return;

  const updatedCard = collectFormData();
  
  try {
    const res = await fetch(`http://localhost:3000/api/cards/${editingCardId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatedCard)
    });

    const result = await res.json();
    if (result.success) {
      showGlobalMessage("✔️ Card updated successfully!");
      // Reset
      editingCardId = null;
      saveChangesBtn.style.display = "none";
      document.getElementById("addCardBtn").style.display = "inline-block";
      document.getElementById("submitToBackendBtn").style.display = "inline-block";
      clearForm();
      fetchAllCards(); // Reload cards
    } else {
      showGlobalMessage("❌ Failed to update card.");
    }
  } catch (err) {
    console.error("❌ Network error updating card:", err);
  }
});

function collectFormData() {
  const cert_id_raw = document.getElementById("certIdSelect").value === "create_new"
  ? document.getElementById("certIdInput").value.trim()
  : document.getElementById("certIdSelect").value;

const domainTitleSelect = document.getElementById("domainTitleSelect");
const subdomainIdSelect = document.getElementById("subdomainIdSelect");
const domain_id_raw = domainTitleSelect.value.split(" ")[0];

const domain_title_raw = document.getElementById("domainTitleSelect").value === "create_new"
  ? document.getElementById("domainTitleInput").value.trim()
  : document.getElementById("domainTitleSelect").value;

const subdomain_id_raw = document.getElementById("subdomainIdSelect").value === "create_new"
  ? document.getElementById("subdomainIdInput").value.trim()
  : document.getElementById("subdomainIdSelect").value;
  return {
    cert_id: [cert_id_raw],
    domain_id: domain_id_raw,
    domain_title: domain_title_raw,
    subdomain_id: subdomain_id_raw,
    difficulty: document.getElementById("difficulty").value,
    question_type: document.getElementById("questionType").value,
    question_text: document.getElementById("questionText").value.trim(),
    answer_options: document.getElementById("options").value.split("\n").map(x => x.trim()),
    correct_answer: document.getElementById("correctAnswers").value.split("\n").map(x => x.trim()),
    explanation: document.getElementById("explanation").value.trim(),
    tags: document.getElementById("tags").value.split(",").map(x => x.trim()),
    status: document.getElementById("status").value.trim()
  };
 
}

function clearForm() {
  const form = document.getElementById("cardForm");
  if (form) form.reset(); // If you're wrapping the whole form (optional)

  // Text inputs and textareas
  ["questionText", "options", "correctAnswers", "explanation", "tags"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // Dropdowns: difficulty, questionType, status
  ["difficulty", "questionType", "status"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.selectedIndex = 0;
  });

  // Create-mode fields
  ["certIdInput", "domainIdInput", "domainTitleInput", "subdomainIdInput"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // Dropdown selects for cert/domain/subdomain
  ["certIdSelect", "domainTitleSelect", "subdomainIdSelect"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.selectedIndex = 0;
      sel.dispatchEvent(new Event("change"));
    }
  });

  console.log("🧹 Full left panel cleared");
}



cancelEditBtn.addEventListener("click", () => {
  editingCardId = null;
  clearForm();

  // Restore normal buttons
  document.getElementById("saveChangesBtn").style.display = "none";
  document.getElementById("cancelEditBtn").style.display = "none";
  document.getElementById("addCardBtn").style.display = "inline-block";
  document.getElementById("submitToBackendBtn").style.display = "inline-block";
});

    
  
let selectedCardIds = [];

function renderCardGrid(cards) {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";

  selectedCardIds = []; // Reset selection

  cards.forEach(card => {
    const div = document.createElement("div");
    div.className = "card-thumb";

    div.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; position: relative;">
        <div style="flex-grow: 1;">
          <p class="question-text">${card.question_text}</p>
          <p class="meta">${card.cert_id.join(", ")} | ${card.domain_id} | ${card.difficulty}</p>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 0.5rem;">
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="edit-card" data-id="${card._id}">Edit</button>
            <div class="delete-wrapper">
              <button class="delete-card" data-id="${card._id}">Delete</button>
              <div class="confirm-cancel hidden">
               <button class="confirm-btn">✔ Confirm</button>
               <button class="cancel-btn">✖ Cancel</button>
              </div>
            </div>
          </div>
          <input type="checkbox" class="select-card-checkbox" data-id="${card._id}" />
        </div>
      </div>
    `;

    const editBtn = div.querySelector(".edit-card");
    editBtn.addEventListener("click", () => {
      loadCardIntoForm(card);
    });

    const checkbox = div.querySelector(".select-card-checkbox");
    checkbox.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) {
        selectedCardIds.push(id);
        div.classList.add("selected");
      } else {
        selectedCardIds = selectedCardIds.filter(cardId => cardId !== id);
        div.classList.remove("selected");
      }
      updateBulkDeleteButton();
      updateSelectAllCheckbox();
    });

    // NEW: Single delete handling
    const deleteBtn = div.querySelector(".delete-card");
    const confirmCancelDiv = div.querySelector(".confirm-cancel");

    deleteBtn.addEventListener("click", () => {
      deleteBtn.classList.add("hidden");
      confirmCancelDiv.classList.remove("hidden");
    });

    confirmCancelDiv.querySelector(".cancel-btn").addEventListener("click", () => {
      confirmCancelDiv.classList.add("hidden");
      deleteBtn.classList.remove("hidden");
    });

    confirmCancelDiv.querySelector(".confirm-btn").addEventListener("click", async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/cards/${card._id}`, {
          method: "DELETE"
        });
        if (res.ok) {
          div.remove();
          console.log(`🗑️ Deleted ${card._id}`);
        } else {
          showGlobalMessage("❌ Failed to delete card.");
        }
      } catch (err) {
        console.error(err);
        showGlobalMessage("❌ Network error deleting card.");
      }
    });

    grid.appendChild(div);
  });

  updateBulkDeleteButton();
  updateSelectAllCheckbox();
}

  async function fetchNextCardIds(count) {
    try {
      const res = await fetch(`http://localhost:3000/api/cards/next-ids/${count}`);
      const ids = await res.json();
      return ids;
    } catch (err) {
      console.error("⚠️ Failed to fetch next card IDs:", err);
      return Array.from({ length: count }, (_, i) => "Q9" + i); // Fallback IDs
    }
  }

  importBtn.addEventListener("click", () => {
    try {
      const jsonInput = document.getElementById("jsonInput").value.trim();
      const data = JSON.parse(jsonInput);

      document.getElementById("certIdSelect").value = Array.isArray(data.cert_id)
      ? data.cert_id[0] || ""
      : data.cert_id || "";
        document.getElementById("domainIdSelect").value = data.domain_id || "";
    document.getElementById("domainTitleSelect").value = data.domain_title || "";
    document.getElementById("subdomainIdSelect").value = data.subdomain_id || "";

      const difficultySelect = document.getElementById("difficulty");
      const difficultyValue = (data.difficulty || "easy").toLowerCase();
      difficultySelect.value = [...difficultySelect.options].some(opt => opt.value === difficultyValue)
        ? difficultyValue
        : "easy";

      const questionTypeSelect = document.getElementById("questionType");
      const typeValue = (data.question_type || "multiple_choice").toLowerCase();
      questionTypeSelect.value = [...questionTypeSelect.options].some(opt => opt.value === typeValue)
        ? typeValue
        : "multiple_choice";

      document.getElementById("questionText").value = data.question_text || "";
      document.getElementById("options").value = (data.answer_options || []).join("\n");

      const correct = Array.isArray(data.correct_answer)
        ? data.correct_answer
        : [data.correct_answer];
      document.getElementById("correctAnswers").value = correct.join("\n");

      document.getElementById("explanation").value = data.explanation || "";
      document.getElementById("tags").value = (data.tags || []).join(", ");
      document.getElementById("status").value = data.status || "";
    } catch (err) {
      showGlobalMessage("Invalid JSON: " + err.message);
    }
  });

  clearBtn.addEventListener("click", () => {
    document.getElementById("jsonInput").value = "";
    document.getElementById("cardForm").reset();
  });

  addCardBtn.addEventListener("click", () => {
    const data = collectFormData();
    if (!data.cert_id[0] || !data.question_text) {
      showGlobalMessage("❗ Please enter at least a title and a question.");
      return;
    }
  
    cards.push(data);
    renderCardPreviews();
  });
  
  function formatType(type) {
    switch (type) {
      case "multiple_choice": return "Multiple Choice";
      case "select_multiple": return "Select Multiple";
      case "select_all": return "Select All That Apply";
      case "pbq": return "Performance-Based (PBQ)";
      default: return type;
    }
  }

  function renderCardPreviews() {
    cardPreviewList.innerHTML = "";
    cards.forEach(card => {
      const div = document.createElement("div");
      div.className = "card-preview";
      div.innerHTML = `
        <h4>${card.question_text}</h4>
        <p><strong>Type:</strong> ${formatType(card.question_type)}</p>
        <p><strong>Answers:</strong> ${Array.isArray(card.correct_answer) ? card.correct_answer.join(", ") : card.correct_answer}</p>
        <p><strong>Domain:</strong> ${card.domain_title} (${card.domain_id}${card.subdomain_id ? " → " + card.subdomain_id : ""})</p>
        <p><strong>Difficulty:</strong> ${card.difficulty}</p>
      `;
      cardPreviewList.appendChild(div);
    });

    cardCount.textContent = `Cards created: ${cards.length}`;
  }

  exportFileBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kemmei_cards_export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  addAnswerBtn.addEventListener("click", () => {
    showGlobalMessage("💡 You can add answers directly by typing each on a new line in the Options + Correct Answers fields.");
  });

  addImageBtn.addEventListener("click", () => {
    showGlobalMessage("🖼️ Image support coming soon. For now, you can manually append image URLs to the question or options.");
  });

});

window.refreshAllPanels = async function () {
  await loadDomainMap();
  dropdowns.populateAdminFormDropdownsFromMaps(certNames, domainMaps, subdomainMaps);
  refreshTitleManager?.();
};
