# Privacy Policy

**Extension:** Contextual English Tracker
**Last updated:** 2026-09-16

## Summary

This extension has no backend, no account system, and no analytics. Everything it saves stays in your own browser. The only data that ever leaves your machine is the word you captured and its surrounding sentence, sent to the Anthropic API so it can generate your practice exercises.

## What is stored, and where

All storage uses Chrome's built-in extension storage. Nothing is sent to any server operated by the extension's author, because there isn't one.

| Data | Where it is stored | Leaves your device? |
| --- | --- | --- |
| Saved words, their surrounding sentence, source page URL, review schedules, generated exercises | `chrome.storage.local` | No |
| Daily stats (words captured today, reviews completed, streak) | `chrome.storage.local` | No |
| Your Anthropic API key | `chrome.storage.local` | Only as an auth header on your own API calls to Anthropic |
| Settings (daily capture cap, daily review goal) | `chrome.storage.sync` | Only via Chrome's own sync, to your other signed-in Chrome browsers |

Your API key is deliberately kept in `chrome.storage.local` rather than `chrome.storage.sync`, so it is never propagated through Chrome Sync to other devices.

## What is sent to third parties

When you capture a word, the extension sends the following to the **Anthropic API** (`https://api.anthropic.com`):

- the word you highlighted
- the surrounding sentence or text block it was found in
- your Anthropic API key, as an authentication header

That request is made directly from your browser to Anthropic. It is not proxied through any intermediary. The response — the generated exercises — is stored locally and not shared further.

Your use of the Anthropic API is governed by Anthropic's own terms and privacy policy:

- <https://www.anthropic.com/legal/privacy>
- <https://www.anthropic.com/legal/consumer-terms>

No other third party receives any data. There is no analytics, telemetry, crash reporting, advertising, or tracking of any kind.

## Page access

The extension requests access to web pages so it can read the sentence around a word you have explicitly highlighted and chosen to save, and so it can show the confirmation toast on that page. It:

- only reads page content in response to you invoking "Save Word" from the right-click menu
- does not read, collect, monitor or transmit page content in the background
- does not track your browsing history

The page URL is stored alongside a saved word purely so you can click back to where you found it. It stays local.

## Data retention and deletion

You are in full control of the stored data:

- **Delete one word** — Settings → Your words → Delete
- **Undo a capture immediately** — the Undo link in the toast shown after saving
- **Delete everything** — Settings → Danger zone → "Clear all saved words & stats"
- **Remove everything, including your API key** — uninstall the extension; Chrome discards all of its extension storage

There is no server-side copy, so there is nothing to request deletion of.

## Children

This extension is not directed at children and collects no personal information about anyone.

## Changes

Any change to this policy will be committed to this repository, so the file's git history serves as its changelog.

## Contact

Questions about privacy: open an issue at
<https://github.com/knrl/Contextual-English-Tracker/issues>
