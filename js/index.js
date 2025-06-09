document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("login-btn");
  const usernameInput = document.getElementById("username-input");
  const passwordInput = document.getElementById("password-input");
  const errorMsg = document.getElementById("login-error");

  loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      errorMsg.textContent = "Username and password are required.";
      errorMsg.classList.remove("hidden");
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed.");
      }

      localStorage.setItem("userId", data.user._id);
      localStorage.setItem("email", data.user.email);
      localStorage.setItem("role", data.user.role);
      localStorage.setItem("loginTime", new Date().toISOString());

      window.location.href = "dashboard.html";
    } catch (err) {
      console.error("Login error:", err);
      errorMsg.textContent = err.message;
      errorMsg.classList.remove("hidden");
    }
  });
});
