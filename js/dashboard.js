document.addEventListener("DOMContentLoaded", () => {
  const userId = localStorage.getItem("userId");
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");

  if (!userId || !email || !role) {
    // Redirect to login if not authenticated
    window.location.href = "index.html";
    return;
  }

  const greeting = document.getElementById("greeting");
  const roleText = role === "admin" ? " (Admin)" : "";
  greeting.textContent = `Hello, ${userId}${roleText} 👋`;

  // Hide admin panel link for non-admin users
  const adminLink = document.querySelector('a[href="admin.html"]');
  if (adminLink && role !== "admin") {
    adminLink.style.display = "none";
  }

  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  });

  // Dark Mode Toggle Functionality
  const darkModeToggle = document.getElementById("darkModeToggle");

  // Load saved dark mode preference
  const savedDarkMode = localStorage.getItem("darkMode") === "true";
  if (savedDarkMode) {
    document.body.classList.add("dark-theme");
    darkModeToggle.checked = true;
  }

  // Toggle dark mode
  darkModeToggle.addEventListener("change", () => {
    const isDark = darkModeToggle.checked;
    document.body.classList.toggle("dark-theme", isDark);
    localStorage.setItem("darkMode", isDark);
  });
});
