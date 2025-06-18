document.addEventListener("DOMContentLoaded", () => {
  // Dark Mode Toggle Logic
  const darkModeToggle = document.getElementById("darkModeToggle");
  const savedDarkMode = localStorage.getItem("darkMode") === "true";
  document.body.classList.toggle("dark-theme", savedDarkMode);
  if (darkModeToggle) {
    darkModeToggle.checked = savedDarkMode;
    darkModeToggle.addEventListener("change", () => {
      const isDark = darkModeToggle.checked;
      document.body.classList.toggle("dark-theme", isDark);
      localStorage.setItem("darkMode", isDark);
    });
  }

  // Floating Kanji Logic
  const kanjiWords = ["賢明", "懸命"];
  const kanjiContainer = document.body;
  function createKanji() {
    const kanji = document.createElement("span");
    kanji.className = "kanji-scatter";
    kanji.textContent = kanjiWords[Math.floor(Math.random() * kanjiWords.length)];
    kanji.style.top = `${Math.random() * 100}%`;
    kanji.style.left = `${Math.random() * 100}%`;
    kanji.style.setProperty("--random-x1", Math.random());
    kanji.style.setProperty("--random-y1", Math.random());
    kanji.style.setProperty("--random-x2", Math.random());
    kanji.style.setProperty("--random-y2", Math.random());
    kanji.style.setProperty("--random-x3", Math.random());
    kanji.style.setProperty("--random-y3", Math.random());
    kanji.style.setProperty("--random-x4", Math.random());
    kanji.style.setProperty("--random-y4", Math.random());
    kanji.style.animation = `float ${30 + Math.random() * 30}s linear infinite`;
    kanjiContainer.appendChild(kanji);
    kanji.addEventListener("animationend", () => {
      kanji.remove();
      createKanji();
    });
  }
  for (let i = 0; i < 7; i++) createKanji();
});