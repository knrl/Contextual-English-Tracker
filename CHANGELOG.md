# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Goal unlocking** — new words now start with only the *memorization* goal active. Passing a goal (grading it Good or Easy for the first time) unlocks the next one in the ramp: memorization → grammar → paraphrase → usage. Recognition tasks therefore always come before production tasks, instead of a brand-new word immediately surfacing as an open-ended Scenario Response.
- **English level setting (CEFR)** — an A2–C2 dropdown in Settings that steers how complex generated sentences are and how subtle the wrong answers get. Applies to newly generated exercises; use "Regenerate all exercises" to apply it to words you already have.
- **Goal progress indicators** — the review card shows which goal the current exercise belongs to and how many are unlocked; the word list shows an `n/4 goals` badge per word.
- **Hover for meaning** — hovering (or keyboard-focusing) the word on a review card reveals its definition and part of speech, for when you want to remind yourself what it means before attempting the exercise. Generated alongside the exercises at no extra API call; words captured before this show no tooltip until regenerated.
- **Review history** — every grade is now logged per word (goal, exercise type, grade, timestamp), capped at the last 50 reviews per word. This is what the leech list, weak-goal detection, and mastery all read from.
- **Mastered words** — a word graduates to "Mastered" once every goal's SM-2 interval has grown past 30 days. Mastered words leave the normal daily queue but still get a rare spot-check, labeled as such on the review card, so a genuinely forgotten word doesn't silently vanish from review forever.
- **Leech detection** — a word that fails the same goal 3+ times shows a "Needs work" badge in the word list, so the words actually costing you time are visible instead of buried in the queue.
- **Typed Recall** — a new, harder Memorization exercise: type the missing word instead of choosing from a blank or picking from options. Checked against the answer immediately, no API call.
- **AI-graded free-text answers (optional)** — Paraphrase Rewrite, Creative Production, and Scenario Response still default to "compose in your head, then reveal a model example" at no cost. You can now also type your answer and click "Get AI feedback" for a real pass/fail verdict with specific feedback, one API call per grading.
- **Manual word entry** — add a word directly from Settings without capturing it from a page, for words you meet offline. Leave the example sentence blank and the AI writes one for you.
- **Source grouping** — the word list can group words by the page they were captured from ("Grouped by source" / "All words" toggle), so words met together in one article stay visually associated.

### Changed

- "Review more" no longer offers locked goals, so the difficulty ramp is a real gate rather than a default ordering.
- The toolbar due-count badge counts only unlocked goals.

### Notes

- Words captured before this change keep all four goals active — unlocking applies to new captures only, and no stored data is rewritten.
- Review history starts empty for existing words; the leech list and mastery detection only reflect reviews logged from this version onward.

## [0.1.0] - 2026-09-16

First working version.

### Added

- **Capture** — save a highlighted word from any page via the right-click menu, together with the sentence around it and the source URL.
- **In-page capture toast** showing the captured word and context, with an Undo link.
- **Duplicate detection** — re-capturing a word you already have doesn't create a second entry or spend another API call.
- **Eight AI-generated exercise types** across four learning goals: Cloze Deletion and Definition Match (memorization); The Editor and Correct Form (grammar); Paraphrase Rewrite and Synonym Trap (paraphrase); Creative Production and Scenario Response (usage).
- **Explanations** on every exercise — why the answer is right, why distractors aren't, and memory hooks — revealed with the answer.
- **Per-goal spaced repetition** — SM-2 runs independently for each of the four learning goals, so each schedule tracks a consistent kind of task.
- **Review UI** — the word under study shown in the card header, one consistent reveal mechanism, and keyboard shortcuts (`Space` to reveal, `1`–`4` to grade).
- **Daily capture cap and daily review goal**, both configurable, with a progress bar and a "hunter streak" counter.
- **Review more words** — keep practising past the day's goal by pulling in items that aren't due yet.
- **Word list** in Settings: inspect saved words with their context, source and generation status, and delete them individually.
- **Regenerate all exercises** — re-run generation for every saved word after a prompt change, batched with bounded concurrency and a progress bar.
- **Due-count badge** on the toolbar icon, refreshed hourly.
- **Dark mode**, driven by `prefers-color-scheme`, with design tokens shared between the popup and options pages.
- **First-run onboarding** explaining the right-click capture flow.

### Notes

- Words and daily stats are stored in `chrome.storage.local`; settings sync via `chrome.storage.sync`; the Anthropic API key is stored locally and never synced.
- Exercises are generated once, at capture time, so opening the popup never waits on the API. Interrupted or failed generations are retried when the popup is next opened.
- Without an API key the extension still captures words and falls back to a locally built cloze exercise.

[Unreleased]: https://github.com/knrl/Contextual-English-Tracker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/knrl/Contextual-English-Tracker/releases/tag/v0.1.0
