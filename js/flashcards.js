document.addEventListener("DOMContentLoaded", () => {
let domainMaps = {};
let subdomainMaps = {};

async function updateUserProgress(cert, domain, sub, correct, viewedOnly = false) {
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
    console.log("🌍 Loaded domain map:", domainMaps, subdomainMaps);
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

  // Only now: trigger change
  deckSelect.dispatchEvent(new Event("change"));
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

  // ✅ Now this will apply deck first, and trigger chain properly
  populateDeckDropdown(data.certNames, savedDeck);

  setTimeout(() => {
    if (savedDomain) {
      document.getElementById("domain-select").value = savedDomain;
      document.getElementById("domain-select").dispatchEvent(new Event("change"));
    }

    setTimeout(() => {
      if (savedSub) {
        document.getElementById("subdomain-select").value = savedSub;
        document.getElementById("subdomain-select").dispatchEvent(new Event("change"));
      }

      if (savedDifficulty) {
        document.getElementById("difficulty-select").value = savedDifficulty;
        document.getElementById("difficulty-select").dispatchEvent(new Event("change"));
      }

      if (savedMode) {
        document.getElementById("mode-select").value = savedMode;
      }
    }, 150);
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
const cardMeta = document.querySelector(".card-meta");
const cardUtils = document.querySelector(".card-utils");
const progressCounter = document.getElementById("progressCounter");
const correctCounter = document.getElementById("correctCounter");
const randomToggle = document.getElementById("random-toggle");
const checkTooltip = document.getElementById("check-tooltip");
const nextTooltip = document.getElementById("next-tooltip");

let questions = [];
let currentIndex = 0;
let correctCount = 0;

function saveLastSelection() {
  localStorage.setItem("lastDeck", document.getElementById("deck-select").value);
  localStorage.setItem("lastDomain", document.getElementById("domain-select").value);
  localStorage.setItem("lastSub", document.getElementById("subdomain-select").value);
  localStorage.setItem("lastDifficulty", document.getElementById("difficulty-select").value);
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

async function fetchCards() {
  const deck = document.getElementById("deck-select").value.trim();
  const domain = document.getElementById("domain-select").value.trim();
  const difficulty = document.getElementById("difficulty-select").value.trim();

  console.log("🔎 Fetching cards with:", { deck, domain, difficulty });

  const query = new URLSearchParams();
  const subdomain = document.getElementById("subdomain-select")?.value.trim();
  if (subdomain && subdomain !== "All") {
    query.append("subdomain_id", subdomain);
  }
  if (deck) {
    query.append("cert_id", deck);
  }

  if (domain && domain !== "All" && !domain.startsWith("All")) {
    const domainValue = domain.split(" ")[0]; // Extract "3.0" from "3.0 Hardware"
    query.append("domain_id", domainValue);
  }
  if (difficulty && difficulty !== "All") {
    query.append("difficulty", difficulty.toLowerCase());
  }

  const url = `http://localhost:3000/api/cards?${query.toString()}`;
  console.log("🌎 Querying URL:", url);

  const res = await fetch(url);
  const data = await res.json();

  console.log("📥 Received data:", data);

  questions = data.map(card => {
    return {
      question: card.question_text,
      options: shuffleAnswerOptions(card.answer_options || card.options || []),
      correct: Array.isArray(card.correct_answer)
        ? card.correct_answer
        : [card.correct_answer],
      required: Array.isArray(card.correct_answer)
        ? card.correct_answer.length
        : 1,
      type: card.question_type
    };
  });

  console.log("🗂️ Updated questions array:", questions);
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
      const opt = new Option(`${subId} ${subTitle}`, subId);
      subSelect.appendChild(opt);
    });
  }

  saveLastSelection();
  fetchCardsAndUpdateCount();
});


  async function fetchCardsAndUpdateCount() {
    await fetchCards();
    updateCardCount();

    // Fetch user progress and update difficulty dropdown
    const userId = localStorage.getItem("userId");
    if (!userId) return;

    try {
      const res = await fetch(`http://localhost:3000/api/user-progress/${userId}`);
      const progress = await res.json();

      const difficultySelect = document.getElementById("difficulty-select");
      difficultySelect.innerHTML = ""; // Clear existing options

      // Add "Easy" option
      const easyOption = document.createElement("option");
      easyOption.value = "Easy";
      easyOption.textContent = "Easy";
      difficultySelect.appendChild(easyOption);

      // Add "Medium" option (locked if not unlocked)
      const mediumOption = document.createElement("option");
      mediumOption.value = "Medium";
      mediumOption.textContent = progress.mediumUnlocked ? "Medium" : "🔒 Medium";
      mediumOption.disabled = !progress.mediumUnlocked;
      difficultySelect.appendChild(mediumOption);

      // Add "Hard" option (locked if not unlocked)
      const hardOption = document.createElement("option");
      hardOption.value = "Hard";
      hardOption.textContent = progress.hardUnlocked ? "Hard" : "🔒 Hard";
      hardOption.disabled = !progress.hardUnlocked;
      difficultySelect.appendChild(hardOption);

      // Add "All" option only if more than one level is unlocked
      if (progress.mediumUnlocked || progress.hardUnlocked) {
        const allOption = document.createElement("option");
        allOption.value = "All";
        allOption.textContent = "All";
        difficultySelect.appendChild(allOption);
      }
    } catch (err) {
      console.error("❌ Failed to fetch user progress:", err);
    }
  }

  function updateCardCount() {
    cardCountDisplay.textContent = `Cards: ${questions.length}`;
    console.log("🆙 Updated card count display:", questions.length);
  
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
  }
  

  document.getElementById("deck-select").addEventListener("change", fetchCardsAndUpdateCount);
  document.getElementById("domain-select").addEventListener("change", fetchCardsAndUpdateCount);
document.getElementById("difficulty-select").addEventListener("change", () => {
  saveLastSelection();
  fetchCardsAndUpdateCount();
});
  document.getElementById("subdomain-select").addEventListener("change", () => {
  saveLastSelection();
  fetchCardsAndUpdateCount();
});


  async function startSession() {
    if (questions.length === 0) {
      alert("No cards found for this deck/domain/difficulty.");
      return;
    }

    // Check if cards should be shuffled
    const shouldShuffle = randomToggle.checked;
    if (shouldShuffle) {
      console.log("🔀 Shuffling cards before session...");
      questions = shuffleCards(questions);
      console.log("🔀 Cards shuffled!");
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
    cardUtils.classList.remove("hidden");
    endMessage.classList.add("hidden");

    currentIndex = 0;
    correctCount = 0;
    loadCard();
  }

function loadCard() {
  const q = questions[currentIndex];
  cardContainer.textContent = q.question;
  answerForm.innerHTML = "";

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
      if (q.correct.includes(txt)) {
        opt.classList.add("correct");
      } else if (selected.includes(txt)) {
        opt.classList.add("incorrect");
      }
      opt.classList.remove("selected");
      opt.style.pointerEvents = "none";
    });

    const isCorrect = q.correct.every(ans => selected.includes(ans)) && selected.length === q.correct.length;
    if (isCorrect) correctCount++;

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

  function showEnd() {
    abortBtn.classList.add("hidden");
    exitBtn.classList.remove("hidden");

    flashcardBox.classList.add("hidden");
    cardMeta.classList.add("hidden");
    cardUtils.classList.add("hidden");
    endMessage.classList.remove("hidden");

    const percent = Math.round((correctCount / questions.length) * 100);
    document.getElementById("finalStats").textContent = `Correct: ${correctCount} / ${questions.length} (${percent}%)`;
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
  cardUtils.classList.add("hidden");
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
document.getElementById("mode-select").addEventListener("change", () => {
  saveLastSelection();
});
});
