const form = document.getElementById("login-form");
const usernameInput = document.getElementById("username");

form.addEventListener("submit", function(event) {
  event.preventDefault();

  const username = usernameInput.value;

  // Save the username so we can use it on the next page
  localStorage.setItem("kemmeiUser", username);

  // Redirect to the dashboard
  window.location.href = "dashboard.html";
});
