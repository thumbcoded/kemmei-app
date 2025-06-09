document.addEventListener("DOMContentLoaded", () => {
  const registerBtn = document.getElementById("register-btn");
  const usernameInput = document.getElementById("username-input");
  const emailInput = document.getElementById("email-input");
  const passwordInput = document.getElementById("password-input");
  const errorMsg = document.getElementById("register-error");

  registerBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !email || !password) {
      errorMsg.textContent = "All fields are required.";
      errorMsg.classList.remove("hidden");
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }

      alert("Registration successful! Please log in.");
      window.location.href = "index.html";
    } catch (err) {
      console.error("Registration error:", err);
      errorMsg.textContent = err.message;
      errorMsg.classList.remove("hidden");
    }
  });
});