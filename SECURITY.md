# Security Policy

## Supported versions

This project is in early development. Only the latest commit on `main` is supported; fixes are not backported.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub's [private vulnerability reporting](https://github.com/knrl/Contextual-English-Tracker/security/advisories/new) for this repository.

Please include:

- what the problem is and what an attacker could achieve
- steps to reproduce, ideally with a minimal example
- the Chrome version and OS you saw it on

You can expect an initial response within about a week. Since this is a personal project maintained in spare time, please be patient beyond that.

## Scope

Things worth reporting:

- ways a web page could read your stored API key or saved words
- injection through captured page content — the extension reads text from arbitrary pages, so anything that turns that text into executed code
- flaws in how the API key is stored or transmitted
- a content script or message handler that can be abused by a hostile page

Known and accepted, so not worth reporting:

- **The API key is stored in the browser and sent directly from it.** This is inherent to the extension's no-backend design. Anyone with access to your browser profile, or to the extension's storage, can read the key. A proxy server would avoid this and is out of scope for a personal-use tool. Treat the key as you would any credential kept in a browser.
- **Broad host permissions.** `http://*/*` and `https://*/*` are requested so word capture works reliably on any page. Page content is only read when you explicitly invoke "Save Word".

## A note on your API key

If you think your Anthropic API key has been exposed, revoke it immediately in the [Anthropic Console](https://console.anthropic.com/settings/keys) and issue a new one. That is faster and more reliable than waiting on a fix here.
