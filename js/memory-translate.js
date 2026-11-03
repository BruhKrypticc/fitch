import { getCachedTranslation, translate } from "./translate-engine.js";

const listeners = new Set();

export function currentLanguage() {
  const select = document.getElementById("language-selector");
  if (select?.value) return select.value;
  return document.querySelector(".m-pill.is-active")?.dataset.lang || "en";
}

export function onLanguageChange(callback) {
  if (!listeners.size) {
    document.addEventListener("change", notify);
    document.addEventListener("click", notifyAfterClick);
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (!listeners.size) {
      document.removeEventListener("change", notify);
      document.removeEventListener("click", notifyAfterClick);
    }
  };
}

function notify(event) {
  if (event.target?.id === "language-selector") listeners.forEach((fn) => fn(currentLanguage()));
}

function notifyAfterClick(event) {
  if (!event.target.closest?.(".m-pill")) return;
  setTimeout(() => listeners.forEach((fn) => fn(currentLanguage())), 0);
}

export function cachedTranslation(text, lang) {
  return getCachedTranslation(text, lang);
}

export const translateText = translate;
