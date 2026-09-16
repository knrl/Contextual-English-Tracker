import { registerContextMenu, handleSaveWord, retryPendingWords, retryWord, regenerateAllWords, addWordManually } from "./contextMenu.js";
import { deleteWord, getAllWords } from "./storage.js";
import { getDueGoalPairs } from "./srs.js";
import { gradeFreeTextAnswer } from "./aiClient.js";

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenu();
  retryPendingWords();
  updateBadgeCount();
});

chrome.runtime.onStartup.addListener(() => {
  retryPendingWords();
  updateBadgeCount();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-word") {
    handleSaveWord(info, tab).then(updateBadgeCount);
  }
});

// Shows the number of due (word, goal) reviews as a persistent badge on the
// toolbar icon, so the extension doesn't go silently forgotten between
// captures — refreshed on install/startup and via the alarm below.
async function updateBadgeCount() {
  const words = await getAllWords();
  const dueCount = getDueGoalPairs(words).length;
  await chrome.action.setBadgeText({ text: dueCount > 0 ? String(dueCount) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2a6df4" });
}

const BADGE_REFRESH_ALARM = "refresh-due-badge";
chrome.alarms.create(BADGE_REFRESH_ALARM, { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BADGE_REFRESH_ALARM) updateBadgeCount();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RETRY_PENDING_WORDS") {
    retryPendingWords().then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async sendResponse
  }
  if (message?.type === "RETRY_WORD" && message.wordId) {
    retryWord(message.wordId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "REGENERATE_ALL_WORDS") {
    regenerateAllWords((completed, total) => {
      chrome.runtime.sendMessage({ type: "REGENERATE_PROGRESS", completed, total }).catch(() => {});
    }).then((count) => sendResponse({ ok: true, count }));
    return true;
  }
  if (message?.type === "UNDO_CAPTURE" && message.wordId) {
    deleteWord(message.wordId).then(() => {
      updateBadgeCount();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === "DELETE_WORD" && message.wordId) {
    deleteWord(message.wordId).then(() => {
      updateBadgeCount();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === "REFRESH_BADGE") {
    updateBadgeCount().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "ADD_WORD_MANUALLY" && message.word) {
    addWordManually(message.word, message.context).then((result) => {
      updateBadgeCount();
      sendResponse(result);
    });
    return true;
  }
  if (message?.type === "GRADE_FREE_TEXT") {
    gradeFreeTextAnswer(message.word, message.exerciseType, message.prompt, message.userAnswer).then(sendResponse);
    return true;
  }
});
