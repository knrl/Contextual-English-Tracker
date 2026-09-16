// Shows an in-page confirmation toast after a word is captured, with an Undo
// link — gives the user visible feedback on what was actually captured
// (word + trimmed context) instead of just a toolbar badge flash they likely
// aren't looking at, and a way to immediately correct a bad capture.

const TOAST_ID = "cet-capture-toast";
const AUTO_DISMISS_MS = 6000;

function ensureStyles() {
  if (document.getElementById("cet-toast-styles")) return;
  const style = document.createElement("style");
  style.id = "cet-toast-styles";
  style.textContent = `
    #${TOAST_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: #1b1b1f;
      color: #fff;
      border-radius: 10px;
      padding: 14px 16px;
      max-width: 320px;
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      animation: cet-toast-in 0.18s ease-out;
    }
    #${TOAST_ID} .cet-toast-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    #${TOAST_ID} .cet-toast-context {
      color: #c7c7cc;
      margin-bottom: 10px;
    }
    #${TOAST_ID} .cet-toast-actions {
      display: flex;
      gap: 12px;
    }
    #${TOAST_ID} button {
      background: none;
      border: none;
      color: #7db2ff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }
    #${TOAST_ID} .cet-toast-dismiss {
      color: #9a9aa0;
      font-weight: 400;
    }
    @keyframes cet-toast-in {
      from { transform: translateY(12px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

function showCaptureToast({ word, context, wordId, duplicate }) {
  ensureStyles();
  document.getElementById(TOAST_ID)?.remove();

  const toast = document.createElement("div");
  toast.id = TOAST_ID;

  const title = document.createElement("div");
  title.className = "cet-toast-title";
  title.textContent = duplicate ? `"${word}" — already saved` : `Saved "${word}"`;
  toast.appendChild(title);

  const contextEl = document.createElement("div");
  contextEl.className = "cet-toast-context";
  contextEl.textContent = context.length > 140 ? context.slice(0, 140) + "…" : context;
  toast.appendChild(contextEl);

  const actions = document.createElement("div");
  actions.className = "cet-toast-actions";

  if (!duplicate) {
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "Undo";
    undoBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "UNDO_CAPTURE", wordId });
      toast.remove();
    });
    actions.appendChild(undoBtn);
  }

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "cet-toast-dismiss";
  dismissBtn.textContent = "Dismiss";
  dismissBtn.addEventListener("click", () => toast.remove());
  actions.appendChild(dismissBtn);

  toast.appendChild(actions);
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), AUTO_DISMISS_MS);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SHOW_CAPTURE_TOAST") {
    showCaptureToast(message.payload);
  }
});
