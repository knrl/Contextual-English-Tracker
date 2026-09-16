// Central registry of exercise types, grouped by learning goal. Shared by the
// AI prompt/schema validation (aiClient.js) and the popup's renderer, so
// adding a new type only requires touching this file plus its two consumers.

export const GOALS = {
  MEMORIZATION: "memorization",
  GRAMMAR: "grammar",
  PARAPHRASE: "paraphrase",
  USAGE: "usage",
};

export const EXERCISE_TYPES = {
  cloze: { goal: GOALS.MEMORIZATION, label: "Cloze Deletion" },
  definitionMatch: { goal: GOALS.MEMORIZATION, label: "Definition Match" },
  editor: { goal: GOALS.GRAMMAR, label: "The Editor" },
  correctForm: { goal: GOALS.GRAMMAR, label: "Correct Form" },
  paraphraseRewrite: { goal: GOALS.PARAPHRASE, label: "Paraphrase Rewrite" },
  synonymTrap: { goal: GOALS.PARAPHRASE, label: "Synonym Trap" },
  creative: { goal: GOALS.USAGE, label: "Creative Production" },
  scenarioResponse: { goal: GOALS.USAGE, label: "Scenario Response" },
};

// Extracts the answer + explanation shown by the popup's Show Answer button,
// as separate fields so the UI can render them as distinct sections. Open-
// ended types (no single correct answer) get a note instead of a strict
// answer, but still surface the AI's explanation/model example when present.
export function getDisplayAnswer(key, exercise, word) {
  let answer;
  switch (key) {
    case "cloze":
      answer = word;
      break;
    case "definitionMatch":
    case "synonymTrap":
    case "correctForm":
      answer = exercise.answer;
      break;
    case "editor":
      answer = "Incorrect usage — here's why:";
      break;
    case "paraphraseRewrite":
    case "creative":
    case "scenarioResponse":
      answer = `Open-ended — there's no single correct answer. Try using "${word}" naturally, then self-grade.`;
      break;
    default:
      answer = "";
  }

  return { answer, explanation: exercise.explanation || "" };
}

export const EXERCISE_TYPE_KEYS = Object.keys(EXERCISE_TYPES);

// Exercise type keys grouped by goal, e.g. { memorization: ["cloze", "definitionMatch"], ... }
export const TYPES_BY_GOAL = EXERCISE_TYPE_KEYS.reduce((acc, key) => {
  const goal = EXERCISE_TYPES[key].goal;
  (acc[goal] = acc[goal] || []).push(key);
  return acc;
}, {});

// Picks a random available exercise type within the given goal for a word.
// Falls back to "cloze" if the word has no ready exercises for this goal
// (e.g. still pending/failed) — cloze is the only type the local fallback
// ever produces.
export function pickExerciseKeyForGoal(word, goal) {
  const candidates = (TYPES_BY_GOAL[goal] || []).filter((key) => word.exercisesStatus === "ready" && word.exercises?.[key]);
  if (candidates.length === 0) return "cloze";
  return candidates[Math.floor(Math.random() * candidates.length)];
}
