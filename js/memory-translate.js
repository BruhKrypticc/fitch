// Shared MyMemory translation layer. Reads the language the user picked on the current page.
const cache = new Map();
const listeners = new Set();

// Student page uses a <select>; the mobile app uses radio pills. Admin has neither (English).
export function currentLanguage() {
  const select = document.getElementById("language-selector");
  if (select?.value) return select.value;
  return document.querySelector(".m-pill.is-active")?.dataset.lang || "en";
}

// Calls back whenever the language control changes; returns an unsubscribe function.
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
  // The mobile pill handler updates the active class in the same click; read after it ran.
  setTimeout(() => listeners.forEach((fn) => fn(currentLanguage())), 0);
}

export function cachedTranslation(text, lang) {
  return cache.get(`${lang}::${text}`);
}

export async function translateText(text, lang) {
  if (!text || lang === "en") return text;
  const key = `${lang}::${text}`;
  if (cache.has(key)) return cache.get(key);
  const chunks = text.match(/[\s\S]{1,450}(?:\s|$)|[\s\S]+/g) || [text];
  const parts = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) { parts.push(chunk); continue; }
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${lang}&de=studenthub@example.com`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Translation failed (${response.status}).`);
    const data = await response.json();
    const translated = data?.responseData?.translatedText;
    if (typeof translated !== "string" || data.responseStatus >= 400) {
      throw new Error(data?.responseDetails || "Translation failed.");
    }
    parts.push(translated);
  }
  const result = parts.join("");
  cache.set(key, result);
  return result;
}
