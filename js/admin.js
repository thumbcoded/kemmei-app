let allCards = [];

document.addEventListener("DOMContentLoaded", () => {
  const toggleEditor = document.getElementById("toggleEditor");
const editorPanel = document.getElementById("editorPanel");

toggleEditor.addEventListener("change", () => {
  editorPanel.style.display = toggleEditor.checked ? "block" : "none";
  if (toggleEditor.checked) {
    fetchAllCards(); // Load cards when toggle is turned on
  }
});
const importBtn = document.getElementById("importBtn");
  const clearBtn = document.getElementById("clearBtn");
  const addCardBtn = document.getElementById("addCardBtn");
  const addAnswerBtn = document.getElementById("addAnswerBtn");
  const addImageBtn = document.getElementById("addImageBtn");
  const exportFileBtn = document.getElementById("exportFileBtn");
  const submitBtn = document.getElementById("submitToBackendBtn");
  const cardPreviewList = document.getElementById("cardPreviewList");
  const cardCount = document.getElementById("cardCount");
  const cancelEditBtn = document.getElementById("cancelEditBtn");

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


    } catch (err) {
      console.error("❌ Failed to load cards:", err);
    }
  }

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
    const difficultySelect = document.getElementById("filterDifficulty");
  
    const certs = new Set();
    const domains = new Set();
    const difficulties = new Set();
  
    cards.forEach(card => {
      card.cert_id.forEach(c => certs.add(c));
      domains.add(card.domain_id);
      difficulties.add(card.difficulty);
    });
  
    function populate(select, items, label = "All") {
      const selected = select.value;
      select.innerHTML = `<option value="All">${label}</option>` +
        Array.from(items).sort().map(v =>
          `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`
        ).join("");
    }    
  
    populate(certSelect, certs, "All titles");
    populate(domainSelect, domains, "All domains");
    populate(difficultySelect, difficulties, "All difficulty levels");
  }
  
  function applyFilters() {
    const cert = document.getElementById("filterCert").value;
    const domain = document.getElementById("filterDomain").value;
    const difficulty = document.getElementById("filterDifficulty").value;
    const keyword = document.getElementById("filterKeyword").value.toLowerCase();
  
    let filtered = allCards;
  
    // Step 1: cert filter
    if (cert !== "All") {
      filtered = filtered.filter(card => card.cert_id.includes(cert));
    }
  
    // Step 2: difficulty filter
    if (difficulty !== "All") {
      filtered = filtered.filter(card => card.difficulty === difficulty);
    }
  
    // Step 3: update domain dropdown based on current filtered cards
    const domainSelect = document.getElementById("filterDomain");
    const currentDomain = domainSelect.value;
    const domains = [...new Set(filtered.map(card => card.domain_id))].sort();
    domainSelect.innerHTML = `<option value="All">All domains</option>` +
      domains.map(d => `<option value="${d}" ${d === currentDomain ? "selected" : ""}>${d}</option>`).join("");
  
    // Step 4: domain filter
    if (domain !== "All") {
      filtered = filtered.filter(card => card.domain_id === domain);
    }
  
    // Step 5: keyword
    if (keyword) {
      filtered = filtered.filter(card =>
        card.question_text.toLowerCase().includes(keyword) ||
        (card.tags || []).some(tag => tag.toLowerCase().includes(keyword))
      );
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
    alert("✔️ Selected cards deleted.");
    selectedCardIds = [];
    fetchAllCards(); // Reload
  } catch (err) {
    console.error("❌ Bulk delete failed:", err);
    alert("❌ Failed to delete cards.");
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

  function loadCardIntoForm(card) {
    document.getElementById("certId").value = Array.isArray(card.cert_id) ? card.cert_id.join(", ") : card.cert_id;
    document.getElementById("domainId").value = card.domain_id || "";
    document.getElementById("domainTitle").value = card.domain_title || "";
    document.getElementById("difficulty").value = card.difficulty || "easy";
    document.getElementById("questionType").value = card.question_type || "multiple_choice";
    document.getElementById("questionText").value = card.question_text || "";
    document.getElementById("options").value = (card.answer_options || []).join("\n");
    document.getElementById("correctAnswers").value = (Array.isArray(card.correct_answer) ? card.correct_answer : [card.correct_answer]).join("\n");
    document.getElementById("explanation").value = card.explanation || "";
    document.getElementById("tags").value = (card.tags || []).join(", ");
    document.getElementById("status").value = card.status || "approved";
  
    editingCardId = card._id;
  
    // Switch button visibility
    document.getElementById("addCardBtn").style.display = "none";
    document.getElementById("submitToBackendBtn").style.display = "none";
    document.getElementById("saveChangesBtn").style.display = "inline-block";
    document.getElementById("cancelEditBtn").style.display = "inline-block"; 
  }
  
  
  const saveChangesBtn = document.getElementById("saveChangesBtn");

saveChangesBtn.addEventListener("click", async () => {
  if (!editingCardId) return;

  const updatedCard = collectFormData(); // a small helper we'll add
  
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
      alert("✔️ Card updated successfully!");
      // Reset
      editingCardId = null;
      saveChangesBtn.style.display = "none";
      document.getElementById("addCardBtn").style.display = "inline-block";
      document.getElementById("submitToBackendBtn").style.display = "inline-block";
      clearForm();
      fetchAllCards(); // Reload cards
    } else {
      alert("❌ Failed to update card.");
    }
  } catch (err) {
    console.error("❌ Network error updating card:", err);
  }
});

function collectFormData() {
  return {
    cert_id: document.getElementById("certId").value.split(",").map(x => x.trim()),
    domain_id: document.getElementById("domainId").value.trim(),
    domain_title: document.getElementById("domainTitle").value.trim(),
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
  document.getElementById("cardForm").reset();
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
        <div style="display: flex; gap: 0.5rem;">
          <button class="edit-card" data-id="${card._id}">Edit</button>
          <button class="delete-card" data-id="${card._id}">Delete</button>
        </div>
        <input type="checkbox" class="select-card-checkbox" data-id="${card._id}" style="width: 18px; height: 18px; flex-shrink: 0; margin: 0;" />
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
        div.classList.add("selected"); // <- Add class to the card
      } else {
        selectedCardIds = selectedCardIds.filter(cardId => cardId !== id);
        div.classList.remove("selected"); // <- Remove class
      }
      updateBulkDeleteButton();
      updateSelectAllCheckbox();
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

      document.getElementById("certId").value = Array.isArray(data.cert_id)
        ? data.cert_id.join(", ")
        : data.cert_id || "";
      document.getElementById("domainId").value = data.domain_id || "";
      document.getElementById("domainTitle").value = data.domain_title || "";

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
      alert("Invalid JSON: " + err.message);
    }
  });

  clearBtn.addEventListener("click", () => {
    document.getElementById("jsonInput").value = "";
    document.getElementById("cardForm").reset();
  });

  addCardBtn.addEventListener("click", async () => {
    const certId = document.getElementById("certId").value.trim();
    const questionText = document.getElementById("questionText").value.trim();
    if (!certId || !questionText) {
      alert("❗ Please enter at least a topic and question text.");
      return;
    }

    const rawAnswers = document.getElementById("correctAnswers").value.trim().split("\n").map(s => s.trim());
    const correctAnswer = rawAnswers.length === 1 ? rawAnswers[0] : rawAnswers;

    const card = {
      _id: null, // placeholder until assigned
      cert_id: certId.split(",").map(s => s.trim()),
      domain_id: document.getElementById("domainId").value,
      domain_title: document.getElementById("domainTitle").value,
      difficulty: document.getElementById("difficulty").value,
      question_type: document.getElementById("questionType").value,
      question_text: questionText,
      answer_options: document.getElementById("options").value.trim().split("\n").map(s => s.trim()),
      correct_answer: correctAnswer,
      explanation: document.getElementById("explanation").value,
      tags: document.getElementById("tags").value.trim().split(",").map(s => s.trim()),
      status: document.getElementById("status").value
    };

    cards.push(card);
    renderCardPreviews();
  });

  submitBtn.addEventListener("click", async () => {
    if (cards.length === 0) {
      alert("No cards to submit.");
      return;
    }

    // Fetch fresh batch of unique IDs
    const ids = await fetchNextCardIds(cards.length);
    if (ids.length !== cards.length) {
      alert("❌ Failed to allocate unique IDs for all cards.");
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
        <p><strong>Domain:</strong> ${card.domain_title} (${card.domain_id})</p>
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
    alert("💡 You can add answers directly by typing each on a new line in the Options + Correct Answers fields.");
  });

  addImageBtn.addEventListener("click", () => {
    alert("🖼️ Image support coming soon. For now, you can manually append image URLs to the question or options.");
  });
});
