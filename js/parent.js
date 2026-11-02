import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { applySchoolTheme } from "./school-theme.js";
import { LANGUAGES, RTL_LANGUAGES } from "./languages.js";
import { getCachedTranslation, translate } from "./translate-engine.js";

const LANG_KEY = "fitchParentLang";
const byId = (id) => document.getElementById(id);
const schoolId = new URLSearchParams(location.search).get("s");

const select = byId("parentLanguage");
const list = byId("parentList");
const note = byId("parentNote");
const listenAll = byId("parentListenAll");

for (const lang of LANGUAGES) {
  const option = document.createElement("option");
  option.value = lang.code;
  option.textContent = lang.label;
  select.append(option);
}

function detectLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  if (LANGUAGES.some((l) => l.code === saved)) return saved;
  const browser = (navigator.language || "en").slice(0, 2).toLowerCase();
  return LANGUAGES.some((l) => l.code === browser) ? browser : "en";
}

select.value = detectLanguage();
let announcements = [];
let datesHidden = false;
let renderToken = 0;

function speechTag(code) {
  return LANGUAGES.find((l) => l.code === code)?.speech || "en-US";
}

function hasVoice(code) {
  if (!("speechSynthesis" in window)) return false;
  const prefix = speechTag(code).slice(0, 2).toLowerCase();
  return speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(prefix));
}

function speak(text, code) {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechTag(code);
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
}

async function inLanguage(text, code) {
  if (code === "en" || !text) return text;
  const cached = getCachedTranslation(text, code);
  if (cached !== undefined) return cached;
  try {
    return await translate(text, code);
  } catch (error) {
    console.error("Translation failed:", error);
    return text;
  }
}

async function render() {
  const token = ++renderToken;
  const code = select.value;
  localStorage.setItem(LANG_KEY, code);
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_LANGUAGES.has(code) ? "rtl" : "ltr";
  speechSynthesis?.cancel?.();

  list.replaceChildren();
  if (!announcements.length) {
    const empty = document.createElement("p");
    empty.className = "parent-empty";
    empty.textContent = "No announcements right now.";
    list.append(empty);
    listenAll.hidden = true;
    return;
  }

  note.textContent = code === "en" ? "" : "Translating…";
  const items = await Promise.all(announcements.map(async (item) => ({
    ...item,
    title: await inLanguage(item.title, code),
    content: await inLanguage(item.content, code)
  })));
  if (token !== renderToken) return;
  note.textContent = code !== "en" && !hasVoice(code) && "speechSynthesis" in window
    ? "Listening may not be available in this language on your device."
    : "";

  const canSpeak = "speechSynthesis" in window;
  listenAll.hidden = !canSpeak;
  listenAll.onclick = () => speak(items.map((i) => `${i.title}. ${i.content}`).join(" . "), code);

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "parent-card";
    const title = document.createElement("h2");
    title.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.content;
    const meta = document.createElement("span");
    meta.className = "parent-meta";
    meta.textContent = datesHidden || !item.date ? "" : item.date;
    card.append(title, body, meta);
    if (canSpeak) {
      const actions = document.createElement("div");
      actions.className = "parent-card-actions";
      const listen = document.createElement("button");
      listen.type = "button";
      listen.textContent = "Listen";
      listen.addEventListener("click", () => speak(`${item.title}. ${item.content}`, code));
      actions.append(listen);
      card.append(actions);
    }
    list.append(card);
  }
}

select.addEventListener("change", render);
if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", () => render());

async function start() {
  if (!schoolId) {
    byId("parentSchoolName").textContent = "School link not found";
    return;
  }
  try {
    const snapshot = await getDoc(doc(db, "schools", schoolId));
    if (!snapshot.exists()) {
      byId("parentSchoolName").textContent = "School not found";
      return;
    }
    const school = snapshot.data();
    byId("parentSchoolName").textContent = school.name || "Your school";
    document.title = `${school.name || "School"} | Updates for families`;
    applySchoolTheme(school.theme && typeof school.theme === "object" ? school.theme : {});
    datesHidden = school.features?.hideDatesAndTimes === true;
    if (school.features?.announcementsEnabled === false) {
      list.textContent = "This school has not published announcements.";
      return;
    }
  } catch (error) {
    console.error("Could not load school:", error);
    byId("parentSchoolName").textContent = "Could not load this school";
    return;
  }

  onSnapshot(
    query(collection(db, "schools", schoolId, "announcements"), orderBy("createdAt", "desc"), limit(15)),
    (snapshot) => {
      announcements = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          title: typeof data.title === "string" && data.title.trim() ? data.title : "Announcement",
          content: typeof data.content === "string" ? data.content : "",
          date: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : ""
        };
      });
      render();
    },
    (error) => {
      console.error("Could not load announcements:", error);
      list.textContent = "Announcements could not be loaded.";
    }
  );
}

start();
