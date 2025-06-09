document.addEventListener("DOMContentLoaded", async () => {
  const statsDiv = document.getElementById("progressStats");
  const resetBtn = document.getElementById("resetProgress");
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  try {
    const res = await fetch(`http://localhost:3000/api/user-progress/${userId}`);
    const progress = await res.json();

    if (!Object.keys(progress).length) {
      statsDiv.textContent = "No progress yet. Go study!";
      return;
    }

    Object.entries(progress)
      .sort((a, b) => new Date(b[1].lastSession) - new Date(a[1].lastSession))
      .forEach(([key, data]) => {
        const div = document.createElement("div");
        const accuracy = data.total ? Math.round((data.correct / data.total) * 100) : 0;

        div.innerHTML = `
          <p><strong>${key}</strong></p>
          <p>🧠 Viewed: ${data.viewed}</p>
          <p>✅ Correct: ${data.correct} / ${data.total} (${accuracy}%)</p>
          <p>🕒 Last session: ${new Date(data.lastSession).toLocaleString()}</p>
          <div class="bar"><div class="bar-fill" style="width: ${accuracy}%;"></div></div>
        `;
        statsDiv.appendChild(div);
      });

    resetBtn.addEventListener("click", () => {
      alert("🔒 Server-side reset not yet implemented. Ask admin to wipe manually.");
    });
  } catch (err) {
    console.error("❌ Failed to load user progress:", err);
    statsDiv.textContent = "Error loading progress.";
  }
});
