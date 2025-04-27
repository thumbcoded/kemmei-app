const questionText = document.getElementById("question-text");
const answerButtons = document.getElementById("answer-buttons");
const nextBtn = document.getElementById("next-btn");

const flashcards = [
  {
    question: "Which port is used by HTTPS?",
    answers: [
      { text: "443", correct: true },
      { text: "80", correct: false },
      { text: "21", correct: false },
      { text: "22", correct: false }
    ]
  },
  {
    question: "Which layer does IP operate at in the OSI model?",
    answers: [
      { text: "Transport", correct: false },
      { text: "Network", correct: true },
      { text: "Data Link", correct: false },
      { text: "Application", correct: false }
    ]
  }
];

let currentIndex = 0;

function startQuiz() {
  currentIndex = 0;
  nextBtn.classList.add("hidden");
  showQuestion();
}

function showQuestion() {
  resetState();
  const card = flashcards[currentIndex];
  questionText.textContent = card.question;

  card.answers.forEach(answer => {
    const btn = document.createElement("button");
    btn.textContent = answer.text;
    btn.classList.add("answer-btn");
    btn.addEventListener("click", () => selectAnswer(btn, answer.correct));
    answerButtons.appendChild(btn);
  });
}

function resetState() {
  answerButtons.innerHTML = "";
  nextBtn.classList.add("hidden");
}

function selectAnswer(button, correct) {
  const allButtons = answerButtons.querySelectorAll("button");
  allButtons.forEach(btn => {
    btn.disabled = true;
    const isCorrect = flashcards[currentIndex].answers.find(a => a.text === btn.textContent).correct;
    btn.classList.add(isCorrect ? "correct" : "wrong");
  });

  if (correct) {
    button.classList.add("correct");
  } else {
    button.classList.add("wrong");
  }

  nextBtn.classList.remove("hidden");
}

nextBtn.addEventListener("click", () => {
  currentIndex++;
  if (currentIndex < flashcards.length) {
    showQuestion();
  } else {
    questionText.textContent = "🎉 You're done!";
    resetState();
    nextBtn.classList.add("hidden");
  }
});

startQuiz();
