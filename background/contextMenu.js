import { saveWord, updateWord, getWord, getAllWords, findWordByText, getSettings, getDailyStats, recordCapture, trimContext } from "./storage.js";
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

// Shared by right-click capture and manual add in Settings: builds the word
// record, saves it, and runs generation. Returns a result the caller can use
// for its own feedback (toast vs. a form status message) rather than baking
// UI concerns in here.
async function captureWord({ word: selectedWord, context, sourceUrl }) {
  const stats = await getDailyStats();
  const settings = await getSettings();

  if (stats.wordsCapturedToday >= settings.dailyCaptureCap) {
    return { ok: false, reason: "cap-reached" };
  }

  const duplicate = await findWordByText(selectedWord);
  if (duplicate) {
    return { ok: false, reason: "duplicate", existing: duplicate };
  }

  const word = {
    id: `${Date.now()}`,
    word: selectedWord,
    original_context: context,
    source_url: sourceUrl || "",
    date_added: new Date().toISOString(),
    goalProgress: defaultGoalProgress(),
    exercises: null,
    exercisesStatus: "pending",
  };

  await saveWord(word);
  await recordCapture();

  // Awaited (not fire-and-forget): MV3 service workers can be torn down as
  // soon as Chrome no longer sees tracked work pending. A detached
  // .then()/.catch() chain isn't tracked, so the worker could be killed
  // mid-fetch and leave the word stuck at "pending" forever. Awaiting here
  // keeps the worker alive for the duration of the call. retryPendingWords()
  // (run on service worker startup and whenever the popup opens) is a
  // backstop in case the worker is killed anyway before this resolves.
  await runGeneration(word);

  return { ok: true, word };
}

export async function handleSaveWord(info, tab) {
  const selectedWord = (info.selectionText || "").trim();
  if (!selectedWord || !tab?.id) return;

  // Cheap pre-check so a capped or duplicate word skips extracting page
  // context entirely (no point injecting a content script for a save we're
  // about to reject). captureWord() re-checks the cap regardless, since a
  // second capture could land between this check and the save.
  const stats = await getDailyStats();
  const settings = await getSettings();
  if (stats.wordsCapturedToday >= settings.dailyCaptureCap) {
    await flashBadge("!", "#d33");
    return;
  }

  let extracted;
  try {
    extracted = await extractContextFromTab(tab.id, selectedWord);
  } catch {
    extracted = null;
  }
  const context = trimContext(extracted?.context || selectedWord);

  const result = await captureWord({ word: selectedWord, context, sourceUrl: tab.url });

  if (!result.ok && result.reason === "duplicate") {
    await flashBadge("=", "#e08a2b");
    await showToastOnTab(tab.id, { word: selectedWord, context: result.existing.original_context, duplicate: true });
    return;
  }
  if (!result.ok) {
    await flashBadge("!", "#d33");
    return;
  }

  await flashBadge("✓", "#2a9d3f");
  await showToastOnTab(tab.id, { word: selectedWord, context, wordId: result.word.id, duplicate: false });
}

// Sentinel the AI prompt recognizes as "no captured sentence — invent one"
// (see the system prompt's final rule in aiClient.js). Passing an instruction
// like "write a sentence using X" as if it were the original context would
// make cloze.sentence blank out the instruction itself, not an example. This
// is what's sent to the model — never shown to the user (see
// PLACEHOLDER_CONTEXT below for what's stored/displayed meanwhile).
const NO_CONTEXT_SENTINEL = "(none provided)";

// Shown in the word list while an invented sentence is pending, and left in
// place if generation ends up failing — so a failed manual add reads as
// "no example sentence yet" rather than the AI-facing sentinel leaking
// through, or a nonsensical "word (word)" from the local fallback's
// "____ (word)" cloze template.
const PLACEHOLDER_CONTEXT = "No example sentence yet.";

// Adds a word from the Settings "Add word" form rather than a page capture —
// same pipeline (dedupe, cap, save, generate), but with no source page to
// extract context from.
export async function addWordManually(word, context) {
  const trimmedWord = word.trim();
  if (!trimmedWord) return { ok: false, reason: "empty" };

  const trimmedContext = context?.trim();
  const result = await captureWord({
    word: trimmedWord,
    context: trimmedContext || NO_CONTEXT_SENTINEL,
    sourceUrl: "",
  });
  if (!result.ok || trimmedContext) return result;

  // No context was supplied, so original_context is currently the raw AI
  // sentinel — replace it with a user-facing placeholder immediately, then
  // overwrite that with the AI's invented sentence if generation succeeds.
  await updateWord(result.word.id, { original_context: PLACEHOLDER_CONTEXT });

  const generated = await getWord(result.word.id);
  const clozeSentence = generated?.exercisesStatus === "ready" ? generated?.exercises?.cloze?.sentence : null;
  if (clozeSentence) {
    const inventedSentence = clozeSentence.replace("____", trimmedWord);
    await updateWord(result.word.id, { original_context: trimContext(inventedSentence) });
  }

  return result;
}
