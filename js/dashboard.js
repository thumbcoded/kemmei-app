document.addEventListener("DOMContentLoaded", () => {
  const username = localStorage.getItem("username");
  const greeting = document.getElementById("greeting");
  const logoutBtn = document.getElementById("logout-btn");
  const todayDate = document.getElementById("today-date");

  // Redirect if not logged in
  if (!username) {
    window.location.href = "index.html";
  }

  greeting.textContent = `Hello, ${username} 👋`;

  const today = new Date();
  todayDate.textContent = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  });
});
