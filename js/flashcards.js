document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startSessionBtn");
  const abortBtn = document.getElementById("abortBtn");
  const exitBtn = document.getElementById("exitBtn");
  const headerBar = document.querySelector(".flashcards-header");

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

  const checkTooltip = document.getElementById("check-tooltip");
  const nextTooltip = document.getElementById("next-tooltip");

  let questions = [];
  let currentIndex = 0;
  let correctCount = 0;

  async function fetchCards() {
    const deck = document.getElementById("deck-select").value;
    const domain = document.getElementById("domain-select").value;
    const difficulty = document.getElementById("difficulty-select").value;

    const certMap = {
      "CompTIA A+ Core 1": "220-1201",
      "CompTIA A+ Core 2": "220-1202"
    };

    const query = new URLSearchParams();
    if (certMap[deck]) query.append("cert_id", certMap[deck]);
    if (!domain.startsWith("All")) query.append("domain_id", domain.split(" ")[0]);
    if (difficulty !== "All") query.append("difficulty", difficulty.toLowerCase());

    const url = `http://localhost:3000/api/cards?${query.toString()}`;
    const res = await fetch(url);
    const data = await res.json();

    questions = data.map(card => {
      console.log("📥 Loaded card from backend:", card);
      return {
        question: card.question_text,
        options: shuffleArray(card.answer_options || card.options || []),
        correct: Array.isArray(card.correct_answer)
          ? card.correct_answer
          : [card.correct_answer],
        required: Array.isArray(card.correct_answer)
          ? card.correct_answer.length
          : 1,
        type: card.question_type
      };
    });
  }

  async function startSession() {
    await fetchCards();

    if (questions.length === 0) {
      alert("No cards found for this deck/domain/difficulty.");
      return;
    }

    startBtn.classList.add("hidden");
    abortBtn.classList.remove("hidden");
    exitBtn.classList.add("hidden");
    headerBar.classList.add("dimmed");

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

    q.options.forEach(option => {
      const div = document.createElement("div");
      div.className = "option";
      div.textContent = option;

      div.addEventListener("click", () => {
        const isSelected = div.classList.contains("selected");
        const selectedCount = answerForm.querySelectorAll(".option.selected").length;
        const maxSelections = q.required;

        if (q.required === 1) {
          // For multiple_choice
          answerForm.querySelectorAll(".option").forEach(opt => opt.classList.remove("selected"));
          div.classList.toggle("selected");
        } else {
          // For select_multiple
          if (isSelected) {
            div.classList.remove("selected"); // Allow deselect
          } else if (selectedCount < maxSelections) {
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
      isReady = selectedCount > 0; // allow any number ≥1
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
  abortBtn.addEventListener("click", () => window.location.href = "flashcards.html");
  exitBtn.addEventListener("click", () => window.location.href = "flashcards.html");

  checkBtn.addEventListener("click", checkAnswer);
  nextBtn.addEventListener("click", nextCard);
  skipBtn.addEventListener("click", skipCard);
  resetBtn.addEventListener("click", resetCard);
  restartBtn.addEventListener("click", restart);

  flashcardBox.classList.add("hidden");
  cardMeta.classList.add("hidden");
  cardUtils.classList.add("hidden");
  endMessage.classList.add("hidden");

  function shuffleArray(arr) {
    const allOfTheAbove = arr.find(opt => opt.trim().toLowerCase() === "all of the above");
    const others = arr.filter(opt => opt.trim().toLowerCase() !== "all of the above");
  
    const shuffled = others
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);
  
    if (allOfTheAbove) {
      shuffled.push(allOfTheAbove); // always last
    }
  
    return shuffled;
  }
  
});
