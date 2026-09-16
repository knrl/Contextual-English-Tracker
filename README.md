# Contextual English Tracker

A Chrome extension that turns words you meet while reading into spaced-repetition practice. Highlight a word, right-click, and it's saved together with the sentence you found it in. Claude then generates eight different kinds of exercise from that context, and the extension schedules them so you keep meeting the word until you actually know it.

**Status:** early, usable, single-user. Built for personal use — no backend, no account, nothing leaves your machine except the API calls you pay for.

---

## Why

Most vocabulary apps drill words stripped of context, and most of them test you the same way every time. This one keeps the original sentence, varies the kind of question, and schedules each *kind* of knowledge separately — recognising a definition and producing the word in a sentence are different skills, so they get different review schedules.

## Features

- **Zero-friction capture** — highlight, right-click, "Save Word". An in-page toast confirms what was captured and offers Undo.
- **Context is preserved** — the surrounding sentence is stored with the word and fed to the AI, so exercises use the word the way *you* met it.
- **Eight exercise types** across four learning goals:

  | Goal | Exercise types |
  | --- | --- |
  | Memorization | Cloze Deletion, Definition Match |
  | Grammar | The Editor, Correct Form |
  | Paraphrase | Paraphrase Rewrite, Synonym Trap |
  | Usage | Creative Production, Scenario Response |

- **Per-goal spaced repetition** — SM-2 runs independently for each of the four goals, so a word isn't "learned" until you can handle it in all four ways.
- **Explanations, not just answers** — every exercise reveals *why* the answer is right, with memory hooks and notes on what makes distractors wrong.
- **Daily goals and streaks** — a capture cap to stop over-collecting, a review goal with a progress bar, and a streak counter.
- **Word list** — see, inspect and delete everything you've saved.
- **Dark mode**, keyboard shortcuts (`Space` to reveal, `1`–`4` to grade), and a due-count badge on the toolbar icon.

## Requirements

- Google Chrome (or another Chromium browser) with Manifest V3 support
- An [Anthropic API key](https://console.anthropic.com/) — the extension calls the Claude API directly to generate exercises

Without a key the extension still captures words and falls back to a basic cloze exercise, but you won't get the other seven types or the explanations.

## Install (from source)

1. Clone this repository:
   ```bash
   git clone https://github.com/knrl/Contextual-English-Tracker.git
   ```
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the cloned folder.
4. Open the extension's **Settings** (via the popup or the extensions page) and paste in your Anthropic API key.

## Usage

**Capture** — highlight a word on any page, right-click, choose **Save Word**. A toast confirms the word and the captured context, with an Undo link.

**Review** — click the toolbar icon. The badge shows how many reviews are due. For each card:

| Key | Action |
| --- | --- |
| `Space` | Reveal the answer and explanation |
| `1` | Fail — reset this goal's schedule |
| `2` | Hard |
| `3` | Good |
| `4` | Easy — push the interval out aggressively |

Cleared the queue and still want to practise? **Review more words** pulls in items that aren't due yet.

**Settings** lets you set your API key, the daily capture cap and review goal, browse and delete saved words, regenerate exercises for existing words after a prompt change, and clear everything.

## How it works

```
manifest.json            MV3 manifest

background/
  service-worker.js      Entry point: context menu, messages, due-count badge
  contextMenu.js         Capture flow, duplicate detection, generation batching
  aiClient.js            Claude API call, strict JSON schema, retry + local fallback
  exerciseTypes.js       The eight exercise types, grouped by learning goal
  srs.js                 SM-2, scheduled per (word x goal)
  storage.js             chrome.storage access layer

content/
  sentenceExtractor.js   Pulls the surrounding text block for a selection
  captureToast.js        In-page capture confirmation with Undo

popup/                   Review UI
options/                 Settings, word list, maintenance actions
shared/theme.css         Design tokens, shared by popup and options
```

**Storage.** Saved words and daily stats live in `chrome.storage.local` (10 MB, no per-item cap — each word carries up to eight exercises). Settings live in `chrome.storage.sync` so they follow you across devices. Your API key is kept in `chrome.storage.local` only and is never synced.

**Generation.** Exercises are generated once, at capture time, in a single Claude call per word. Generating at review time instead would mean staring at a spinner every time you open the popup. Interrupted or failed generations are retried automatically when you next open the popup, with bounded concurrency so a large regeneration doesn't trip rate limits.

**Scheduling.** Each word carries four independent SM-2 schedules, one per learning goal. When a `(word, goal)` pair comes due, one of that goal's two exercise types is picked at random.

## Privacy

See [PRIVACY.md](PRIVACY.md) for the full statement. In short: everything is stored locally in your browser, there is no backend and no analytics, and the only data sent anywhere is the word and its surrounding sentence, sent to the Anthropic API to generate your exercises.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up, test and submit changes. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please don't open a public issue for security problems.

## License

[MIT](LICENSE) © Mehmet Kaan Erol
