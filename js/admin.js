// Admin Access Control - Check if user has admin role
document.addEventListener("DOMContentLoaded", () => {
  const userId = localStorage.getItem("userId");
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");

  if (!userId || !email || !role) {
    // Redirect to login if not authenticated
    alert("You must be logged in to access the admin panel.");
    window.location.href = "index.html";
    return;
  }

  if (role !== "admin") {
    // Redirect to dashboard if not admin
    alert("Access denied. Admin privileges required.");
    window.location.href = "dashboard.html";
    return;
  }

  console.log(`✅ Admin access granted for user: ${userId}`);
});

let certNames = {}, domainMaps = {}, subdomainMaps = {};
window.certNames = certNames;
window.domainMaps = domainMaps;
window.subdomainMaps = subdomainMaps;
import dropdowns from "./dropdowns.js";
window.dropdowns = dropdowns;


async function loadDomainMap() {
  console.log("🔍 loadDomainMap called");
  try {
  const res = await fetch("/api/domainmap");
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

// Add covmap loader function
let covMap = {};

async function loadCovMap() {
  console.log("🔍 loadCovMap called");
  try {
    const res = await fetch("data/covmap.json");
    const data = await res.json();
    covMap = data;
    window.covMap = covMap;
    console.log("✅ Loaded covmap JSON");
  } catch (err) {
    console.error("❌ Failed to load covmap.json:", err);
  }
}


window.loadDomainMap = loadDomainMap;

let allCards = [];

// Tag validation function for covmap - requires at least one match
function validateCardTags(card) {
  console.log("🔍 validateCardTags running for:", card.question_text?.slice(0, 30));
  
  // Skip validation if no covmap loaded
  if (!covMap || Object.keys(covMap).length === 0) {
    console.warn("⚠️ Covmap not loaded, skipping tag validation");
    return { valid: true, message: "Covmap not available" };
  }

  const certId = Array.isArray(card.cert_id) ? card.cert_id[0] : card.cert_id;
  const domainId = card.domain_id;
  const subdomainId = card.subdomain_id;
  const tags = Array.isArray(card.tags) ? card.tags : [];

  // If no tags, that's a failure
  if (tags.length === 0) {
    return { valid: false, message: "❌ No tags provided - cards must have at least one tag matching covmap terms" };
  }

  // Check if cert/domain/subdomain exists in covmap
  const certData = covMap[certId];
  if (!certData) {
    return { valid: true, message: `Cert ${certId} not found in covmap - tags not validated` };
  }

  const domainData = certData[domainId];
  if (!domainData) {
    return { valid: true, message: `Domain ${domainId} not found in covmap - tags not validated` };
  }

  const subdomainData = domainData[subdomainId];
  if (!subdomainData || !subdomainData.concepts) {
    return { valid: true, message: `Subdomain ${subdomainId} not found in covmap - tags not validated` };
  }

  // Collect all terms from all concepts in this subdomain
  const allTerms = new Set();
  Object.values(subdomainData.concepts).forEach(concept => {
    if (concept.terms && Array.isArray(concept.terms)) {
      concept.terms.forEach(term => allTerms.add(term.toLowerCase()));
    }
  });

  // Check for exact matches
  const exactMatches = tags.filter(tag => allTerms.has(tag.toLowerCase()));
  console.log("🎯 Exact matches:", exactMatches);
  
  // Check for partial matches (tag contains or is contained in a covmap term)
  const partialMatches = tags.filter(tag => {
    if (exactMatches.includes(tag)) return false; // Skip already exact-matched tags
    const tagLower = tag.toLowerCase();
    const matches = Array.from(allTerms).some(term => {
      const isPartialMatch = tagLower.includes(term) || term.includes(tagLower);
      if (isPartialMatch) {
        console.log(`🔍 Partial match found: "${tag}" <-> "${term}"`);
      }
      return isPartialMatch;
    });
    return matches;
  });
  console.log("🎯 Partial matches:", partialMatches);

  console.log("📋 All available terms:", Array.from(allTerms).slice(0, 15));

  const totalMatches = exactMatches.length + partialMatches.length;
  const unmatchedTags = tags.filter(tag => 
    !exactMatches.includes(tag) && !partialMatches.includes(tag)
  );

  // REQUIRE at least one match (exact or partial) - BUT be more lenient
  if (totalMatches > 0) {
    let message = `✅ Tags validated: `;
    if (exactMatches.length > 0) {
      message += `exact matches [${exactMatches.join(", ")}]`;
    }
    if (partialMatches.length > 0) {
      message += exactMatches.length > 0 ? `, partial matches [${partialMatches.join(", ")}]` : `partial matches [${partialMatches.join(", ")}]`;
    }
    if (unmatchedTags.length > 0) {
      message += ` ⚠️ unmatched [${unmatchedTags.join(", ")}]`;
    }
    return { valid: true, message };
  } else {
    // No matches at all - WARN but don't fail (more lenient approach)
    const availableTerms = Array.from(allTerms).slice(0, 8).join(", ");
    console.warn(`⚠️ No covmap matches for ${certId}/${domainId}/${subdomainId}, but allowing card anyway`);
    return { 
      valid: true, // Changed back to true - let Concur handle categorization
      message: `⚠️ No covmap matches found for ${certId}/${domainId}/${subdomainId}. Your tags: [${tags.join(", ")}]. Consider using: ${availableTerms}...` 
    };
  }
}

function isValidCard(card) {
  console.log("🔍 Validating card:", card.question_text?.slice(0, 50) + "...");
  
  const validTypes = ["multiple_choice", "select_multiple", "select_all", "pbq"];
  const validDiff = ["easy", "medium", "hard"];
  
  // Basic structure validation
  const basicValid = (
    Array.isArray(card.cert_id) &&
    typeof card.domain_id === "string" &&
    typeof card.domain_title === "string" &&
    typeof card.subdomain_id === "string" &&
    typeof card.question_text === "string" &&
    validTypes.includes(card.question_type) &&
    validDiff.includes(card.difficulty) &&
    Array.isArray(card.answer_options) && card.answer_options.length >= 2 &&
    Array.isArray(card.correct_answer) && card.correct_answer.length >= 1
  );

  console.log("📊 Basic validation result:", basicValid);
  if (!basicValid) {
    console.log("❌ Failed basic validation:");
    console.log("  cert_id array:", Array.isArray(card.cert_id));
    console.log("  domain_id string:", typeof card.domain_id === "string");
    console.log("  domain_title string:", typeof card.domain_title === "string");
    console.log("  subdomain_id string:", typeof card.subdomain_id === "string");
    console.log("  question_text string:", typeof card.question_text === "string");
    console.log("  valid question_type:", validTypes.includes(card.question_type));
    console.log("  valid difficulty:", validDiff.includes(card.difficulty));
    console.log("  answer_options array >= 2:", Array.isArray(card.answer_options) && card.answer_options.length >= 2);
    console.log("  correct_answer array >= 1:", Array.isArray(card.correct_answer) && card.correct_answer.length >= 1);
    return false;
  }

  // Tag validation - now requires at least one match
  const tagValidation = validateCardTags(card);
  console.log("🏷️ Tag validation result:", tagValidation);
  
  if (!tagValidation.valid) {
    console.log("❌ Card failed tag validation:", tagValidation.message);
    return false;
  }
  
  console.log("✅ Card passed validation");
  return true;
}

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

  fetch("/api/add-title", {
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

  // Move the bulkImportStatus element above the JSON input field
  const jsonInput = document.getElementById("jsonInput");
  const bulkStatus = document.getElementById("bulkImportStatus");
  if (jsonInput && bulkStatus) {
    jsonInput.parentNode.insertBefore(bulkStatus, jsonInput);
  }

  (async () => {
    await loadDomainMap();  // ✅ wait for domain data to load
    await loadCovMap();     // ✅ wait for covmap data to load
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

const toggleDeletedMode = document.getElementById("toggleDeletedMode");
toggleDeletedMode.addEventListener("change", () => {
  fetchAllCards(toggleDeletedMode.checked);
});

const toggleEditor = document.getElementById("toggleEditor");
const editorPanel = document.getElementById("editorPanel");

const toggleManager = document.getElementById("toggleManager");
const managerPanel = document.getElementById("managerPanel");

toggleEditor.addEventListener("change", () => {
  const isEditorOn = toggleEditor.checked;
  editorPanel.style.display = isEditorOn ? "block" : "none";

  if (isEditorOn) {
    fetchAllCards(toggleDeletedMode.checked);

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

const bulkSubmitBtn = document.getElementById("bulkSubmitBtn");

bulkSubmitBtn.addEventListener("click", async () => {
  if (cards.length === 0) {
    showGlobalMessage("❗ No cards to submit.");
    return;
  }

  try {
  const res = await fetch("/api/cards/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cards)
    });

    const result = await res.json();
    if (result.success) {
      showGlobalMessage(`✅ ${result.inserted} cards submitted!`);
      cards.length = 0;
      cardCount.textContent = "Cards created: 0";
      document.getElementById("jsonInput").value = "";
      document.getElementById("bulkImportStatus").classList.add("hidden");
      fetchAllCards();
    } else {
      showGlobalMessage("❌ Bulk submission failed: " + result.error);
    }
  } catch (err) {
    console.error("❌ Network error during bulk submit:", err);
    showGlobalMessage("❌ Network error submitting cards.");
  }
});


  submitBtn.addEventListener("click", async () => {
    if (cards.length === 0) {
      showGlobalMessage("No cards to submit.");
      return;
    }
  
      for (const card of cards) {
        try {
          const res = await fetch("/api/cards", {
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

      // 🔁 Reset all inputs except dropdowns
["questionText", "options", "correctAnswers", "explanation", "tags"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.value = "";
});

// Reset difficulty, question type, status
["difficulty", "questionType", "status"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.selectedIndex = 0;
});

document.getElementById("jsonInput").value = "";

fetchAllCards(); // 🔁 Refresh card browser grid


// ✅ Clear card preview list
cardPreviewList.innerHTML = "";
cards.length = 0;
cardCount.textContent = "Cards created: 0";

  
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

["filterCert", "filterDomain", "filterSubdomain", "filterDifficulty", "filterKeyword"].forEach(id => {
  document.getElementById(id).addEventListener("input", applyFilters);
});


async function fetchAllCards(showDeleted = false) {
  try {
    const url = showDeleted
  ? "/api/cards?include_deleted=true"
  : "/api/cards";

    const res = await fetch(url);
    const data = await res.json();

    allCards = showDeleted
      ? data.filter(card => card.status === "deleted")
      : data.filter(card => card.status !== "deleted");

    populateDropdownFilters(allCards);
    generateSuggestions(allCards);
    renderCardGrid(allCards, showDeleted);

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
    showGlobalMessage("❌ Failed to load cards from backend", "error");
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
  const res = await fetch("/api/add-title", {
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

  // Combine top keywords + tags, then limit to 20
  const keywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  const allSuggestions = [...new Set([...keywords, ...tagSet])].slice(0, 20);

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

  // ✅ Get list of used subdomain IDs under this domain
  const subdomainsUsed = new Set(
    allCards
      .filter(card =>
        card.cert_id.includes(selectedCert) &&
        card.domain_id === selectedDomain &&
        card.subdomain_id && card._id && card.question_text
      )
      .map(card => card.subdomain_id)
  );

  const subMap = subdomainMaps[selectedCert]?.[selectedDomain];
  if (!subMap) return;

  const currentSelectedSub = subdomainSelect.value;

  Object.entries(subMap).forEach(([subId, subTitle]) => {
    if (subdomainsUsed.has(subId)) {
      const opt = new Option(`${subId} ${subTitle}`, subId);
      subdomainSelect.appendChild(opt);
    }
  });

  // ➕ Always add "Create new..."
  const createNew = new Option("➕ Create new...", "create_new");
  subdomainSelect.appendChild(createNew);

  // ✅ Restore previous selection if it's still valid
  if ([...subdomainSelect.options].some(opt => opt.value === currentSelectedSub)) {
    subdomainSelect.value = currentSelectedSub;
  }

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
  console.log("🎯 Cert filter:", cert, "| remaining:", filtered.length);
}

// Step 2: domain filter
if (domain) {
  filtered = filtered.filter(card => card.domain_id === domain);
  console.log("🎯 Domain filter:", domain, "| remaining:", filtered.length);
}

// Step 3: subdomain filter
const selectedSub = document.getElementById("filterSubdomain").value;
if (selectedSub) {
  console.log("🎯 Subdomain filter:", selectedSub);
  filtered = filtered.filter(card => {
    const match = card.subdomain_id === selectedSub;
    console.log(`   - ${card.subdomain_id} === ${selectedSub} → ${match}`);
    return match;
  });
  console.log("🔎 Subdomain-filtered cards:", filtered.length);
}

// Step 4: difficulty filter
if (difficulty) {
  filtered = filtered.filter(card => card.difficulty === difficulty);
  console.log("🎯 Difficulty filter:", difficulty, "| remaining:", filtered.length);
}

// Step 5: keyword filter
if (keyword) {
  filtered = filtered.filter(card =>
    card.question_text.toLowerCase().includes(keyword) ||
    (card.tags || []).some(tag => tag.toLowerCase().includes(keyword))
  );
  console.log("🎯 Keyword filter:", keyword, "| remaining:", filtered.length);
}


// 🔁 Always repopulate domain list based on selected cert
const domainSelect = document.getElementById("filterDomain");
const currentSelectedDomain = domainSelect.value;

domainSelect.innerHTML = `<option value="">All domains</option>`;

if (cert && domainMaps[cert]) {
  const domains = domainMaps[cert];
  Object.entries(domains).forEach(([id, title]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${id} ${title}`;
    domainSelect.appendChild(option);
  });

  // ✅ Restore previously selected domain (if it's still in list)
  if ([...domainSelect.options].some(opt => opt.value === currentSelectedDomain)) {
    domainSelect.value = currentSelectedDomain;
  }

  domainSelect.disabled = false;
} else {
  domainSelect.disabled = true;
}

// 🔁 Always repopulate subdomain list based on selected domain
const subdomainSelect = document.getElementById("filterSubdomain");
const currentSelectedSub = subdomainSelect.value;

subdomainSelect.innerHTML = `<option value="">All Subdomains</option>`;

if (cert && domain && subdomainMaps[cert]?.[domain]) {
  const subMap = subdomainMaps[cert][domain];

const subdomainsUsed = new Set(
  allCards
    .filter(card => card.cert_id.includes(cert) && card.domain_id === domain)
    .map(card => card.subdomain_id)
    .filter(Boolean)
);


  Object.entries(subMap).forEach(([subId, subTitle]) => {
    if (subdomainsUsed.has(subId)) {
      const opt = new Option(`${subId} ${subTitle}`, subId);
      subdomainSelect.appendChild(opt);
    }
  });

  const createNew = new Option("➕ Create new...", "create_new");
  subdomainSelect.appendChild(createNew);

  if ([...subdomainSelect.options].some(opt => opt.value === currentSelectedSub)) {
    subdomainSelect.value = currentSelectedSub;
  }

  subdomainSelect.disabled = false;
} else {
  subdomainSelect.disabled = true;
}
console.log("🔍 Filtered cards:", filtered.map(c => `${c.domain_id} / ${c.subdomain_id} / ${c.question_text}`));

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
  if (selectedCardIds.length < 1) return;

  const isTrashMode = toggleDeletedMode.checked;
  const action = isTrashMode ? "Restore" : "Delete";
  const messageEl = document.getElementById("cardBrowserMessage");
  if (!messageEl) return;

  messageEl.innerHTML = `
    <strong>⚠️ ${action} ${selectedCardIds.length} selected cards?</strong>
    <button id="confirmBulkActionBtn" style="margin-left: 1rem;">✅ Confirm</button>
    <button id="cancelBulkActionBtn">✖ Cancel</button>
  `;
  messageEl.className = "system-message warning";
  messageEl.classList.remove("hidden");

  document.getElementById("cancelBulkActionBtn").addEventListener("click", () => {
    messageEl.classList.add("hidden");
  });

  document.getElementById("confirmBulkActionBtn").addEventListener("click", async () => {
    const backup = allCards.filter(card => selectedCardIds.includes(card._id));

    try {
      for (const card of backup) {
  const endpoint = `/api/cards/${card._id}`;
        if (isTrashMode) {
          await fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "approved" })
          });
        } else {
          await fetch(endpoint, { method: "DELETE" });
        }
      }

      messageEl.innerHTML = isTrashMode
        ? `✅ ${selectedCardIds.length} cards restored.`
        : `🗑️ ${selectedCardIds.length} cards deleted. <button id="undoDeleteBtn">Undo</button>`;
      messageEl.className = "system-message success";

      if (!isTrashMode) {
        const undoTimer = setTimeout(() => {
          messageEl.classList.add("hidden");
        }, 7000);

        document.getElementById("undoDeleteBtn").addEventListener("click", async () => {
          clearTimeout(undoTimer);
          for (const card of backup) {
            await fetch("/api/cards", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(card)
            });
          }
          selectedCardIds = [];
          messageEl.textContent = "✅ Cards restored!";
          fetchAllCards(toggleDeletedMode.checked);
          setTimeout(() => messageEl.classList.add("hidden"), 3000);
        });
      } else {
        setTimeout(() => messageEl.classList.add("hidden"), 3000);
      }

      selectedCardIds = [];
      fetchAllCards(toggleDeletedMode.checked);

    } catch (err) {
      console.error("❌ Bulk action failed:", err);
      messageEl.className = "system-message error";
      messageEl.textContent = `❌ Failed to ${action.toLowerCase()} cards.`;
    }
  });
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
  const res = await fetch(`/api/cards/${cardId}`, {
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

async function loadCardIntoForm(card) {
  const certIdSelect = document.getElementById("certIdSelect");
  const domainTitleSelect = document.getElementById("domainTitleSelect");
  const subdomainIdSelect = document.getElementById("subdomainIdSelect");

  if (!certIdSelect || !domainTitleSelect || !subdomainIdSelect) {
    console.warn("❌ Dropdowns missing");
    return;
  }

  const certId = Array.isArray(card.cert_id) ? card.cert_id[0] : card.cert_id;
  const domainId = card.domain_id;
  const subdomainId = card.subdomain_id;

  // 1. Set cert and trigger domain population
  certIdSelect.value = certId;
  certIdSelect.dispatchEvent(new Event("change"));

  // 2. Wait until domain dropdown is populated
  await waitUntilOption(domainTitleSelect, domainId);

  // 3. Set domain
  domainTitleSelect.value = [...domainTitleSelect.options].find(opt => opt.value.startsWith(domainId))?.value || "";
  domainTitleSelect.dispatchEvent(new Event("change"));

  // 4. Wait until subdomain dropdown is populated
  await waitUntilOption(subdomainIdSelect, subdomainId);

  // 5. Set subdomain
  subdomainIdSelect.value = subdomainId;

  // 6. Fill in form fields
  document.getElementById("difficulty").value = card.difficulty || "easy";
  document.getElementById("questionType").value = card.question_type || "multiple_choice";
  document.getElementById("questionText").value = card.question_text || "";
  document.getElementById("options").value = (card.answer_options || []).join("\n");
  document.getElementById("correctAnswers").value = (Array.isArray(card.correct_answer) ? card.correct_answer : [card.correct_answer]).join("\n");
  document.getElementById("explanation").value = card.explanation || "";
  document.getElementById("tags").value = (card.tags || []).join(", ");
  document.getElementById("status").value = card.status || "approved";

  editingCardId = card._id;
  document.getElementById("addCardBtn").style.display = "none";
  document.getElementById("submitToBackendBtn").style.display = "none";
  document.getElementById("saveChangesBtn").style.display = "inline-block";
  document.getElementById("cancelEditBtn").style.display = "inline-block";

  console.log("📝 Loaded card for editing:", card);
}

function waitUntilOption(selectEl, matchId, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      const found = [...selectEl.options].some(opt => opt.value === matchId || opt.value.startsWith(matchId + " "));
      if (found) return resolve();
      if (Date.now() - start > timeout) return reject(`❌ Option ${matchId} not found in ${selectEl.id}`);
      setTimeout(check, 50);
    })();
  });
}


  
  const saveChangesBtn = document.getElementById("saveChangesBtn");

saveChangesBtn.addEventListener("click", async () => {
  if (!editingCardId) return;

  const updatedCard = collectFormData();
  
  try {
  const res = await fetch(`/api/cards/${editingCardId}`, {
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

function renderCardGrid(cards, isDeletedMode = false) {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";
  selectedCardIds = [];
  bulkDeleteBtn.textContent = isDeletedMode ? "♻️ Restore Selected" : "🗑️ Delete Selected";

  // Pagination state
  const maxToShow = 6;
  let shownCount = 0;

  function renderBatch() {
    // Render next batch of cards
    const batch = cards.slice(shownCount, shownCount + maxToShow);
    batch.forEach(card => {
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
                ${isDeletedMode
                  ? `
                    <button class="restore-card" data-id="${card._id}">♻️ Restore</button>
                    <button class="delete-forever-card" data-id="${card._id}">💀 Delete Forever</button>
                  `
                  : `
                    <button class="delete-card" data-id="${card._id}">Delete</button>
                    <div class="confirm-cancel hidden">
                      <button class="confirm-btn">✔ Confirm</button>
                      <button class="cancel-btn">✖ Cancel</button>
                    </div>
                  `}
              </div>
            </div>
            <input type="checkbox" class="select-card-checkbox" data-id="${card._id}" />
          </div>
        </div>
      `;

      // Edit button
      div.querySelector(".edit-card").addEventListener("click", () => {
        loadCardIntoForm(card);
      });

      // Checkbox selection
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

      if (isDeletedMode) {
        // ♻️ Restore
        div.querySelector(".restore-card").addEventListener("click", async () => {
          try {
            await fetch(`/api/cards/${card._id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "approved" })
            });
            showGlobalMessage("♻️ Card restored!", "success");
            fetchAllCards(true);
          } catch (err) {
            console.error("❌ Restore failed:", err);
            showGlobalMessage("❌ Failed to restore card.", "error");
          }
        });

        // 💀 Delete Forever
        div.querySelector(".delete-forever-card")?.addEventListener("click", async () => {
          if (!confirm("⚠️ This will permanently delete the card. Are you sure?")) return;

          try {
            const res = await fetch(`/api/cards/${card._id}/permanent`, {
              method: "DELETE"
            });
            if (res.ok) {
              showGlobalMessage("💀 Card permanently deleted.", "success");
              fetchAllCards(true);
            } else {
              showGlobalMessage("❌ Failed to delete forever.", "error");
            }
          } catch (err) {
            console.error("❌ Delete forever failed:", err);
            showGlobalMessage("❌ Network error.", "error");
          }
        });

      } else {
        // 🗑️ Soft delete
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
            const res = await fetch(`/api/cards/${card._id}`, {
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
      }

      grid.appendChild(div);
    });
    shownCount += batch.length;
  }

  // Initial batch
  renderBatch();
  updateBulkDeleteButton();
  updateSelectAllCheckbox();

  // Add "Show more" button if needed
  if (shownCount < cards.length) {
    const showMoreBtn = document.createElement("button");
    showMoreBtn.textContent = `Show more (${cards.length - shownCount} more)`;
    showMoreBtn.className = "btn primary";
    showMoreBtn.style.margin = "1rem auto";
    showMoreBtn.style.display = "block";
    showMoreBtn.onclick = () => {
      showMoreBtn.remove();
      renderBatch();
      if (shownCount < cards.length) {
        grid.appendChild(showMoreBtn);
        showMoreBtn.textContent = `Show more (${cards.length - shownCount} more)`;
      }
      updateBulkDeleteButton();
      updateSelectAllCheckbox();
    };
    grid.appendChild(showMoreBtn);
  }
}



  async function fetchNextCardIds(count) {
    try {
  const res = await fetch(`/api/cards/next-ids/${count}`);
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

      // Populate domain dropdown by matching ID prefix
const domainSelect = document.getElementById("domainTitleSelect");
const domainOpt = [...domainSelect.options].find(opt => opt.value.startsWith(data.domain_id));
if (domainOpt) domainSelect.value = domainOpt.value;

// Populate subdomain dropdown directly
const subdomainSelect = document.getElementById("subdomainIdSelect");
const subOpt = [...subdomainSelect.options].find(opt => opt.value === data.subdomain_id);
if (subOpt) subdomainSelect.value = subOpt.value;


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

document.getElementById("importManyBtn").addEventListener("click", () => {
  const jsonInput = document.getElementById("jsonInput").value.trim();
  const bulkStatus = document.getElementById("bulkImportStatus");
  bulkStatus.classList.add("hidden");

  try {
    const parsed = JSON.parse(jsonInput);
    const data = Array.isArray(parsed) ? parsed : [parsed];

    const valid = [];
    const invalid = [];
    const tagWarnings = [];

    data.forEach((card, index) => {
      if (isValidCard(card)) {
        valid.push(card);
        
        // Check tag validation for informational warnings only
        const tagValidation = validateCardTags(card);
        if (tagValidation.message.includes("⚠️") || tagValidation.message.includes("unmatched")) {
          const cardPreview = card.question_text ? card.question_text.slice(0, 40) + "..." : `Card ${index + 1}`;
          tagWarnings.push(`${cardPreview} - ${tagValidation.message}`);
        }
      } else {
        invalid.push(card);
      }
    });

    // Push only valid cards to buffer
    cards.push(...valid);

    // Show summary with tag warnings (but not errors)
    const messages = [
      `✅ ${valid.length} valid card(s) ready to submit.`,
      invalid.length ? `❌ ${invalid.length} invalid card(s) skipped.` : null
    ].filter(Boolean);

    if (tagWarnings.length > 0) {
      messages.push(`💡 Tag suggestions:`);
      messages.push(...tagWarnings.slice(0, 3).map(warn => `  • ${warn}`)); // Limit to 3 warnings
      if (tagWarnings.length > 3) {
        messages.push(`  • ... and ${tagWarnings.length - 3} more tag suggestions`);
      }
    }

    bulkStatus.innerHTML = messages.join("<br>");
    bulkStatus.className = "system-message info"; // Always info, never error for tag issues
    bulkStatus.classList.remove("hidden");

    cardCount.textContent = `Cards created: ${cards.length}`;

  } catch (err) {
    bulkStatus.textContent = "❌ Invalid JSON: " + err.message;
    bulkStatus.className = "system-message error";
    bulkStatus.classList.remove("hidden");
  }
});


clearBtn.addEventListener("click", () => {
  document.getElementById("jsonInput").value = "";

  // partial clear — keep title/domain/sub
  ["questionText", "options", "correctAnswers", "explanation", "tags"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  ["difficulty", "questionType", "status"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
});

const clearAllBtn = document.getElementById("clearAllBtn");

clearAllBtn.addEventListener("click", () => {
  // Clear JSON input
  document.getElementById("jsonInput").value = "";

  // Clear form fields
  ["questionText", "options", "correctAnswers", "explanation", "tags"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  ["difficulty", "questionType", "status"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });

  // Reset dropdowns to default
  ["certIdSelect", "domainTitleSelect", "subdomainIdSelect"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.selectedIndex = 0;
      sel.dispatchEvent(new Event("change"));
    }
  });

  // Hide the bulkImportStatus message
  const bulkStatus = document.getElementById("bulkImportStatus");
  if (bulkStatus) {
    bulkStatus.classList.add("hidden");
    bulkStatus.textContent = ""; // Clear the message content
  }

  showGlobalMessage("🧨 All fields cleared");
});


addCardBtn.addEventListener("click", () => {
  const data = collectFormData();
if (!data.cert_id[0] || !data.domain_id || !data.subdomain_id || !data.question_text) {
  showGlobalMessage("❗ Title, domain, subdomain, and question text are required.");
  return;
}


  cards.push(data);
  renderCardPreviews();

  // 🧼 Clear inputs but keep title/domain/sub
  document.getElementById("jsonInput").value = "";
  ["questionText", "options", "correctAnswers", "explanation", "tags"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  ["difficulty", "questionType", "status"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
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
  await loadCovMap();
  dropdowns.populateAdminFormDropdownsFromMaps(certNames, domainMaps, subdomainMaps);
  refreshTitleManager?.();
};
