document.addEventListener("DOMContentLoaded", () => {
let domainMaps = {};
let subdomainMaps = {};

let currentMode = 'casual'; // Track current mode
let isTestMode = false; // Flag for test mode
let testStartData = null; // Store test parameters for completion tracking

async function updateUserProgress(cert, domain, sub, correct, viewedOnly = false) {
  // In test mode, don't update progress during the session - only at the end
  if (isTestMode && !viewedOnly) {
    return;
  }
  
  const key = `${cert}:${domain}:${sub}`.replace(/\./g, "~");
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  try {
    await fetch(`http://localhost:3000/api/user-progress/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, correct, viewedOnly })
    });
  } catch (err) {
    console.error("❌ Failed to update user progress:", err);
  }
}

async function loadDomainMap() {
  try {
    const res = await fetch("http://localhost:3000/api/domainmap");
    const data = await res.json();
    domainMaps = data.domainMaps || {};
    subdomainMaps = data.subdomainMaps || {};
  } catch (err) {
    console.error("❌ Failed to load domainmap.json:", err);
  }
}

function populateDeckDropdown(certNames, selectedId = null) {
  const deckSelect = document.getElementById("deck-select");
  deckSelect.innerHTML = ""; // Clear old static options

  Object.entries(certNames).forEach(([id, title]) => {
    const opt = new Option(title, id);
    deckSelect.appendChild(opt);
  });

  // If we have a stored deck, use that — otherwise pick first
  if (selectedId && certNames[selectedId]) {
    deckSelect.value = selectedId;
  } else {
    deckSelect.selectedIndex = 0;
  }

  // Don't trigger change event here - let initialization handle it
}

(async () => {
  await loadDomainMap();
  const res = await fetch("http://localhost:3000/api/domainmap");
  const data = await res.json();

  const savedDeck = localStorage.getItem("lastDeck");
  const savedDomain = localStorage.getItem("lastDomain");
  const savedSub = localStorage.getItem("lastSub");
  const savedDifficulty = localStorage.getItem("lastDifficulty");
  const savedMode = localStorage.getItem("lastMode");

  // ✅ Populate deck dropdown without triggering events
  populateDeckDropdown(data.certNames, savedDeck);

  // Initialize mode state
  currentMode = savedMode || 'casual';
  isTestMode = currentMode === 'test';

  // Restore ALL selections first without triggering events
  setTimeout(() => {
    // Restore deck domain/subdomain options
    const certId = savedDeck;
    const domainSelect = document.getElementById("domain-select");
    const subSelect = document.getElementById("subdomain-select");

    domainSelect.innerHTML = `<option>All</option>`;
    subSelect.innerHTML = `<option>All</option>`;

    if (certId && domainMaps[certId]) {
      Object.entries(domainMaps[certId]).forEach(([domainId, domainTitle]) => {
        const opt = new Option(`${domainId} ${domainTitle}`, `${domainId} ${domainTitle}`);
        domainSelect.appendChild(opt);
      });
    }

    // Restore all selections
    if (savedDomain) document.getElementById("domain-select").value = savedDomain;
    if (savedSub) document.getElementById("subdomain-select").value = savedSub;
    if (savedDifficulty) document.getElementById("difficulty-select").value = savedDifficulty;
    if (savedMode) document.getElementById("mode-select").value = savedMode;

    // Update subdomain options based on domain
    if (savedDomain) {
      const domainId = savedDomain.split(" ")[0];
      subSelect.innerHTML = `<option>All</option>`;
      
      if (certId && domainId && subdomainMaps[certId]?.[domainId]) {
        const subMap = subdomainMaps[certId][domainId];
        Object.entries(subMap).forEach(([subId, subTitle]) => {
          // Full text display with CSS handling the wrapping
          const opt = new Option(`${subId} ${subTitle}`, subId);
          subSelect.appendChild(opt);
        });
      }
      
      if (savedSub) document.getElementById("subdomain-select").value = savedSub;
    }

    // Apply mode restrictions - removed subdomain restriction in test mode for flexible testing
    // Test mode now allows both domain-wide and subdomain-specific testing

    // NOW fetch cards once with all selections restored
    fetchCardsAndUpdateCount();
    
    // Set initial mode indicators after everything is loaded
    setTimeout(() => {
      updateModeIndicators();
    }, 200);
  }, 150);
})();


const startBtn = document.getElementById("startSessionBtn");
const abortBtn = document.getElementById("abortBtn");
const exitBtn = document.getElementById("exitBtn");
const headerBar = document.querySelector(".flashcards-header");
const cardCountDisplay = document.getElementById("cardCountDisplay");
const cardContainer = document.getElementById("cardContainer");
const answerForm = document.getElementById("answer-form");
const checkBtn = document.getElementById("checkAnswerBtn");
const nextBtn = document.getElementById("nextBtn");
const skipBtn = document.getElementById("skipBtn");
const resetBtn = document.getElementById("resetBtn");
const restartBtn = document.getElementById("restartBtn");
const endMessage = document.getElementById("endMessage");
const flashcardBox = document.querySelector(".flashcard-box");
const cardMeta = document.getElementById("cardMeta") || document.querySelector(".card-meta");
// DISABLED: Utility buttons temporarily disabled
// const cardUtils = document.getElementById("cardUtils") || document.querySelector(".card-utils");
const cardUtils = null; // Placeholder for future utility button functionality
const progressCounter = document.getElementById("progressCounter");
const correctCounter = document.getElementById("correctCounter");
const randomToggle = document.getElementById("random-toggle");
const checkTooltip = document.getElementById("check-tooltip");
const nextTooltip = document.getElementById("next-tooltip");

let questions = [];
let currentIndex = 0;
let correctCount = 0;
let isUpdatingMode = false; // Flag to prevent overlapping mode updates
let isUpdatingCards = false; // Flag to prevent overlapping card updates
let isRebuildingDifficulty = false; // Flag to prevent difficulty change events during dropdown rebuild

function saveLastSelection() {
  localStorage.setItem("lastDeck", document.getElementById("deck-select").value);
  localStorage.setItem("lastDomain", document.getElementById("domain-select").value);
  localStorage.setItem("lastSub", document.getElementById("subdomain-select").value);
  localStorage.setItem("lastDifficulty", document.getElementById("difficulty-select").value);
  localStorage.setItem("lastMode", document.getElementById("mode-select").value);
}

function restoreLastSelection() {
  const deck = localStorage.getItem("lastDeck");
  const domain = localStorage.getItem("lastDomain");
  const sub = localStorage.getItem("lastSub");
  const difficulty = localStorage.getItem("lastDifficulty");

  if (deck) document.getElementById("deck-select").value = deck;
  document.getElementById("deck-select").dispatchEvent(new Event("change"));

  setTimeout(() => {
    if (domain) document.getElementById("domain-select").value = domain;
    document.getElementById("domain-select").dispatchEvent(new Event("change"));

    setTimeout(() => {
      if (sub) document.getElementById("subdomain-select").value = sub;
      document.getElementById("subdomain-select").dispatchEvent(new Event("change"));

      if (difficulty) document.getElementById("difficulty-select").value = difficulty;
      document.getElementById("difficulty-select").dispatchEvent(new Event("change"));
    }, 150);
  }, 150);
}

async function getUnlockedDifficulties() {
  const userId = localStorage.getItem("userId");
  if (!userId) {
    return ["easy"]; // Only Easy is available when no user is logged in
  }

  try {
    const res = await fetch(`http://localhost:3000/api/user-progress/${userId}`);
    const userData = await res.json();
    
    // Get test completions to determine unlocked difficulties
    const testRes = await fetch(`http://localhost:3000/api/test-completions/${userId}`);
    const testCompletions = testRes.ok ? await testRes.json() : {};
    
    // Get unlock preferences from the new unlock system
    const unlocksRes = await fetch(`http://localhost:3000/api/user-unlocks/${userId}`);
    const unlocks = unlocksRes.ok ? await unlocksRes.json() : {};
    
    // Determine what's unlocked based on mode and current selection
    const cert = document.getElementById("deck-select").value.trim();
    const domain = document.getElementById("domain-select").value.trim();
    
    let mediumUnlocked = false;
    let hardUnlocked = false;

    if (isTestMode) {
      // Test mode: check test completions for unlock status
      const domainKey = domain === "All" ? "all" : domain.split(" ")[0];
      const mediumKey = `${cert}:${domainKey}:medium`;
      const hardKey = `${cert}:${domainKey}:hard`;
      
      mediumUnlocked = testCompletions[mediumKey]?.unlocked || false;
      hardUnlocked = testCompletions[hardKey]?.unlocked || false;
    } else {
      // Casual mode: use the new unlock preference system
      const certKey = cert.replace(/\./g, '_');
      const currentDomain = domain === "All" ? null : domain.split(" ")[0];
      
      if (currentDomain) {
        // Check domain-specific unlocks first
        const domainKey = currentDomain.replace(/\./g, '_');
        mediumUnlocked = unlocks[`${certKey}:${domainKey}:medium`] || false;
        hardUnlocked = unlocks[`${certKey}:${domainKey}:hard`] || false;
        
        // If domain-specific unlocks aren't set, fall back to title-level unlocks
        if (!mediumUnlocked) {
          mediumUnlocked = unlocks[`${certKey}:medium`] || false;
        }
        if (!hardUnlocked) {
          hardUnlocked = unlocks[`${certKey}:hard`] || false;
        }
      } else {
        // "All" domains selected - use title-level unlocks
        mediumUnlocked = unlocks[`${certKey}:medium`] || false;
        hardUnlocked = unlocks[`${certKey}:hard`] || false;
      }
      
      // If no unlock preferences are set, fall back to the old progress-based system
      if (!mediumUnlocked && !hardUnlocked) {
        // Build progress tree similar to progress.js (simplified version)
        const progressTree = {};
        for (const [key, data] of Object.entries(userData)) {
          const parts = key.replace(/~/g, '.').split(":");
          
          if (parts.length < 4) continue;
          
          const [certKey, domainKey, subKey, difficulty] = parts;
          if (!progressTree[certKey]) progressTree[certKey] = {};
          if (!progressTree[certKey][domainKey]) progressTree[certKey][domainKey] = {};
          if (!progressTree[certKey][domainKey][subKey]) progressTree[certKey][domainKey][subKey] = {};
          progressTree[certKey][domainKey][subKey][difficulty] = data;
        }
        
        // Check if Medium is unlocked (Easy is 100% complete)
        const currentCert = cert;
        
        if (currentDomain) {
          const domainProgress = progressTree[currentCert]?.[currentDomain];
          if (domainProgress) {
            for (const subId of Object.keys(domainProgress)) {
              const easyEntry = domainProgress[subId]?.easy;
              const actualData = Array.isArray(easyEntry) ? easyEntry[0] : easyEntry;
              if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                mediumUnlocked = true;
                break;
              }
            }
            
            // Check if Hard is unlocked (Medium is 100% complete)
            if (mediumUnlocked) {
              for (const subId of Object.keys(domainProgress)) {
                const mediumEntry = domainProgress[subId]?.medium;
                const actualData = Array.isArray(mediumEntry) ? mediumEntry[0] : mediumEntry;
                if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                  hardUnlocked = true;
                  break;
                }
              }
            }
          }
        } else {
          // "All" domains - check if ANY domain has Easy completed
          const certProgress = progressTree[currentCert];
          if (certProgress) {
            for (const domainId of Object.keys(certProgress)) {
              const domainData = certProgress[domainId];
              for (const subId of Object.keys(domainData)) {
                const easyEntry = domainData[subId]?.easy;
                const actualData = Array.isArray(easyEntry) ? easyEntry[0] : easyEntry;
                if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                  mediumUnlocked = true;
                  break;
                }
              }
              if (mediumUnlocked) break;
            }
            
            // Check Hard unlock
            if (mediumUnlocked) {
              for (const domainId of Object.keys(certProgress)) {
                const domainData = certProgress[domainId];
                for (const subId of Object.keys(domainData)) {
                  const mediumEntry = domainData[subId]?.medium;
                  const actualData = Array.isArray(mediumEntry) ? mediumEntry[0] : mediumEntry;
                  if (actualData && actualData.total > 0 && actualData.correct === actualData.total) {
                    hardUnlocked = true;
                    break;
                  }
                }
                if (hardUnlocked) break;
              }
            }
          }
        }
      }
    }
    
    // Return array of unlocked difficulties
    const unlocked = ["easy"];
    if (mediumUnlocked) unlocked.push("medium");
    if (hardUnlocked) unlocked.push("hard");
    
    return unlocked;
  } catch (err) {
    console.error("❌ Failed to determine unlocked difficulties:", err);
    return ["easy"]; // Fallback to Easy only
  }
}

async function fetchCards(unlockedDifficulties = null) {
  const deck = document.getElementById("deck-select").value.trim();
  const domain = document.getElementById("domain-select").value.trim();
  const difficulty = document.getElementById("difficulty-select").value.trim();

  const baseQuery = new URLSearchParams();
  const subdomain = document.getElementById("subdomain-select")?.value.trim();
  if (subdomain && subdomain !== "All") {
    baseQuery.append("subdomain_id", subdomain);
  }
  if (deck) {
    baseQuery.append("cert_id", deck);
  }

  if (domain && domain !== "All" && !domain.startsWith("All")) {
    const domainValue = domain.split(" ")[0]; // Extract "3.0" from "3.0 Hardware"
    baseQuery.append("domain_id", domainValue);
  }
  
  let allCards = [];
  
  // Handle difficulty filtering based on unlock status
  if (difficulty && difficulty !== "All") {
    // Single difficulty - make one API call
    const query = new URLSearchParams(baseQuery);
    query.append("difficulty", difficulty.toLowerCase());
    
    const url = `http://localhost:3000/api/cards?${query.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    allCards = data;
  } else if (difficulty === "All") {
    // Multiple difficulties - use pre-fetched unlock data if available
    const unlocked = unlockedDifficulties || await getUnlockedDifficulties();
    
    // Make parallel API calls for each unlocked difficulty
    const promises = unlocked.map(async (diff) => {
      const query = new URLSearchParams(baseQuery);
      query.append("difficulty", diff);
      
      const url = `http://localhost:3000/api/cards?${query.toString()}`;
      const res = await fetch(url);
      return await res.json();
    });
    
    const results = await Promise.all(promises);
    // Combine all results into a single array and remove duplicates
    const combinedCards = results.flat();
    const uniqueCards = combinedCards.filter((card, index, self) => 
      index === self.findIndex(c => c._id === card._id)
    );
    allCards = uniqueCards;
  } else {
    // No difficulty specified - fetch all cards (shouldn't happen in normal flow)
    const url = `http://localhost:3000/api/cards?${baseQuery.toString()}`;
    const res = await fetch(url);
    allCards = await res.json();
  }

  questions = allCards.map(card => {
    return {
      question: card.question_text,
      options: shuffleAnswerOptions(card.answer_options || card.options || []),
      correct: Array.isArray(card.correct_answer)
        ? card.correct_answer
        : [card.correct_answer],
      required: Array.isArray(card.correct_answer)
        ? card.correct_answer.length
        : 1,
      type: card.question_type,
      explanation: card.explanation || ""
    };
  });

  return questions; // Return the questions array for potential shuffling
}

document.getElementById("deck-select").addEventListener("change", () => {
  const certLabel = document.getElementById("deck-select").value;
  const certId = certLabel;

  const domainSelect = document.getElementById("domain-select");
  const subSelect = document.getElementById("subdomain-select");

  domainSelect.innerHTML = `<option>All</option>`;
  subSelect.innerHTML = `<option>All</option>`;

  if (certId && domainMaps[certId]) {
    Object.entries(domainMaps[certId]).forEach(([domainId, domainTitle]) => {
      const opt = new Option(`${domainId} ${domainTitle}`, `${domainId} ${domainTitle}`);
      domainSelect.appendChild(opt);
    });
  }

  domainSelect.disabled = false;
  subSelect.disabled = !(
    certId && domainMaps[certId] && Object.keys(subdomainMaps[certId] || {}).length
  );

  saveLastSelection();
  fetchCardsAndUpdateCount();
});


document.getElementById("domain-select").addEventListener("change", () => {
  const certLabel = document.getElementById("deck-select").value;
  const domainSelect = document.getElementById("domain-select");
  const subSelect = document.getElementById("subdomain-select");

  const certId = certLabel;
  const domainId = domainSelect.value.split(" ")[0];

  subSelect.innerHTML = `<option>All</option>`;

  if (certId && domainId && subdomainMaps[certId]?.[domainId]) {
    const subMap = subdomainMaps[certId][domainId];
    Object.entries(subMap).forEach(([subId, subTitle]) => {
      // Full text display with CSS handling the wrapping
      const opt = new Option(`${subId} ${subTitle}`, subId);
      subSelect.appendChild(opt);
    });
  }

  saveLastSelection();
  fetchCardsAndUpdateCount();
});


  async function fetchCardsAndUpdateCount() {
    // Prevent overlapping card fetch operations
    if (isUpdatingCards) {
      return;
    }
    
    isUpdatingCards = true;
    
    try {
      // Get unlocked difficulties once and pass to both functions
      const unlockedDifficulties = await getUnlockedDifficulties();
      
      await fetchCards(unlockedDifficulties);
      updateCardCount();
      
      // Update difficulty dropdown based on unlock status, passing the already-fetched data
      await updateDifficultyDropdown(unlockedDifficulties);
    } catch (err) {
      console.error("Error in fetchCardsAndUpdateCount:", err);
    } finally {
      isUpdatingCards = false;
    }
  }

  async function updateDifficultyDropdown(unlockedDifficulties = null) {
    // Set flag to prevent difficulty change events during rebuild
    isRebuildingDifficulty = true;
    
    // Fetch user progress and test completions to update difficulty dropdown
    const userId = localStorage.getItem("userId");
    const difficultySelect = document.getElementById("difficulty-select");
    
    if (!userId) {
      // Show only Easy difficulty when no user is logged in
      const currentDifficulty = difficultySelect.value; // Store current selection before clearing
      difficultySelect.innerHTML = "";
      
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);
      
      // No user logged in, only Easy is available
      difficultySelect.value = "Easy";
      
      // Reset flag
      isRebuildingDifficulty = false;
      return;
    }

    try {
      // Use pre-fetched data if available, otherwise fetch it
      const unlocked = unlockedDifficulties || await getUnlockedDifficulties();
      
      const currentDifficulty = difficultySelect.value; // Store current selection before clearing
      difficultySelect.innerHTML = ""; // Clear existing options
      
      // Determine unlock status from the array
      const mediumUnlocked = unlocked.includes("medium");
      const hardUnlocked = unlocked.includes("hard");
      
      // Add "Easy" option
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);

      // Add "Medium" option (locked if not unlocked in test mode)
      const mediumOption = document.createElement("option");
      mediumOption.value = "Medium";
      mediumOption.textContent = mediumUnlocked ? "Medium" : "🔒 Medium";
      mediumOption.disabled = !mediumUnlocked;
      difficultySelect.appendChild(mediumOption);

      // Add "Hard" option (locked if not unlocked in test mode)
      const hardOption = document.createElement("option");
      hardOption.value = "Hard";
      hardOption.textContent = hardUnlocked ? "Hard" : "🔒 Hard";
      hardOption.disabled = !hardUnlocked;
      difficultySelect.appendChild(hardOption);

      // Add "All" option only if more than one level is unlocked
      if (mediumUnlocked || hardUnlocked) {
        const allOption = document.createElement("option");
        allOption.value = "All";
        allOption.textContent = "All";
        difficultySelect.appendChild(allOption);
      }

      // Restore the previously selected difficulty if it's still available and unlocked
      if (currentDifficulty) {
        const optionExists = Array.from(difficultySelect.options).some(opt => opt.value === currentDifficulty && !opt.disabled);
        if (optionExists) {
          difficultySelect.value = currentDifficulty;
        } else {
          // If the previously selected difficulty is no longer available, default to Easy
          difficultySelect.value = "Easy";
        }
      } else {
        // If no previous selection, default to Easy
        difficultySelect.value = "Easy";
      }
      
    } catch (err) {
      console.error("❌ Failed to fetch user progress:", err);
      
      // Fallback: show only Easy difficulty for both modes when there's an error
      const currentDifficulty = difficultySelect.value; // Store current selection before clearing
      difficultySelect.innerHTML = "";
      
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);
      
      // In error state, lock Medium and Hard regardless of mode
      const mediumOption = document.createElement("option");
      mediumOption.value = "Medium";
      mediumOption.textContent = "🔒 Medium";
      mediumOption.disabled = true;
      difficultySelect.appendChild(mediumOption);
      
      const hardOption = document.createElement("option");
      hardOption.value = "Hard";
      hardOption.textContent = "🔒 Hard";
      hardOption.disabled = true;
      difficultySelect.appendChild(hardOption);

      // In error state, only Easy is available, so default to Easy
      difficultySelect.value = "Easy";
    } finally {
      // Always reset the flag, even if there was an error
      isRebuildingDifficulty = false;
    }
  }

  function updateCardCount() {
    cardCountDisplay.textContent = `Cards: ${questions.length}`;
  
    if (questions.length === 0) {
      startBtn.disabled = true;
      randomToggle.disabled = true;
      randomToggle.checked = false; // uncheck shuffle when disabled
    } else if (questions.length === 1) {
      startBtn.disabled = false;
      randomToggle.disabled = true;
      randomToggle.checked = false;
    } else {
      startBtn.disabled = false;
      randomToggle.disabled = false;
    }
    
    // Update mode indicators after card count is set
    updateModeIndicators();
  }
  

// Removed duplicate individual event listeners - using ones above in main flow

document.getElementById("difficulty-select").addEventListener("change", () => {
  // Skip if we're rebuilding the dropdown programmatically
  if (isRebuildingDifficulty) {
    return;
  }
  
  saveLastSelection();
  
  // Use the protected version to prevent overlapping calls
  fetchCardsAndUpdateCount().catch(err => {
    console.error("Error fetching cards after difficulty change:", err);
  });
});

const subdomainSelect = document.getElementById("subdomain-select");

subdomainSelect.addEventListener("change", (event) => {
  saveLastSelection();
  fetchCardsAndUpdateCount();
});

// Removed duplicate event listeners - using individual ones above instead

  async function startSession() {
    if (questions.length === 0) {
      alert("No cards found for this deck/domain/difficulty.");
      return;
    }

    // Store test parameters if in test mode
    if (isTestMode) {
      const selectedSubdomain = document.getElementById("subdomain-select")?.value.trim();
      testStartData = {
        cert: document.getElementById("deck-select").value.trim(),
        domain: document.getElementById("domain-select").value.trim(),
        subdomain: selectedSubdomain && selectedSubdomain !== "All" ? selectedSubdomain : null,
        difficulty: document.getElementById("difficulty-select").value.trim(),
        totalQuestions: questions.length,
        startTime: new Date()
      };
    }

    // Check if cards should be shuffled
    const shouldShuffle = randomToggle.checked;
    if (shouldShuffle) {
      questions = shuffleCards(questions);
    }

    cardCountDisplay.style.display = "none"; 

    startBtn.classList.add("hidden");
    
    // 🆕 Move abort button into header FIRST, then show it
    const headerInner = document.querySelector(".header-inner") || headerBar;
    headerInner.appendChild(abortBtn);
    abortBtn.classList.remove("hidden");
    
    exitBtn.classList.add("hidden");
    headerBar.classList.add("dimmed");
    document.getElementById("filterWrapper").classList.add("disabled");

    // Hide Shuffle toggle
    randomToggle.parentElement.style.display = "none";

    flashcardBox.classList.remove("hidden");
    cardMeta.classList.remove("hidden");
    // DISABLED: Utility buttons temporarily disabled
    // cardUtils.classList.remove("hidden");
    if (cardUtils) cardUtils.classList.remove("hidden");
    endMessage.classList.add("hidden");

    currentIndex = 0;
    correctCount = 0;
    loadCard();
  }

function loadCard() {
  const q = questions[currentIndex];
  cardContainer.textContent = q.question;
  answerForm.innerHTML = "";

  // Remove any existing inline explanations from previous cards
  const existingExplanation = answerForm.querySelector(".inline-explanation");
  if (existingExplanation) {
    existingExplanation.remove();
  }

  updateUserProgress(
  document.getElementById("deck-select").value.trim(),
  document.getElementById("domain-select").value.trim().split(" ")[0],
  document.getElementById("subdomain-select")?.value.trim(),
  false,
  true // this is 'viewedOnly'
);

  q.options.forEach(option => {
    const div = document.createElement("div");
    div.className = "option";
    div.textContent = option;

    div.addEventListener("click", () => {
      const isSelected = div.classList.contains("selected");
      const selectedCount = answerForm.querySelectorAll(".option.selected").length;
      const maxSelections = q.required;

      // if (q.required === 1) {
      //   answerForm.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
      //   div.classList.toggle("selected");
      // } else {
      //   if (isSelected) {
      //     div.classList.remove("selected");
      //   } else if (selectedCount < maxSelections) {
      //     div.classList.add("selected");
      //   }
      // }

      if (q.type === "multiple_choice") {
  answerForm.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
  div.classList.toggle("selected");
} else if (q.type === "select_multiple") {
  if (isSelected) {
    div.classList.remove("selected");
  } else if (selectedCount < q.required) {
    div.classList.add("selected");
  }
} else {
  // select_all: no limit
  if (isSelected) {
    div.classList.remove("selected");
  } else {
    div.classList.add("selected");
  }
}

      updateCheckState();
    });

    answerForm.appendChild(div);
  });

  checkBtn.disabled = true;
  checkBtn.classList.remove("primary");
  checkTooltip.style.display = "block";

  nextBtn.disabled = true;
  nextBtn.classList.remove("primary");
  nextTooltip.style.display = "block";

  updateMeta();
}

  function updateCheckState() {
    const q = questions[currentIndex];
    const selected = answerForm.querySelectorAll(".option.selected");
    const selectedCount = selected.length;
  
    let isReady = false;
  
    if (q.type === "select_all") {
      isReady = selectedCount > 0;
    } else if (q.required === 1) {
      isReady = selectedCount === 1;
    } else {
      isReady = selectedCount === q.required;
    }
  
    checkBtn.disabled = !isReady;
    checkBtn.classList.toggle("primary", isReady);
    checkTooltip.style.display = isReady ? "none" : "block";
  }

  function updateMeta() {
    progressCounter.textContent = `Card ${currentIndex + 1} of ${questions.length}`;
    correctCounter.textContent = `Correct answers: ${correctCount} / ${questions.length}`;
  }

  function checkAnswer() {
    if (checkBtn.disabled) return;

    const q = questions[currentIndex];
    const selected = Array.from(answerForm.querySelectorAll(".option.selected")).map(opt => opt.textContent.trim());

    answerForm.querySelectorAll(".option").forEach(opt => {
      const txt = opt.textContent.trim();
      const isCorrectAnswer = q.correct.includes(txt);
      const wasSelected = selected.includes(txt);
      
      // Apply background colors for correctness
      if (isCorrectAnswer) {
        opt.classList.add("correct");
      }
      
      // Apply border styles for user selections
      if (wasSelected) {
        if (isCorrectAnswer) {
          opt.classList.add("user-correct");
        } else {
          opt.classList.add("user-incorrect");
        }
      }
      
      opt.classList.remove("selected");
      opt.style.pointerEvents = "none";
    });

    const isCorrect = q.correct.every(ans => selected.includes(ans)) && selected.length === q.correct.length;
    if (isCorrect) correctCount++;

    // Show explanation inline below answer options
    if (q.explanation && q.explanation.trim()) {
      const explanationDiv = document.createElement("div");
      explanationDiv.className = "inline-explanation";
      explanationDiv.innerHTML = `
        <div class="explanation-content">
          <span class="explanation-icon">💡</span>
          ${q.explanation}
        </div>
      `;
      answerForm.appendChild(explanationDiv);
    }

    checkBtn.disabled = true;
    checkBtn.classList.remove("primary");
    checkTooltip.style.display = "none";

    nextBtn.disabled = false;
    nextBtn.classList.add("primary");
    nextTooltip.style.display = "none";

    updateUserProgress(
  document.getElementById("deck-select").value.trim(),
  document.getElementById("domain-select").value.trim().split(" ")[0],
  document.getElementById("subdomain-select")?.value.trim(),
  isCorrect
);

    updateMeta();
  }

  function nextCard() {
    currentIndex++;
    if (currentIndex >= questions.length) {
      showEnd();
    } else {
      loadCard();
    }
  }

  async function showEnd() {
    abortBtn.classList.add("hidden");
    exitBtn.classList.remove("hidden");

    flashcardBox.classList.add("hidden");
    cardMeta.classList.add("hidden");
    // DISABLED: Utility buttons temporarily disabled
    // cardUtils.classList.add("hidden");
    if (cardUtils) cardUtils.classList.add("hidden");
    endMessage.classList.remove("hidden");

    const percent = Math.round((correctCount / questions.length) * 100);
    let finalMessage = `Correct: ${correctCount} / ${questions.length} (${percent}%)`;
    
    // Handle test mode completion
    if (isTestMode && testStartData) {
      const passed = percent >= 90; // 90% passing requirement
      
      if (passed) {
        finalMessage += "\n🎉 Test PASSED! Next difficulty level unlocked.";
      } else {
        finalMessage += "\n❌ Test FAILED. Need 90% to unlock next level.";
      }
      
      // Record test completion and progress
      try {
        const userId = localStorage.getItem("userId");
        if (userId) {
          // 1. Record test completion for unlock tracking
          await fetch(`http://localhost:3000/api/test-completion/${userId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cert: testStartData.cert,
              domain: testStartData.domain === "All" ? null : testStartData.domain.split(" ")[0],
              subdomain: testStartData.subdomain, // Include subdomain for flexible testing
              difficulty: testStartData.difficulty.toLowerCase(),
              score: percent,
              totalQuestions: testStartData.totalQuestions,
              correctAnswers: correctCount,
              completedAt: new Date()
            })
          });
          
          // 2. Record progress for each subdomain tested (so scores appear on progress page)
          if (testStartData.subdomain) {
            // Specific subdomain test - record progress for that subdomain
            const progressKey = `${testStartData.cert}:${testStartData.domain.split(" ")[0]}:${testStartData.subdomain}:${testStartData.difficulty.toLowerCase()}`;
            await fetch(`http://localhost:3000/api/user-progress/${userId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                key: progressKey.replace(/\./g, "~"), 
                correct: correctCount,
                total: questions.length,
                isTestResult: true // Flag to indicate this is from a test
              })
            });
          } else {
            // Domain-wide test - record progress proportionally across all subdomains in that domain
            // This is more complex and might need backend logic to distribute the score
            const progressKey = `${testStartData.cert}:${testStartData.domain.split(" ")[0]}:all:${testStartData.difficulty.toLowerCase()}`;
            await fetch(`http://localhost:3000/api/user-progress/${userId}`, {
              method: "PATCH", 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                key: progressKey.replace(/\./g, "~"), 
                correct: correctCount,
                total: questions.length,
                isTestResult: true // Flag to indicate this is from a test
              })
            });
          }
        }
      } catch (err) {
        console.error("❌ Failed to record test completion:", err);
      }
    }
    
    document.getElementById("finalStats").textContent = finalMessage;
  }

  function resetCard() {
    loadCard();
  }

  function skipCard() {
    nextCard();
  }

  function restart() {
    startSession();
  }

  startBtn.addEventListener("click", startSession);

// Function to shuffle the order of cards (not answer options)
function shuffleCards(cardsArray) {
  const shuffled = [...cardsArray]; // Create a copy to avoid mutating original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Function to shuffle answer options within a card
function shuffleAnswerOptions(arr) {
  const allOfTheAbove = arr.find(opt => opt.trim().toLowerCase() === "all of the above");
  const others = arr.filter(opt => opt.trim().toLowerCase() !== "all of the above");

  const shuffled = others
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

  if (allOfTheAbove) {
    shuffled.push(allOfTheAbove);
  }

  return shuffled;
}
 abortBtn.addEventListener("click", () => {
  // 🆕 Hide button immediately, then redirect
  abortBtn.classList.add("hidden");
  
  document.getElementById("filterWrapper").classList.remove("disabled");
  randomToggle.parentElement.style.display = "";
  
  // Small delay to ensure clean transition
  setTimeout(() => {
    window.location.href = "flashcards.html";
  }, 50);
});
exitBtn.addEventListener("click", () => {
  // Show Shuffle toggle again
  randomToggle.parentElement.style.display = "";
  window.location.href = "flashcards.html";
});

  checkBtn.addEventListener("click", checkAnswer);
  nextBtn.addEventListener("click", nextCard);
  skipBtn.addEventListener("click", skipCard);
  resetBtn.addEventListener("click", resetCard);
  restartBtn.addEventListener("click", restart);

  flashcardBox.classList.add("hidden");
  cardMeta.classList.add("hidden");
  // DISABLED: Utility buttons temporarily disabled
  // cardUtils.classList.add("hidden");
  if (cardUtils) cardUtils.classList.add("hidden");
  endMessage.classList.add("hidden");

  // Dark Mode Toggle Functionality
  const darkModeToggle = document.getElementById("darkModeToggle");

  // Load saved dark mode preference
  const savedDarkMode = localStorage.getItem("darkMode") === "true";
  if (savedDarkMode) {
    document.body.classList.add("dark-theme");
    darkModeToggle.checked = true;
  }

  // Toggle dark mode
  darkModeToggle.addEventListener("change", () => {
    const isDark = darkModeToggle.checked;
    document.body.classList.toggle("dark-theme", isDark);
    localStorage.setItem("darkMode", isDark);
  });
document.getElementById("mode-select").addEventListener("change", async (event) => {
  // Prevent event bubbling that might trigger other dropdowns
  event.stopPropagation();
  
  // Prevent overlapping mode change operations
  if (isUpdatingMode) {
    return;
  }
  
  isUpdatingMode = true;
  
  try {
    currentMode = document.getElementById("mode-select").value;
    isTestMode = currentMode === 'test';
    
    // Update visual indicators for current mode immediately
    updateModeIndicators();
    
    saveLastSelection();
    
    // Reset the mode updating flag immediately after UI updates
    isUpdatingMode = false;
    
    // Use setTimeout instead of requestAnimationFrame for truly async execution
    setTimeout(async () => {
      try {
        await fetchCardsAndUpdateCount();
      } catch (err) {
        console.error("Error updating cards after mode change:", err);
      }
    }, 0);
  } catch (err) {
    console.error("Error in mode change handler:", err);
    isUpdatingMode = false; // Reset flag on error
  }
});

// Function to update visual mode indicators
function updateModeIndicators() {
  const cardCountDisplay = document.getElementById("cardCountDisplay");
  const startBtn = document.getElementById("startSessionBtn");
  
  if (isTestMode) {
    // Test mode: Show test indicator emoji
    if (cardCountDisplay && cardCountDisplay.textContent.includes("Cards:")) {
      const cardText = cardCountDisplay.textContent;
      if (!cardText.includes("🎯")) {
        cardCountDisplay.innerHTML = `${cardText} <span style="color: #f39c12; font-weight: bold;">🎯</span>`;
      }
    }
    
    // Update start button styling
    if (startBtn) {
      startBtn.textContent = "Start";
      startBtn.style.backgroundColor = "#e74c3c"; // Red for test mode
    }
  } else {
    // Casual mode: Show casual indicator emoji  
    if (cardCountDisplay && cardCountDisplay.textContent.includes("🎯")) {
      const cardText = cardCountDisplay.textContent.replace(/\s*🎯.*$/, '');
      cardCountDisplay.innerHTML = `${cardText} <span style="color: #27ae60; font-weight: bold;">📚</span>`;
    } else if (cardCountDisplay && !cardCountDisplay.textContent.includes("📚")) {
      const cardText = cardCountDisplay.textContent;
      cardCountDisplay.innerHTML = `${cardText} <span style="color: #27ae60; font-weight: bold;">📚</span>`;
    }
    
    // Update start button styling
    if (startBtn) {
      startBtn.textContent = "Start";
      startBtn.style.backgroundColor = "#3498db"; // Blue for casual mode
    }
  }
}
});
