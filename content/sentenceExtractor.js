// Injected on demand to pull the full surrounding text block for the current
// selection. We deliberately do NOT try to isolate a single grammatical
// sentence with punctuation-splitting regex here — abbreviations ("Mr.",
// "e.g.") break naive splitting, and the AI is better at parsing a messy
// block than a JS regex is. We just find the nearest block-level ancestor
// and hand over its full text, trimmed to a window around the selection.

const BLOCK_TAGS = new Set([
  "P", "LI", "BLOCKQUOTE", "TD", "TH", "DIV", "ARTICLE", "SECTION", "H1",
  "H2", "H3", "H4", "H5", "H6",
]);

const MAX_CONTEXT_CHARS = 500;

function findBlockAncestor(node) {
  let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (el && !BLOCK_TAGS.has(el.tagName)) {
    el = el.parentElement;
  }
  return el || document.body;
}

function windowAroundSelection(blockText, selectedText, maxChars) {
  if (blockText.length <= maxChars) return blockText;

  const idx = blockText.indexOf(selectedText);
  if (idx === -1) return blockText.slice(0, maxChars) + "…";

  const half = Math.floor(maxChars / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(blockText.length, idx + selectedText.length + half);
  let windowed = blockText.slice(start, end);
  if (start > 0) windowed = "…" + windowed;
  if (end < blockText.length) windowed = windowed + "…";
  return windowed;
}

// Finds the block-level element whose text contains `fallbackText`, used when
// the live window selection is no longer available (e.g. it was cleared by
// the time this content script's async round-trip completes — right-clicking
// to open a context menu doesn't reliably keep the selection alive on every
// site). Scans the DOM directly for a block containing the exact captured
// selection text, rather than depending on window.getSelection() still being
// valid at message-handling time.
function findBlockContainingText(fallbackText) {
  const candidates = document.querySelectorAll(
    "p, li, blockquote, td, th, div, article, section, h1, h2, h3, h4, h5, h6"
  );
  let best = null;
  for (const el of candidates) {
    if (el.children.length > 0) continue; // prefer leaf-most blocks (avoid huge wrapper divs)
    if (el.innerText && el.innerText.includes(fallbackText)) {
      best = el;
      break;
    }
  }
  if (best) return best;
  // No leaf block matched (e.g. text is split across inline child elements);
  // fall back to any block-level element containing the text, even with children.
  for (const el of candidates) {
    if (el.innerText && el.innerText.includes(fallbackText)) {
      return el;
    }
  }
  return null;
}

function extractContext(fallbackText) {
  const selection = window.getSelection();
  const liveSelectedText = selection && selection.rangeCount > 0 ? selection.toString().trim() : "";

  let block = null;
  let selectedText = liveSelectedText;

  if (liveSelectedText) {
    const anchorNode = selection.getRangeAt(0).startContainer;
    block = findBlockAncestor(anchorNode);
  } else if (fallbackText) {
    // Live selection is gone (cleared by the time this ran) — search the DOM
    // for a block containing the text Chrome captured at right-click time.
    selectedText = fallbackText;
    block = findBlockContainingText(fallbackText);
  }

  if (!block || !selectedText) return null;

  const blockText = block.innerText.trim();
  if (!blockText) return null;

  return {
    selectedText,
    context: windowAroundSelection(blockText, selectedText, MAX_CONTEXT_CHARS),
  };
}

// Respond to a one-off request from the background service worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "EXTRACT_CONTEXT") {
    sendResponse(extractContext(message.fallbackText));
  }
  return false;
});
