## What does this change?

<!-- A sentence or two. If it closes an issue, say "Closes #123". -->

## Why?

<!-- The problem being solved. Skip if it's obvious from the above. -->

## How did you verify it?

<!--
Please be specific — "it works" is hard to review. For example:
- Ran the syntax checks (see CONTRIBUTING.md)
- Loaded unpacked in Chrome, captured a word on <page>, confirmed the toast and the saved context
- Drove the popup with Playwright and checked <behaviour>
-->

- [ ] Syntax checks pass (`node --check` on changed JS, `manifest.json` parses)
- [ ] Loaded the extension unpacked and exercised the affected flow by hand

## Checklist

- [ ] No temporary test hooks left in (e.g. `self.__handleSaveWord`)
- [ ] No API keys, tokens or personal data in the diff
- [ ] Uses the tokens in `shared/theme.css` — light and dark mode both still look right
- [ ] `CHANGELOG.md` updated under "Unreleased" if this is user-visible
