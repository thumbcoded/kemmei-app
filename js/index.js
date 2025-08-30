document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("login-btn");
  const usernameInput = document.getElementById("username-input");
  const errorMsg = document.getElementById("login-error");

  // If already have a current user, go straight to dashboard
  (async () => {
    try {
      const current = await window.userApi.getCurrentUser()
      if (current && current.username) {
        window.location.href = 'dashboard.html'
        return
      }
    } catch (e) { /* ignore */ }
  })()

  loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    if (!username) {
      if (errorMsg) { errorMsg.textContent = "Please enter a username."; errorMsg.classList.remove('hidden') }
      return
    }

    try {
      // Check if user exists
      const existing = await window.api && window.api.getUsers ? (await window.api.getUsers()).find(u => u.username === username) : null
      let user
      if (existing) {
        user = existing
      } else {
        // create minimal user record
        user = { username }
        const res = await window.userApi.saveUser(user)
        user.id = res && res.id ? res.id : user.id
      }

      // persist current user
      if (user && user.id) await window.userApi.setCurrentUserId(user.id)

      window.location.href = 'dashboard.html'
    } catch (err) {
      console.error('User save error', err)
      if (errorMsg) { errorMsg.textContent = 'Failed to save user'; errorMsg.classList.remove('hidden') }
    }
  })

  // Allow pressing Enter in the username input to submit
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      loginBtn.click()
    }
  })
});
