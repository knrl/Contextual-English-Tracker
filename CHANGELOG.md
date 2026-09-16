# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
