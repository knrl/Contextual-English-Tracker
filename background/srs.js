// Standard SM-2 spaced repetition algorithm, scheduled per (word x goal)
// rather than per word. SM-2 assumes the item under review is a consistent
// task each time; a word alone isn't, since it can surface as a multiple-
// choice recognition task one day and an open-ended production task the
// next. Scheduling per goal category keeps each schedule tracking a
// consistent difficulty, so ease factors mean something.

import { GOALS } from "./exerciseTypes.js";

export const GRADES = { FAIL: 1, HARD: 2, GOOD: 3, EASY: 4 };

// Map the 4 UI grading buttons onto SM-2's 0-5 quality scale.
const GRADE_TO_QUALITY = {
  [GRADES.FAIL]: 1,
  [GRADES.HARD]: 3,
  [GRADES.GOOD]: 4,
  [GRADES.EASY]: 5,
};

// Order matters: this is the difficulty ramp for goal unlocking. A new word
// starts with only the first goal unlocked, and each passing grade unlocks
// the next one, so recognition tasks always come before production tasks.
// Reordering GOALS in exerciseTypes.js silently changes that ramp.
export const GOAL_KEYS = Object.values(GOALS);

export function defaultGoalProgress() {
  const now = new Date().toISOString();
  const progress = {};
  GOAL_KEYS.forEach((goal, index) => {
    progress[goal] = {
      unlocked: index === 0,
      repetitions: 0,
      interval_days: 1,
      ease_factor: 2.5,
      next_review_date: now,
    };
  });
  return progress;
}

// Words captured before goal unlocking existed have no `unlocked` field, and
// must stay fully unlocked — so treat "missing" as unlocked and only ever
// exclude an explicit false. This is what makes the change migration-free.
export function isGoalUnlocked(word, goal) {
  return word.goalProgress?.[goal]?.unlocked !== false;
}

// Returns [{ word, goal }] for every (word, goal) pair that's both unlocked
// and due, across all words. A word can appear multiple times (once per due
// goal).
export function getDueGoalPairs(words, now = new Date()) {
  const pairs = [];
  for (const word of words) {
    const progress = word.goalProgress || {};
    for (const goal of GOAL_KEYS) {
      const g = progress[goal];
      if (g && g.unlocked !== false && new Date(g.next_review_date) <= now) {
        pairs.push({ word, goal });
      }
    }
  }
  return pairs;
}

export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Max review-log entries kept per word, oldest dropped first. Bounds storage
// growth for a word reviewed for years while still giving the leech list and
// weak-goal detection enough history to be meaningful.
const MAX_REVIEW_LOG_ENTRIES = 50;

// Appends one entry to a word's review log and enforces the cap. Returns the
// new array; callers persist it as a patch alongside goalProgress.
export function appendReviewLog(word, entry) {
  const log = [...(word.reviewLog || []), entry];
  return log.slice(-MAX_REVIEW_LOG_ENTRIES);
}

// Applies a grade to a single goal's schedule and returns the updated
// goalProgress object (all goals, with only `goal` changed) — callers persist
// this as a patch to the word's goalProgress field.
export function applyGradeToGoal(word, goal, grade) {
  const quality = GRADE_TO_QUALITY[grade];
  if (quality === undefined) {
    throw new Error(`Unknown grade: ${grade}`);
  }

  const progress = word.goalProgress || defaultGoalProgress();
  let { repetitions, interval_days, ease_factor } = progress[goal];

  ease_factor = Math.max(
    1.3,
    ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  if (quality < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval_days = 1;
    } else if (repetitions === 2) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval_days);

  const updated = {
    ...progress,
    [goal]: {
      ...progress[goal],
      repetitions,
      interval_days,
      ease_factor,
      next_review_date: nextReviewDate.toISOString(),
    },
  };

  // First pass on this goal unlocks the next one in the ramp. Gated on
  // repetitions going 0 -> 1 so re-passing a goal later (after a Fail reset
  // it back to 0) doesn't re-unlock and reset an already-progressing goal.
  const isFirstPass = quality >= 3 && repetitions === 1;
  if (isFirstPass) {
    const nextGoal = GOAL_KEYS[GOAL_KEYS.indexOf(goal) + 1];
    if (nextGoal && updated[nextGoal]?.unlocked === false) {
      updated[nextGoal] = {
        ...updated[nextGoal],
        unlocked: true,
        // Due immediately, so the ramp advances within the session rather
        // than stalling until tomorrow.
        next_review_date: new Date().toISOString(),
      };
    }
  }

  return updated;
}

// A word is "learned" once every goal has been passed (quality >= 3, i.e.
// graded Good or Easy) at least once — repetitions > 0 is exactly that,
// since repetitions resets to 0 on Fail/Hard.
export function isWordLearned(word) {
  const progress = word.goalProgress || {};
  return GOAL_KEYS.every((goal) => (progress[goal]?.repetitions || 0) > 0);
}

// A word graduates to "mastered" once every goal's interval has grown past
// this many days — meaning you've consistently graded Good/Easy across
// several reviews on all four goals, not just passed each once. Mastered
// words leave the normal due queue (see isDueForSpotCheck) but aren't
// deleted, so a fading memory still gets caught eventually.
const MASTERY_INTERVAL_DAYS = 30;

export function isWordMastered(word) {
  const progress = word.goalProgress || {};
  return GOAL_KEYS.every((goal) => (progress[goal]?.interval_days || 0) >= MASTERY_INTERVAL_DAYS);
}

// A "leech": a word that keeps failing the same goal despite repeated
// review. Threshold of 3 recent fails on one goal (within the capped review
// log) flags it for the leech list, independent of whatever the current SM-2
// interval says — a word can look "progressing" by interval alone while
// still being the thing you get wrong every time you see it.
const LEECH_FAIL_THRESHOLD = 3;

export function getLeechGoals(word) {
  const log = word.reviewLog || [];
  const failsByGoal = {};
  for (const entry of log) {
    if (entry.grade === GRADES.FAIL) {
      failsByGoal[entry.goal] = (failsByGoal[entry.goal] || 0) + 1;
    }
  }
  return Object.entries(failsByGoal)
    .filter(([, count]) => count >= LEECH_FAIL_THRESHOLD)
    .map(([goal]) => goal);
}

export function isLeech(word) {
  return getLeechGoals(word).length > 0;
}

// Per-goal accuracy across a word's logged reviews: { [goal]: { passed,
// total } }. Used both for a single word's weak-goal breakdown and, summed
// across all words, for an overall "which goal type gives you the most
// trouble" view.
export function goalAccuracy(word) {
  const log = word.reviewLog || [];
  const stats = {};
  for (const goal of GOAL_KEYS) stats[goal] = { passed: 0, total: 0 };
  for (const entry of log) {
    if (!stats[entry.goal]) continue;
    stats[entry.goal].total += 1;
    if (entry.grade >= GRADES.GOOD) stats[entry.goal].passed += 1;
  }
  return stats;
}
