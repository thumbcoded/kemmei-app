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
})
