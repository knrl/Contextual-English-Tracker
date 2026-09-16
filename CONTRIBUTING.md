# Contributing

Thanks for taking an interest. This is a small, single-purpose extension, so the process is deliberately light.

## Before you start

For anything more than a typo or an obvious bug fix, please open an issue first so we can agree on the approach. That saves you writing a feature that doesn't fit the project's direction.

Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setting up

There is no build step and no dependencies to install for the extension itself — it's plain ES modules loaded directly by Chrome.

1. Fork and clone the repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the repo folder.
3. Add your Anthropic API key in the extension's Settings page.

After editing any file, hit the reload icon on the extension's card in `chrome://extensions`. Changes to `manifest.json` or the service worker always need a reload; popup and options changes usually just need the page reopened.

## Project layout

See the "How it works" section of the [README](README.md#how-it-works) for the file-by-file breakdown. In short:

- `background/` — service worker, capture flow, Claude client, SM-2 scheduling, storage
- `content/` — scripts injected into pages (sentence extraction, capture toast)
- `popup/`, `options/` — the two UI surfaces
- `shared/theme.css` — design tokens used by both surfaces

## Testing

There is no unit test suite. Because almost every interesting behaviour involves Chrome extension APIs, tests drive a real Chromium instance with the extension loaded.

Syntax check everything before you commit:

```bash
for f in background/*.js content/*.js popup/*.js options/*.js; do node --check "$f"; done
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
```

For behavioural changes, drive the real extension. The approach used during development:

```js
const { chromium } = require("playwright");

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false, // extensions don't load in headless mode
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
  ],
});

// The service worker is reachable for driving background logic and
// inspecting chrome.storage directly:
const [sw] = context.serviceWorkers();
const extensionId = sw.url().split("/")[2];
await sw.evaluate(() => new Promise((r) => chrome.storage.local.get(null, r)));

// The popup and options pages open as ordinary pages:
await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
```

Notes that will save you time:

- Native context menus can't be scripted. To test the capture flow, temporarily expose the handler (`self.__handleSaveWord = handleSaveWord` in `service-worker.js`) and call it with a synthetic `info`/`tab` object — then remove that line before committing.
- Use a throwaway `USER_DATA_DIR` per run so tests start from clean storage.
- Tests that hit the Claude API need a real key. Without one, generation fails and falls back to a local cloze exercise — which is itself worth testing.

**Please describe what you actually ran** in your pull request. "Syntax checks pass" and "I loaded it and captured a word" are both useful; silence isn't.

## Style

Match what's already there:

- Plain ES modules, no framework, no build step, no dependencies. Keep it that way unless there's a strong reason.
- Comments explain *why*, not *what*. Several existing comments record non-obvious Chrome behaviour (MV3 service worker teardown, `chrome.storage.sync` item caps, content scripts not being modules) — that kind of note is welcome.
- No inline styles; use the tokens in `shared/theme.css` so both light and dark mode keep working.
- Keep the two UI surfaces consistent with each other.

## Commits and pull requests

- Write commit messages in the imperative mood ("Add word list", not "Added word list").
- Keep a pull request to one coherent change.
- In the description, say what changed, why, and how you verified it.
- Update `CHANGELOG.md` under "Unreleased" if the change is user-visible.

## Reporting bugs

Use the bug report template. The single most useful thing you can include is the error text from the service worker console: go to `chrome://extensions`, find the extension, and click the **service worker** link to open its DevTools.
