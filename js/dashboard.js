document.addEventListener("DOMContentLoaded", async () => {
  const userId = localStorage.getItem("userId");
  console.log("Retrieved userId from localStorage:", userId);
  if (!userId) {
    // Redirect to login if not authenticated
    window.location.href = "index.html";
    return;
  }

  try {
    // Fetch user details from the backend
    const response = await fetch(`http://localhost:3000/api/users/${userId}`);
    console.log("Fetch response status:", response.status);
    if (!response.ok) {
      throw new Error("Failed to fetch user details");
    }

    const user = await response.json();
    console.log("Fetched user details:", user);
    const role = user.role;

    const greeting = document.getElementById("greeting");
    const roleText = role === "admin" ? " (Admin)" : "";
    greeting.textContent = `Hello, ${userId}${roleText} 👋`;

    // Hide admin panel link for non-admin users
    const adminLink = document.querySelector('a[href="admin.html"]');
    if (adminLink && role !== "admin") {
      adminLink.style.display = "none";
    }
  } catch (error) {
    console.error("Error fetching user details:", error);
    window.location.href = "index.html";
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
