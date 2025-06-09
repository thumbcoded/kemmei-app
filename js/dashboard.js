document.addEventListener("DOMContentLoaded", () => {
  const userId = localStorage.getItem("userId");
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");

  if (!userId || !email || !role) {
    localStorage.clear();
    window.location.href = "index.html";
    return;
  }

  const greeting = document.getElementById("greeting");
  greeting.textContent = `Hello, ${userId} 👋`;

  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  });
});
