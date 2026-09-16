import { getApiKey, setApiKey, getSettings, setSettings, clearAllData, getAllWords } from "../background/storage.js";
import { GOAL_KEYS, isGoalUnlocked, isWordMastered, isLeech } from "../background/srs.js";

const apiKeyInput = document.getElementById("apiKey");
const dailyCapInput = document.getElementById("dailyCap");
const dailyGoalInput = document.getElementById("dailyGoal");
const cefrLevelSelect = document.getElementById("cefrLevel");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");
const clearDataBtn = document.getElementById("clearDataBtn");
const clearStatus = document.getElementById("clearStatus");
const regenerateBtn = document.getElementById("regenerateBtn");
const regenerateStatus = document.getElementById("regenerateStatus");
const regenerateProgressTrack = document.getElementById("regenerateProgressTrack");
const regenerateProgressFill = document.getElementById("regenerateProgressFill");
const wordListEl = document.getElementById("wordList");
const wordFiltersEl = document.getElementById("wordFilters");
const addWordInput = document.getElementById("addWordInput");
const addContextInput = document.getElementById("addContextInput");
const addWordBtn = document.getElementById("addWordBtn");
const addWordStatus = document.getElementById("addWordStatus");

let wordListGrouping = "source"; // "source" | "flat"

async function load() {
  const [apiKey, settings] = await Promise.all([getApiKey(), getSettings()]);
  if (apiKey) apiKeyInput.value = apiKey;
  dailyCapInput.value = settings.dailyCaptureCap;
  dailyGoalInput.value = settings.dailyReviewGoal;
  cefrLevelSelect.value = settings.cefrLevel;
  await renderWordList();
}

async function save() {
  const key = apiKeyInput.value.trim();
  const cap = Math.max(1, Math.min(50, Number(dailyCapInput.value) || 50));
  const goal = Math.max(1, Math.min(200, Number(dailyGoalInput.value) || 10));

  await setApiKey(key);
  await setSettings({ dailyCaptureCap: cap, dailyReviewGoal: goal, cefrLevel: cefrLevelSelect.value });

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
  if (isWordMastered(word)) return { text: "Mastered", cls: "mastered" };
  if (isLeech(word)) return { text: "Needs work", cls: "leech" };
  if (word.exercisesStatus === "ready") return { text: "Ready", cls: "ready" };
  if (word.exercisesStatus === "failed") return { text: "Failed", cls: "failed" };
  return { text: "Pending", cls: "" };
}

async function handleAddWord() {
  const word = addWordInput.value.trim();
  const context = addContextInput.value.trim();
  if (!word) {
    addWordStatus.style.color = "var(--fail)";
    addWordStatus.textContent = "Enter a word first.";
    return;
  }

  addWordBtn.disabled = true;
  addWordBtn.textContent = "Adding…";
  addWordStatus.textContent = "";

  const result = await chrome.runtime
    .sendMessage({ type: "ADD_WORD_MANUALLY", word, context })
    .catch(() => null);

  addWordBtn.disabled = false;
  addWordBtn.textContent = "Add word";

  if (result?.ok) {
    addWordInput.value = "";
    addContextInput.value = "";
    addWordStatus.style.color = "var(--good)";
    addWordStatus.textContent = `Added "${result.word.word}".`;
    await renderWordList();
  } else {
    addWordStatus.style.color = "var(--fail)";
    addWordStatus.textContent =
      result?.reason === "duplicate"
        ? `You already have "${word}" saved.`
        : result?.reason === "cap-reached"
        ? "Today's daily capture cap is reached — raise it above, or try again tomorrow."
        : "Something went wrong adding that word.";
  }
  setTimeout(() => (addWordStatus.textContent = ""), 4000);
}

// Groups words by source_url (the page they were captured from), so words
// met together in one article stay visually associated instead of sitting
// as isolated, unrelated facts in a flat list. Words with no source_url
// (manually added) get their own group.
function groupWordsBySource(words) {
  const groups = new Map(); // sourceUrl -> words[]
  for (const word of words) {
    const key = word.source_url || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(word);
  }
  // Sort groups by their most recently added word, newest first.
  return [...groups.entries()].sort((a, b) => {
    const latestA = Math.max(...a[1].map((w) => new Date(w.date_added).getTime()));
    const latestB = Math.max(...b[1].map((w) => new Date(w.date_added).getTime()));
    return latestB - latestA;
  });
}

function buildWordRow(word) {
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

  const unlockedCount = GOAL_KEYS.filter((g) => isGoalUnlocked(word, g)).length;
  const goalsBadge = document.createElement("span");
  goalsBadge.className = "word-row-status";
  goalsBadge.title = "Learning goals unlocked so far";
  goalsBadge.textContent = `${unlockedCount}/${GOAL_KEYS.length} goals`;
  wordLine.appendChild(goalsBadge);
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

  return row;
}

function sourceGroupLabel(sourceUrl) {
  if (!sourceUrl) return "Added manually";
  try {
    const url = new URL(sourceUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return sourceUrl;
  }
}

function renderWordFilters(words) {
  wordFiltersEl.innerHTML = "";
  if (words.length < 2) return; // grouping isn't useful for 0-1 words

  const makeBtn = (label, grouping) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "word-filter-btn" + (wordListGrouping === grouping ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      wordListGrouping = grouping;
      renderWordList();
    });
    return btn;
  };
  wordFiltersEl.appendChild(makeBtn("Grouped by source", "source"));
  wordFiltersEl.appendChild(makeBtn("All words", "flat"));
}

async function renderWordList() {
  const words = await getAllWords();
  wordListEl.innerHTML = "";
  renderWordFilters(words);

  if (words.length === 0) {
    const empty = document.createElement("div");
    empty.className = "word-list-empty";
    empty.textContent = "No words captured yet.";
    wordListEl.appendChild(empty);
    return;
  }

  const sorted = [...words].sort((a, b) => new Date(b.date_added) - new Date(a.date_added));

  if (wordListGrouping === "flat" || words.length < 2) {
    for (const word of sorted) wordListEl.appendChild(buildWordRow(word));
    return;
  }

  for (const [sourceUrl, groupWords] of groupWordsBySource(sorted)) {
    const heading = document.createElement("div");
    heading.className = "word-group-heading";
    if (sourceUrl) {
      const link = document.createElement("a");
      link.href = sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = sourceGroupLabel(sourceUrl);
      heading.appendChild(link);
      heading.append(` — ${groupWords.length} word${groupWords.length === 1 ? "" : "s"}`);
    } else {
      heading.textContent = `${sourceGroupLabel(sourceUrl)} — ${groupWords.length} word${groupWords.length === 1 ? "" : "s"}`;
    }
    wordListEl.appendChild(heading);
    for (const word of groupWords) wordListEl.appendChild(buildWordRow(word));
  }
}

saveBtn.addEventListener("click", save);
clearDataBtn.addEventListener("click", handleClearData);
regenerateBtn.addEventListener("click", handleRegenerateAll);
addWordBtn.addEventListener("click", handleAddWord);
addWordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAddWord();
});
load();
