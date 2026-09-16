# Chrome Web Store listing

Draft copy and submission notes for the Chrome Web Store dashboard. Nothing here ships with the extension.

Build the upload package with:

```bash
./scripts/package.sh
# → dist/contextual-english-tracker-<version>.zip
```

---

## Name

Contextual English Tracker

## Short description

*(132 characters max — currently 115)*

> Save words you meet while reading, with their context, and review them as AI-generated spaced-repetition exercises.

## Detailed description

> **Learn words where you actually found them.**
>
> Most vocabulary tools drill words stripped of context and test you the same way every time. Contextual English Tracker keeps the sentence you met the word in, and turns it into eight different kinds of practice.
>
> **How it works**
>
> 1. Highlight a word on any page.
> 2. Right-click and choose "Save Word" — the word and its surrounding sentence are saved.
> 3. Claude generates a set of exercises from that exact context.
> 4. Review them on a spaced-repetition schedule, right from the toolbar.
>
> **Eight exercise types, four learning goals**
>
> • Memorization — Cloze Deletion, Definition Match
> • Grammar — The Editor, Correct Form
> • Paraphrase — Paraphrase Rewrite, Synonym Trap
> • Usage — Creative Production, Scenario Response
>
> Each of the four goals is scheduled separately, so a word isn't finished until you can recognise it, inflect it, rephrase it and use it.
>
> **Also included**
>
> • Explanations with every answer — why it's right, why the near-misses aren't, and hooks to help it stick
> • Daily capture cap and review goal, with progress bar and streak
> • A word list to review, inspect and delete what you've saved
> • Dark mode and keyboard shortcuts (Space to reveal, 1–4 to grade)
> • A due-count badge so you don't forget to practise
>
> **You need your own Anthropic API key**
>
> This extension calls the Claude API directly using a key you provide, so you pay Anthropic directly for what you use. Get one at console.anthropic.com. Without a key, words are still saved and you get a basic fill-in-the-blank exercise.
>
> **Private by design**
>
> No account, no backend, no analytics, no tracking. Everything is stored in your own browser. The only thing sent anywhere is the word and its sentence, sent to Anthropic to generate your exercises. Open source: github.com/knrl/Contextual-English-Tracker

## Category

Education

## Language

English

---

## Permission justifications

The dashboard asks you to justify each permission. Suggested wording:

| Permission | Justification |
| --- | --- |
| `contextMenus` | Adds the "Save Word" item to the right-click menu, which is the extension's only capture mechanism. |
| `storage` | Stores saved words, review schedules and user settings locally in the browser. |
| `scripting` | Injects a content script, only when the user invokes "Save Word", to read the sentence around the selected word and show the confirmation toast. |
| `activeTab` | Grants access to the tab the user invoked the context menu on. |
| `alarms` | Periodically refreshes the count of due reviews shown on the toolbar badge. |
| Host permission `https://api.anthropic.com/*` | The extension calls the Anthropic API to generate practice exercises from the saved word. |
| Host permissions `http://*/*`, `https://*/*` | Word capture must work on any page the user is reading. Page content is only ever read in direct response to the user choosing "Save Word" from the context menu; nothing is read or transmitted in the background. |

**Remote code:** No. All code is bundled in the package; nothing is fetched and executed at runtime.

**Data usage disclosures:** the extension collects "Website content" (the sentence around a saved word) and "Authentication information" (the user's own API key, stored locally). It does **not** sell data, use it for anything unrelated to the single purpose, or use it to determine creditworthiness.

**Privacy policy URL:** https://github.com/knrl/Contextual-English-Tracker/blob/main/PRIVACY.md

---

## Assets still needed

- [ ] Store icon, 128×128 PNG — the current `icons/icon128.png` is a placeholder and should be replaced with real artwork before submission
- [ ] At least one screenshot, 1280×800 or 640×400. Worth capturing: the review card with an exercise and revealed explanation; the capture toast on a real article; the Settings page with the word list
- [ ] Optional: small promo tile, 440×280

## Pre-submission checklist

- [ ] Bump `version` in `manifest.json`
- [ ] Update `CHANGELOG.md`
- [ ] Replace placeholder icons
- [ ] Run `./scripts/package.sh` and load the built zip unpacked once to confirm it works standalone
- [ ] Confirm no test hooks remain (e.g. `self.__handleSaveWord`)
- [ ] Tag the release in git
