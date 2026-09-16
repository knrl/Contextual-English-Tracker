import { getAllWords, updateWord, getDailyStats, setDailyStats, getSettings } from "../background/storage.js";
import { getDueGoalPairs, applyGradeToGoal, shuffle, isGoalUnlocked, GOAL_KEYS } from "../background/srs.js";
import { EXERCISE_TYPES, getDisplayAnswer, pickExerciseKeyForGoal } from "../background/exerciseTypes.js";

const onboardingState = document.getElementById("onboardingState");
const emptyState = document.getElementById("emptyState");
const emptyStateMessage = document.getElementById("emptyStateMessage");
const reviewMoreBtn = document.getElementById("reviewMoreBtn");
const reviewCard = document.getElementById("reviewCard");
const progressEl = document.getElementById("progress");
const wordBadge = document.getElementById("wordBadge");
const goalProgressEl = document.getElementById("goalProgress");
const wordTooltip = document.getElementById("wordTooltip");
const wordTooltipDef = document.getElementById("wordTooltipDef");
const wordTooltipPos = document.getElementById("wordTooltipPos");
const exerciseBody = document.getElementById("exerciseBody");
const answerBox = document.getElementById("answerBox");
const showAnswerBtn = document.getElementById("showAnswerBtn");
const captureStat = document.getElementById("captureStat");
const streakStat = document.getElementById("streakStat");
const goalBarFill = document.getElementById("goalBarFill");
const goalLabel = document.getElementById("goalLabel");
const capWarning = document.getElementById("capWarning");
const onboardingSettingsLink = document.getElementById("onboardingSettingsLink");

let queue = []; // [{ word, goal, exerciseKey }]
let currentIndex = 0;
let totalDueAtStart = 0;
let allWordsCache = [];
let answerRevealed = false;

function fallbackExercises(word) {
  return {
    cloze: {
      sentence: word.exercises?.cloze?.sentence || `____ (${word.word})`,
      explanation: word.exercises?.cloze?.explanation || "",
    },
  };
}

function section(title, contentEl) {
  const wrapper = document.createElement("div");
  wrapper.className = "exercise-section";
  const label = document.createElement("div");
  label.className = "exercise-title";
  label.textContent = title;
  wrapper.appendChild(label);
  wrapper.appendChild(contentEl);
  return wrapper;
}

// Multiple-choice options are display-only here — selecting one does not
// reveal the answer inline. All exercise types reveal exclusively through
// Show Answer / Space, so there's one consistent mechanism instead of
// competing per-type reveal behaviors (clicking an option, a <details>
// element, and the answer box all doing slightly different things).
function renderMultipleChoice(exercise, promptText) {
  const wrap = document.createElement("div");
  const promptEl = document.createElement("div");
  promptEl.className = "exercise-sentence";
  promptEl.textContent = promptText;
  wrap.appendChild(promptEl);

  const list = document.createElement("div");
  list.className = "options-list";
  exercise.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.disabled = true;
    list.appendChild(btn);
  });
  wrap.appendChild(list);
  return wrap;
}

function markOptionsRevealed(exercise) {
  document.querySelectorAll(".option-btn").forEach((btn) => {
    if (btn.textContent === exercise.answer) btn.classList.add("correct");
  });
}

function renderSentence(sentenceText) {
  const el = document.createElement("div");
  el.className = "exercise-sentence";
  el.textContent = sentenceText;
  return el;
}

// Free-text types (paraphrase, creative, scenario response) no longer take
// typed input — a typed answer was never read, graded, or stored, which is
// worse than no input box at all. Instead: compose your answer in your head,
// then Show Answer reveals a model example to self-grade against.
function renderCompose(promptText, instructionText) {
  const wrap = document.createElement("div");
  const promptEl = document.createElement("div");
  promptEl.className = "exercise-sentence";
  promptEl.textContent = promptText;
  wrap.appendChild(promptEl);

  if (instructionText) {
    const instr = document.createElement("div");
    instr.className = "exercise-instruction";
    instr.textContent = instructionText;
    wrap.appendChild(instr);
  }

  const composeHint = document.createElement("div");
  composeHint.className = "compose-prompt";
  composeHint.textContent = "Compose your answer in your head, then reveal a model example.";
  wrap.appendChild(composeHint);
  return wrap;
}

const RENDERERS = {
  cloze: (ex) => renderSentence(ex.sentence || ""),
  definitionMatch: (ex) => renderMultipleChoice(ex, ex.definition),
  editor: (ex) => renderSentence(ex.sentence),
  correctForm: (ex) => renderCompose(ex.sentence, `Fill in the correct form of "${ex.baseWord}".`),
  paraphraseRewrite: (ex) => renderCompose(ex.sentence, ex.instruction),
  synonymTrap: (ex) => renderMultipleChoice(ex, ex.sentence),
  creative: (ex) => renderCompose(ex.prompt, null),
  scenarioResponse: (ex) => renderCompose(ex.scenario, null),
};

const MULTIPLE_CHOICE_TYPES = new Set(["definitionMatch", "synonymTrap"]);

let currentAnswer = { answer: "", explanation: "" };
let currentExerciseForReveal = null;

function renderExercise(word, exerciseKey) {
  const exercises = word.exercisesStatus === "ready" ? word.exercises : fallbackExercises(word);
  const exercise = exercises[exerciseKey] || exercises.cloze;
  const key = exercises[exerciseKey] ? exerciseKey : "cloze";
  const meta = EXERCISE_TYPES[key];

  exerciseBody.innerHTML = "";

  if (word.exercisesStatus === "failed" && word.exercisesError) {
    const errEl = document.createElement("div");
    errEl.className = "ai-error-note";
    errEl.textContent = `AI generation failed, showing basic fallback: ${word.exercisesError}`;
    exerciseBody.appendChild(errEl);

    const retryBtn = document.createElement("button");
    retryBtn.className = "retry-ai-btn";
    retryBtn.textContent = "Retry AI generation";
    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      retryBtn.textContent = "Retrying…";
      await chrome.runtime.sendMessage({ type: "RETRY_WORD", wordId: word.id }).catch(() => {});
      const words = await getAllWords();
      allWordsCache = words;
      const refreshed = words.find((w) => w.id === word.id);
      if (refreshed) {
        queue[currentIndex] = { ...queue[currentIndex], word: refreshed };
        renderCurrent();
      }
    });
    exerciseBody.appendChild(retryBtn);
  } else if (word.exercisesStatus === "pending") {
    const pendingEl = document.createElement("div");
    pendingEl.className = "ai-error-note";
    pendingEl.textContent = "AI exercises still generating — showing basic fallback for now.";
    exerciseBody.appendChild(pendingEl);
  }

  const contentEl = RENDERERS[key](exercise);
  exerciseBody.appendChild(section(meta.label, contentEl));

  currentAnswer = getDisplayAnswer(key, exercise, word.word);
  currentExerciseForReveal = MULTIPLE_CHOICE_TYPES.has(key) ? exercise : null;
  answerRevealed = false;
  answerBox.classList.add("hidden");
  answerBox.innerHTML = "";
}

function renderCurrent() {
  refreshStats();
  if (currentIndex >= queue.length) {
    reviewCard.classList.add("hidden");
    emptyState.classList.remove("hidden");
    updateReviewMoreVisibility();
    return;
  }
  emptyState.classList.add("hidden");
  reviewCard.classList.remove("hidden");
  progressEl.textContent = `${currentIndex + 1} / ${queue.length}`;
  const { word, goal, exerciseKey } = queue[currentIndex];
  wordBadge.textContent = word.word;
  renderWordTooltip(word);
  renderGoalProgress(word, goal);
  renderExercise(word, exerciseKey);
}

// Hover/focus on the word badge reveals its meaning, for when you want to
// remind yourself what the word means before attempting the exercise. No
// restriction on which card types allow it — self-grading is on the honour
// system, so peeking just means grading yourself accordingly.
function renderWordTooltip(word) {
  hideWordTooltip();
  const info = word.wordInfo;
  const definition = info?.definition?.trim();

  // Older words generated before wordInfo existed have no definition; keep
  // the badge inert rather than showing an empty tooltip.
  wordBadge.classList.toggle("has-tooltip", !!definition);
  wordTooltipDef.textContent = definition || "";
  wordTooltipPos.textContent = info?.partOfSpeech?.trim() || "";
  wordTooltipPos.classList.toggle("hidden", !info?.partOfSpeech?.trim());
}

function showWordTooltip() {
  if (wordBadge.classList.contains("has-tooltip")) {
    wordTooltip.classList.remove("hidden");
  }
}

function hideWordTooltip() {
  wordTooltip.classList.add("hidden");
}

// Shows which goal this exercise belongs to and how far the word has come
// through the ramp, so a locked goal reads as "not yet" rather than as
// missing content.
function renderGoalProgress(word, goal) {
  const unlockedCount = GOAL_KEYS.filter((g) => isGoalUnlocked(word, g)).length;
  const label = goal.charAt(0).toUpperCase() + goal.slice(1);
  goalProgressEl.textContent = `${label} · ${unlockedCount} of ${GOAL_KEYS.length} goals unlocked`;
}

async function refreshStats() {
  const stats = await getDailyStats();
  const settings = await getSettings();
  captureStat.textContent = `Captured: ${stats.wordsCapturedToday} / ${settings.dailyCaptureCap}`;
  streakStat.textContent = `🔥 ${stats.hunterStreak}`;
  capWarning.classList.toggle("hidden", stats.wordsCapturedToday < settings.dailyCaptureCap);

  const goal = Math.max(settings.dailyReviewGoal, stats.reviewsDueToday, totalDueAtStart);
  const done = stats.reviewsCompletedToday;
  const pct = goal === 0 ? 100 : Math.min(100, Math.round((done / goal) * 100));
  goalBarFill.style.width = `${pct}%`;
  goalLabel.textContent =
    goal === 0
      ? `${done} reviewed today`
      : done >= goal
      ? `Goal met — ${done} reviewed today`
      : `${done} / ${goal} today's goal`;
}

// Unlocked goals that aren't due yet and aren't already queued — the pool
// "Review more" draws from, soonest-due first. Locked goals are excluded:
// the difficulty ramp is a hard gate, not just a default ordering.
function collectNotYetDuePairs() {
  const now = new Date();
  const notYetDue = [];
  for (const word of allWordsCache) {
    for (const goal of Object.keys(word.goalProgress || {})) {
      if (!isGoalUnlocked(word, goal)) continue;
      const g = word.goalProgress[goal];
      const alreadyQueued = queue.some((q) => q.word.id === word.id && q.goal === goal);
      if (!alreadyQueued && new Date(g.next_review_date) > now) {
        notYetDue.push({ word, goal, dueAt: g.next_review_date });
      }
    }
  }
  notYetDue.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  return notYetDue;
}

function updateReviewMoreVisibility() {
  reviewMoreBtn.classList.toggle("hidden", collectNotYetDuePairs().length === 0);
  emptyStateMessage.textContent =
    currentIndex === 0 && totalDueAtStart === 0
      ? "No words due for review right now."
      : "Today's goal is cleared. Nice work!";
}

async function reviewMore(count = 5) {
  const extra = collectNotYetDuePairs().slice(0, count);
  queue = [...queue, ...extra.map(({ word, goal }) => ({ word, goal, exerciseKey: pickExerciseKeyForGoal(word, goal) }))];
  renderCurrent();
}

async function handleGrade(grade) {
  const { word, goal } = queue[currentIndex];
  const goalProgress = applyGradeToGoal(word, goal, grade);
  await updateWord(word.id, { goalProgress });
  currentIndex += 1;

  const stats = await getDailyStats();
  await setDailyStats({ reviewsCompletedToday: stats.reviewsCompletedToday + 1 });

  if (currentIndex >= queue.length) {
    await setDailyStats({ reviewQueueClearedToday: true });
  }
  renderCurrent();
}

function handleShowAnswer() {
  if (answerRevealed) return;
  answerRevealed = true;

  if (currentExerciseForReveal) markOptionsRevealed(currentExerciseForReveal);

  answerBox.innerHTML = "";

  if (currentAnswer.answer) {
    const mainEl = document.createElement("div");
    mainEl.className = "answer-box-main";
    mainEl.textContent = currentAnswer.answer;
    answerBox.appendChild(mainEl);
  }

  if (currentAnswer.explanation) {
    const explEl = document.createElement("div");
    explEl.className = "answer-box-explanation";
    explEl.textContent = currentAnswer.explanation;
    answerBox.appendChild(explEl);
  }

  answerBox.classList.remove("hidden");
}

function handleKeydown(e) {
  if (reviewCard.classList.contains("hidden")) return; // only while an exercise is actually showing

  if (e.code === "Space") {
    e.preventDefault();
    handleShowAnswer();
  } else if (["1", "2", "3", "4"].includes(e.key)) {
    e.preventDefault();
    handleGrade(Number(e.key));
  }
}

async function init() {
  // Fire-and-forget from the popup's perspective: if any word is stuck in
  // "pending" (e.g. the service worker was killed mid-generation last time),
  // ask the background script to retry it. Doesn't block the popup's own
  // render — the retried word will show up correctly next time it's opened.
  chrome.runtime.sendMessage({ type: "RETRY_PENDING_WORDS" }).catch(() => {});

  const words = await getAllWords();
  allWordsCache = words;

  if (words.length === 0) {
    onboardingState.classList.remove("hidden");
    onboardingSettingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  const duePairs = shuffle(getDueGoalPairs(words));
  queue = duePairs.map(({ word, goal }) => ({ word, goal, exerciseKey: pickExerciseKeyForGoal(word, goal) }));
  currentIndex = 0;
  totalDueAtStart = duePairs.length;

  const stats = await getDailyStats();
  if (stats.reviewsDueToday < totalDueAtStart) {
    await setDailyStats({ reviewsDueToday: totalDueAtStart });
  }

  await refreshStats();
  renderCurrent();

  document.querySelectorAll(".grade").forEach((btn) => {
    btn.addEventListener("click", () => handleGrade(Number(btn.dataset.grade)));
  });
  showAnswerBtn.addEventListener("click", handleShowAnswer);
  reviewMoreBtn.addEventListener("click", () => reviewMore());
  document.addEventListener("keydown", handleKeydown);

  wordBadge.addEventListener("mouseenter", showWordTooltip);
  wordBadge.addEventListener("mouseleave", hideWordTooltip);
  wordBadge.addEventListener("focus", showWordTooltip);
  wordBadge.addEventListener("blur", hideWordTooltip);
}

init();
