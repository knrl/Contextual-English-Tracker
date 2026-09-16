import { getApiKey, setApiKey, getSettings, setSettings, clearAllData, getAllWords } from "../background/storage.js";

const apiKeyInput = document.getElementById("apiKey");
const dailyCapInput = document.getElementById("dailyCap");
const dailyGoalInput = document.getElementById("dailyGoal");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");
const clearDataBtn = document.getElementById("clearDataBtn");
const clearStatus = document.getElementById("clearStatus");
const regenerateBtn = document.getElementById("regenerateBtn");
const regenerateStatus = document.getElementById("regenerateStatus");
const regenerateProgressTrack = document.getElementById("regenerateProgressTrack");
const regenerateProgressFill = document.getElementById("regenerateProgressFill");
const wordListEl = document.getElementById("wordList");

async function load() {
  const [apiKey, settings] = await Promise.all([getApiKey(), getSettings()]);
  if (apiKey) apiKeyInput.value = apiKey;
  dailyCapInput.value = settings.dailyCaptureCap;
  dailyGoalInput.value = settings.dailyReviewGoal;
  await renderWordList();
}

async function save() {
  const key = apiKeyInput.value.trim();
  const cap = Math.max(1, Math.min(50, Number(dailyCapInput.value) || 50));
  const goal = Math.max(1, Math.min(200, Number(dailyGoalInput.value) || 10));

  await setApiKey(key);
  await setSettings({ dailyCaptureCap: cap, dailyReviewGoal: goal });

  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 2000);
}

async function handleClearData() {
  const confirmed = window.confirm(
    "This permanently deletes all saved words and resets your daily stats/streak. This cannot be undone. Continue?"
  );
  if (!confirmed) return;

  await clearAllData();
  clearStatus.textContent = "All words and stats cleared.";
  setTimeout(() => (clearStatus.textContent = ""), 3000);
  await renderWordList();
}

async function handleRegenerateAll() {
  regenerateBtn.disabled = true;
  regenerateBtn.textContent = "Regenerating…";
  regenerateStatus.textContent = "";
  regenerateProgressTrack.classList.add("active");
  regenerateProgressFill.style.width = "0%";

  const progressListener = (message) => {
    if (message?.type === "REGENERATE_PROGRESS") {
      const pct = message.total === 0 ? 100 : Math.round((message.completed / message.total) * 100);
      regenerateProgressFill.style.width = `${pct}%`;
      regenerateStatus.textContent = `${message.completed} / ${message.total} words…`;
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  const response = await chrome.runtime.sendMessage({ type: "REGENERATE_ALL_WORDS" }).catch(() => null);

  chrome.runtime.onMessage.removeListener(progressListener);
  regenerateBtn.disabled = false;
  regenerateBtn.textContent = "Regenerate all exercises";
  regenerateProgressTrack.classList.remove("active");
  regenerateStatus.textContent = response?.ok
    ? `Done — regenerated exercises for ${response.count} word${response.count === 1 ? "" : "s"}.`
    : "Something went wrong. Check the extension's service worker console for details.";
  setTimeout(() => (regenerateStatus.textContent = ""), 5000);
  await renderWordList();
}

function statusLabel(word) {
  if (word.exercisesStatus === "ready") return { text: "Ready", cls: "ready" };
  if (word.exercisesStatus === "failed") return { text: "Failed", cls: "failed" };
  return { text: "Pending", cls: "" };
}

async function renderWordList() {
  const words = await getAllWords();
  wordListEl.innerHTML = "";

  if (words.length === 0) {
    const empty = document.createElement("div");
    empty.className = "word-list-empty";
    empty.textContent = "No words captured yet.";
    wordListEl.appendChild(empty);
    return;
  }

  const sorted = [...words].sort((a, b) => new Date(b.date_added) - new Date(a.date_added));

  for (const word of sorted) {
    const row = document.createElement("div");
    row.className = "word-row";

    const main = document.createElement("div");
    main.className = "word-row-main";

    const wordLine = document.createElement("div");
    const wordText = document.createElement("span");
    wordText.className = "word-row-word";
    wordText.textContent = word.word;
    wordLine.appendChild(wordText);

    const { text, cls } = statusLabel(word);
    const statusBadge = document.createElement("span");
    statusBadge.className = `word-row-status ${cls}`;
    statusBadge.textContent = text;
    wordLine.appendChild(statusBadge);
    main.appendChild(wordLine);

    const contextEl = document.createElement("div");
    contextEl.className = "word-row-context";
    contextEl.title = word.original_context;
    contextEl.textContent = word.original_context;
    main.appendChild(contextEl);

    if (word.source_url) {
      const sourceLink = document.createElement("a");
      sourceLink.className = "word-row-source";
      sourceLink.href = word.source_url;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.textContent = "View source";
      main.appendChild(sourceLink);
    }

    row.appendChild(main);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "word-row-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm(`Delete "${word.word}"? This cannot be undone.`);
      if (!confirmed) return;
      await chrome.runtime.sendMessage({ type: "DELETE_WORD", wordId: word.id }).catch(() => {});
      await renderWordList();
    });
    row.appendChild(deleteBtn);

    wordListEl.appendChild(row);
  }
}

saveBtn.addEventListener("click", save);
clearDataBtn.addEventListener("click", handleClearData);
regenerateBtn.addEventListener("click", handleRegenerateAll);
load();
