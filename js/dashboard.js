document.addEventListener("DOMContentLoaded", async () => {
  try {
    const user = await window.userApi.getCurrentUser()
    if (!user) { window.location.href = 'index.html'; return }
    const greeting = document.getElementById('greeting')
    greeting.textContent = `Hello, ${user.username} 👋`
  } catch (e) { console.error(e); window.location.href = 'index.html'; return }

  const logoutBtn = document.getElementById('logout-btn')
  logoutBtn.addEventListener('click', async () => {
    await window.userApi.setCurrentUserId('')
    window.location.href = 'index.html'
  })

  // Dark Mode Toggle Functionality
  const darkModeToggle = document.getElementById('darkModeToggle')

  // Load saved dark mode preference
  const savedDarkMode = localStorage.getItem('darkMode') === 'true'
  if (savedDarkMode) {
    document.body.classList.add('dark-theme')
    darkModeToggle.checked = true
  }

  // Toggle dark mode
  darkModeToggle.addEventListener('change', () => {
    const isDark = darkModeToggle.checked
    document.body.classList.toggle('dark-theme', isDark)
    localStorage.setItem('darkMode', isDark)
  })

  // Study streak logic
  try {
    const streakCountEl = document.getElementById('streakCount');
    const streakLine = document.getElementById('streakLine');
    const userId = (await window.userApi.getCurrentUser()).id;
    let streak = 0;
  let longestStreak = 0;

  // no deck/unique-card aggregation — keep dashboard focused on streak only

    let progress = {};
    if (userId && window.api && typeof window.api.getUserProgress === 'function') {
      progress = await window.api.getUserProgress(userId) || {};
      // progress is a key->data map; data may include touchedAt ISO timestamps
      const days = new Set();
      for (const [k, v] of Object.entries(progress || {})) {
        try {
          const data = v && (v.data || v) ? (v.data || v) : v;
          const t = data && (data.touchedAt || data.completedAt || data.touched_at || data.completed_at);
          if (t) {
            const d = new Date(t);
            if (!isNaN(d)) {
              // normalize to local date string (YYYY-MM-DD)
              const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
              days.add(key);
            }
          }
        } catch (e) { /* ignore malformed entries */ }
      }
      // Build streak: compute longest streak and current consecutive streak ending today
      const sortedDays = Array.from(days).sort();
      // helper to iterate consecutive sequences
      function ymdStrToDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
      // compute longest streak
      let curStreak = 0;
      let prev = null;
      for (const ds of sortedDays) {
        const dt = ymdStrToDate(ds);
        if (prev) {
          const diff = (dt - prev) / (1000*60*60*24);
          if (diff === 1) curStreak++; else curStreak = 1;
        } else curStreak = 1;
        if (curStreak > longestStreak) longestStreak = curStreak;
        prev = dt;
      }
      // compute current streak ending today
      function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
      let cursor = new Date();
      let currentCount = 0;
      while (true) {
        const key = ymd(cursor);
        if (days.has(key)) { currentCount++; cursor.setDate(cursor.getDate() - 1); }
        else break;
      }
      streak = currentCount;
    }
    if (streakCountEl) streakCountEl.textContent = String(streak || 0);
    const longestEl = document.getElementById('longestStreak'); if (longestEl) longestEl.textContent = String(longestStreak || 0);

  // removed deck/unique-card aggregation per request
    if (streakLine) {
      streakLine.setAttribute('title', 'Do any deck to keep your streak.');
      streakLine.classList.add('has-tooltip');
    }
  } catch (e) {
    console.warn('Failed to compute streak', e && e.message);
  }
})
