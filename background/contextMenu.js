import { saveWord, updateWord, getAllWords, findWordByText, getSettings, getDailyStats, recordCapture, trimContext } from "./storage.js";
import { generateExercises } from "./aiClient.js";
import { defaultGoalProgress } from "./srs.js";

const MENU_ID = "save-word";

// In-memory guard against firing a second generation call for a word that's
// already being generated in this service worker's lifetime — retryPendingWords
// runs on every popup open, and without this it would re-fire generation for
// a word captured seconds earlier whose first call hasn't resolved yet.
const inFlightGeneration = new Set();

// Generates exercises for a word and persists the result. Used both right
// after capture and to resume any word left stuck mid-generation (see
// retryPendingWords) — MV3 service workers can be torn down at any time once
// Chrome no longer sees tracked work pending, which silently kills a bare
// fire-and-forget fetch() and leaves a word stuck at "pending" forever if
// nothing ever retries it.
const MAX_AUTO_RETRIES = 3;

async function runGeneration(word) {
  if (inFlightGeneration.has(word.id)) return;
  inFlightGeneration.add(word.id);
  try {
    const { exercises, wordInfo, status, error } = await generateExercises(word.word, word.original_context);
    if (error) console.error(`[Contextual English Tracker] AI generation failed for "${word.word}":`, error);
    const retryCount = status === "failed" ? (word.retryCount || 0) + 1 : 0;
    await updateWord(word.id, {
      exercises,
      // Keep any previously generated wordInfo if this run failed to produce
      // one, so a transient failure doesn't wipe a working tooltip.
      wordInfo: wordInfo || word.wordInfo || null,
      exercisesStatus: status,
      exercisesError: error || null,
      retryCount,
    });
  } catch (err) {
    console.error(`[Contextual English Tracker] AI generation threw for "${word.word}":`, err);
    await updateWord(word.id, {
      exercisesStatus: "failed",
      exercisesError: err?.message || String(err),
      retryCount: (word.retryCount || 0) + 1,
    });
  } finally {
    inFlightGeneration.delete(word.id);
  }
}

// Runs generation for a batch of words with bounded concurrency, so a large
// word list (e.g. "Regenerate all exercises" on 200 words) doesn't fire 200
// simultaneous API requests and get rate-limited into failing all of them.
const GENERATION_CONCURRENCY = 4;

async function runGenerationBatch(words, onProgress) {
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < words.length) {
      const word = words[cursor++];
      await runGeneration(word);
      completed++;
      onProgress?.(completed, words.length);
    }
  }
  const workers = Array.from({ length: Math.min(GENERATION_CONCURRENCY, words.length) }, worker);
  await Promise.all(workers);
}

// Retries any word still stuck at "pending" (interrupted mid-generation, see
// runGeneration's comment) AND any word that previously "failed" (e.g. it
// was captured before a bug fix landed, or hit a transient API error) —
// otherwise a failed word stays stuck on the cloze-only fallback forever,
// since exercises are only ever generated once, at capture time. Failed
// words are capped at MAX_AUTO_RETRIES automatic attempts (this runs on
// every popup open) so a persistently broken key doesn't refire API calls
// forever — retryWord() below is still available for an explicit manual retry.
export async function retryPendingWords() {
  const words = await getAllWords();
  const retryable = words.filter(
    (w) =>
      !inFlightGeneration.has(w.id) &&
      (w.exercisesStatus === "pending" || (w.exercisesStatus === "failed" && (w.retryCount || 0) < MAX_AUTO_RETRIES))
  );
  await runGenerationBatch(retryable);
}

export async function retryWord(wordId) {
  const words = await getAllWords();
  const word = words.find((w) => w.id === wordId);
  if (word) await runGeneration(word);
}

// Regenerates exercises for every saved word, regardless of current status —
// used as a one-time migration when the AI prompt changes (e.g. adding
// explanation fields) so older words pick up the new format too. Batched with
// bounded concurrency (see runGenerationBatch) to avoid rate-limiting on a
// large vocabulary, with progress reported back to the caller.
export async function regenerateAllWords(onProgress) {
  const words = await getAllWords();
  await runGenerationBatch(words, onProgress);
  return words.length;
}

// Called on every onInstalled (including "update", where the menu from the
// previous version's install still exists) — chrome.contextMenus.create
// throws a duplicate-id error if the menu is already registered, so clear
// first.
export function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Save Word: "%s"',
      contexts: ["selection"],
    });
  });
}

async function flashBadge(text, color, durationMs = 1500) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, durationMs);
}

async function extractContextFromTab(tabId, fallbackText) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/sentenceExtractor.js"],
    });
  } catch {
    // already injected on this page; ignore
  }
  return chrome.tabs.sendMessage(tabId, { type: "EXTRACT_CONTEXT", fallbackText });
}

async function showToastOnTab(tabId, payload) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/captureToast.js"] });
  } catch {
    // already injected on this page; ignore
  }
  chrome.tabs.sendMessage(tabId, { type: "SHOW_CAPTURE_TOAST", payload }).catch(() => {});
}

export async function handleSaveWord(info, tab) {
  const selectedWord = (info.selectionText || "").trim();
  if (!selectedWord || !tab?.id) return;

  const stats = await getDailyStats();
  const settings = await getSettings();

  if (stats.wordsCapturedToday >= settings.dailyCaptureCap) {
    await flashBadge("!", "#d33");
    return;
  }

  const duplicate = await findWordByText(selectedWord);
  if (duplicate) {
    await flashBadge("=", "#e08a2b");
    await showToastOnTab(tab.id, { word: selectedWord, context: duplicate.original_context, duplicate: true });
    return;
  }

  let extracted;
  try {
    extracted = await extractContextFromTab(tab.id, selectedWord);
  } catch {
    extracted = null;
  }

  const context = trimContext(extracted?.context || selectedWord);

  const word = {
    id: `${Date.now()}`,
    word: selectedWord,
    original_context: context,
    source_url: tab.url || "",
    date_added: new Date().toISOString(),
    goalProgress: defaultGoalProgress(),
    exercises: null,
    exercisesStatus: "pending",
  };

  await saveWord(word);
  await recordCapture();
  await flashBadge("✓", "#2a9d3f");
  await showToastOnTab(tab.id, { word: selectedWord, context, wordId: word.id, duplicate: false });

  // Awaited (not fire-and-forget): MV3 service workers can be torn down as
  // soon as Chrome no longer sees tracked work pending. A detached
  // .then()/.catch() chain isn't tracked, so the worker could be killed
  // mid-fetch and leave the word stuck at "pending" forever. Awaiting here
  // keeps the worker alive for the duration of the call. retryPendingWords()
  // (run on service worker startup and whenever the popup opens) is a
  // backstop in case the worker is killed anyway before this resolves.
  await runGeneration(word);
}
