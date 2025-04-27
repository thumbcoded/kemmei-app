document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById("login-btn");
    const usernameInput = document.getElementById("username-input");
    const passwordInput = document.getElementById("password-input");
    const errorMsg = document.getElementById("login-error");
  
    loginBtn.addEventListener("click", () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
  
      if (!username || !password) {
        errorMsg.classList.remove("hidden");
      } else {
        localStorage.setItem("username", username);
        localStorage.setItem("password", password);
        errorMsg.classList.add("hidden");
        window.location.href = "dashboard.html";
      }
    });
  });
  