// Storage layer. Words live in chrome.storage.local: chrome.storage.sync
// caps each item at 8KB and each word now carries up to 8 AI-generated
// exercises (with explanations), which can exceed that on its own — local
// has a 10MB total cap and no per-item limit. Settings (API key aside) stay
// in sync since they're small and worth carrying across devices; the API key
// itself stays local-only regardless, since it should never leave the device.

const INDEX_KEY = "vocab_index";
const MAX_CONTEXT_CHARS = 500;

function wordKey(id) {
  return `word_${id}`;
}

export async function getIndex() {
  const result = await chrome.storage.local.get(INDEX_KEY);
  return result[INDEX_KEY] || [];
}

async function setIndex(index) {
  await chrome.storage.local.set({ [INDEX_KEY]: index });
}

export async function getAllWords() {
  const index = await getIndex();
  if (index.length === 0) return [];
  const result = await chrome.storage.local.get(index);
  return index.map((key) => result[key]).filter(Boolean);
}

export async function getWord(id) {
  const key = wordKey(id);
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

// Case-insensitive lookup for duplicate-capture detection.
export async function findWordByText(text) {
  const words = await getAllWords();
  const normalized = text.trim().toLowerCase();
  return words.find((w) => w.word.trim().toLowerCase() === normalized) || null;
}

export async function saveWord(word) {
  const key = wordKey(word.id);
  await chrome.storage.local.set({ [key]: word });

  const index = await getIndex();
  if (!index.includes(key)) {
    index.push(key);
    await setIndex(index);
  }
  return word;
}

export async function updateWord(id, patch) {
  const existing = await getWord(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  return saveWord(updated);
}

export async function deleteWord(id) {
  const key = wordKey(id);
  await chrome.storage.local.remove(key);
  const index = await getIndex();
  const next = index.filter((k) => k !== key);
  if (next.length !== index.length) await setIndex(next);
}

// Removes every saved word and resets daily stats (captured count, streak,
// goal progress) back to zero, for a full fresh start. Settings (API key,
// daily cap) are left untouched.
export async function clearAllData() {
  const index = await getIndex();
  const keysToRemove = [...index, INDEX_KEY, "dailyStats"];
  await chrome.storage.local.remove(keysToRemove);
}

export function trimContext(text, maxChars = MAX_CONTEXT_CHARS) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

// --- settings (sync) ---

const DEFAULT_SETTINGS = { dailyCaptureCap: 50, dailyReviewGoal: 10, cefrLevel: "B2" };

export async function getSettings() {
  const result = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

// --- daily stats (local) ---

function todayString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

const DEFAULT_STATS = {
  date: null,
  wordsCapturedToday: 0,
  reviewQueueClearedToday: false,
  reviewsCompletedToday: 0,
  reviewsDueToday: 0,
  hunterStreak: 0,
  lastStreakDate: null,
};

export async function getDailyStats() {
  const result = await chrome.storage.local.get("dailyStats");
  const stats = { ...DEFAULT_STATS, ...(result.dailyStats || {}) };
  const today = todayString();

  if (stats.date !== today) {
    // Roll forward: streak breaks if a day was skipped entirely.
    const wasYesterday = isYesterday(stats.date, today);
    const rolled = {
      ...stats,
      date: today,
      wordsCapturedToday: 0,
      reviewQueueClearedToday: false,
      reviewsCompletedToday: 0,
      reviewsDueToday: 0,
      hunterStreak: wasYesterday ? stats.hunterStreak : 0,
    };
    await chrome.storage.local.set({ dailyStats: rolled });
    return rolled;
  }
  return stats;
}

function isYesterday(dateStr, todayStr) {
  if (!dateStr) return false;
  const prev = new Date(dateStr + "T00:00:00Z");
  const today = new Date(todayStr + "T00:00:00Z");
  const diffDays = Math.round((today - prev) / 86400000);
  return diffDays === 1;
}

export async function setDailyStats(patch) {
  const current = await getDailyStats();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ dailyStats: next });
  return next;
}

export async function recordCapture() {
  const stats = await getDailyStats();
  const wordsCapturedToday = stats.wordsCapturedToday + 1;
  let hunterStreak = stats.hunterStreak;
  let lastStreakDate = stats.lastStreakDate;

  if (wordsCapturedToday >= 3 && stats.lastStreakDate !== stats.date) {
    hunterStreak += 1;
    lastStreakDate = stats.date;
  }

  return setDailyStats({ wordsCapturedToday, hunterStreak, lastStreakDate });
}

// --- API key (local only, never synced) ---

export async function getApiKey() {
  const result = await chrome.storage.local.get("apiKey");
  return result.apiKey || null;
}

export async function setApiKey(key) {
  await chrome.storage.local.set({ apiKey: key });
}
