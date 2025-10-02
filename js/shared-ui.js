document.addEventListener("DOMContentLoaded", () => {
  // Ensure a current user exists for all app pages (except the login/index page).
  // This enforces the single-username-first flow for the offline app and keeps
  // localStorage.userId in sync for legacy code paths.
  (async () => {
    try {
      if (window.userApi && typeof window.userApi.getCurrentUser === 'function') {
        const current = await window.userApi.getCurrentUser();
        // If on index.html leave the page alone so user can log in.
        const onIndex = location.pathname && location.pathname.endsWith('index.html');
        if (!current) {
          // No current user: if not on index, redirect to index for login
          if (!onIndex) {
            window.location.href = 'index.html';
            return;
          }
        } else {
          // Ensure legacy localStorage key is available for pages that still read it
          try { if (current && current.id) localStorage.setItem('userId', current.id); } catch (e) {}
        }
      }
    } catch (e) {
      // On any error, be conservative and redirect to index unless we're already there
      const onIndex = location.pathname && location.pathname.endsWith('index.html');
      if (!onIndex) window.location.href = 'index.html';
      return;
    }
  })();
  // Global flag to disable admin features in offline build
  window.ADMIN_ENABLED = false;
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
  // Only show floating kanji on the landing/index and dashboard pages.
  // These animations are decorative and cause layout overflow on other
  // pages (like Flashcards), so guard their creation by page class.
  try {
    const bodyCls = document.body && document.body.classList ? document.body.classList : [];
    if (bodyCls.contains && (bodyCls.contains('index-page') || bodyCls.contains('dashboard-page'))) {
      for (let i = 0; i < 7; i++) createKanji();
    }
  } catch (e) {
    // safe-fail: if anything goes wrong, don't create kanji
  }
});