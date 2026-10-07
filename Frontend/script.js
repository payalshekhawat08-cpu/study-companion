// This fake function pretends to be the backend.
// LATER: replace its body with a fetch() call to your Python server.
function fakeAsk(question) {
  return {
    answer: "prime minister of india is narendra modi (fake answer)",
    citations: ["Textbook p.12", "Lecture video 14:32"]
  };
}

function addMessage(text, who, citations = []) {
  const box = document.createElement("div");
  box.className = "msg " + who;
  box.textContent = text;
  citations.forEach(label => {
    const chip = document.createElement("span");
    chip.className = "cite";
    chip.textContent = label;
    box.appendChild(chip);
  });
  document.getElementById("chat").appendChild(box);
}

document.getElementById("send").onclick = () => {
  const input = document.getElementById("question");
  const q = input.value.trim();
  if (!q) return;
  addMessage(q, "user");
  const reply = fakeAsk(q);
  addMessage(reply.answer, "bot", reply.citations);
  input.value = "";
};
// Switch between Chat / Quiz / Dashboard
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById("view-" + tab.dataset.view).classList.remove("hidden");
  };
});

// Fake quiz answer check
document.querySelectorAll(".option").forEach(opt => {
  opt.onclick = () => {
    const correct = opt.textContent === "Stack";
    document.getElementById("quiz-feedback").textContent =
      correct ? "Correct! (Textbook p.12)" : "Not quite. See Textbook p.12.";
  };
});