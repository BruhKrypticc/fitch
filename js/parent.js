import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { applySchoolTheme } from "./school-theme.js";
import { LANGUAGES, RTL_LANGUAGES } from "./languages.js";
import { getCachedTranslation, translate } from "./translate-engine.js";

const LANG_KEY = "fitchParentLang";
const byId = (id) => document.getElementById(id);
const schoolId = new URLSearchParams(location.search).get("s");

const pills = byId("parentLangs");
const list = byId("parentList");
const note = byId("parentNote");

let language = (() => {
  const saved = localStorage.getItem(LANG_KEY);
  if (LANGUAGES.some((l) => l.code === saved)) return saved;
  const browser = (navigator.language || "en").slice(0, 2).toLowerCase();
  return LANGUAGES.some((l) => l.code === browser) ? browser : "en";
})();
let announcements = [];
let loaded = false;
let renderToken = 0;

function buildPills() {
  pills.replaceChildren();
  for (const lang of LANGUAGES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "p-pill";
    button.textContent = lang.label;
    button.dataset.lang = lang.code;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(lang.code === language));
    button.classList.toggle("is-active", lang.code === language);
    button.addEventListener("click", () => {
      if (language === lang.code) return;
      language = lang.code;
      localStorage.setItem(LANG_KEY, language);
      pills.querySelectorAll(".p-pill").forEach((p) => {
        const active = p.dataset.lang === language;
        p.classList.toggle("is-active", active);
        p.setAttribute("aria-checked", String(active));
      });
      render();
    });
    pills.append(button);
  }
  pills.querySelector(".is-active")?.scrollIntoView({ inline: "center", block: "nearest" });
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

function showSkeleton() {
  list.replaceChildren(...[0, 1].map(() => Object.assign(document.createElement("div"), { className: "p-skeleton" })));
}

async function render() {
  const token = ++renderToken;
  const code = language;
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_LANGUAGES.has(code) ? "rtl" : "ltr";
  if (!loaded) return;

  if (!announcements.length) {
    const empty = document.createElement("p");
    empty.className = "p-empty";
    empty.textContent = "No announcements right now.";
    list.replaceChildren(empty);
    note.textContent = "";
    return;
  }

  const needsWork = code !== "en";
  note.textContent = needsWork ? "Translating…" : "";
  if (needsWork && announcements.some((a) => getCachedTranslation(a.title, code) === undefined)) showSkeleton();

  const items = await Promise.all(announcements.map(async (item) => ({
    ...item,
    title: await inLanguage(item.title, code),
    content: await inLanguage(item.content, code)
  })));
  if (token !== renderToken) return;
  note.textContent = "";

  list.replaceChildren(...items.map((item) => {
    const card = document.createElement("article");
    card.className = `p-card${item.sticky ? " is-pinned" : ""}`;
    if (item.sticky) {
      const pin = document.createElement("span");
      pin.className = "p-pin";
      pin.textContent = "Pinned";
      card.append(pin);
    }
    const title = document.createElement("h2");
    title.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.content;
    const meta = document.createElement("p");
    meta.className = "p-meta";
    meta.textContent = item.date;
    card.append(title, body, meta);
    return card;
  }));
}

async function start() {
  buildPills();
  showSkeleton();
  if (!schoolId) {
    byId("parentSchoolName").textContent = "School link not found";
    list.replaceChildren();
    return;
  }
  let datesHidden = false;
  try {
    const snapshot = await getDoc(doc(db, "schools", schoolId));
    if (!snapshot.exists()) {
      byId("parentSchoolName").textContent = "School not found";
      list.replaceChildren();
      return;
    }
    const school = snapshot.data();
    byId("parentSchoolName").textContent = school.name || "Your school";
    document.title = `${school.name || "School"} | Updates for families`;
    applySchoolTheme(school.theme && typeof school.theme === "object" ? school.theme : {});
    datesHidden = school.features?.hideDatesAndTimes === true;
    if (school.features?.announcementsEnabled === false) {
      const off = document.createElement("p");
      off.className = "p-empty";
      off.textContent = "This school hasn’t published announcements.";
      list.replaceChildren(off);
      return;
    }
  } catch (error) {
    console.error("Could not load school:", error);
    byId("parentSchoolName").textContent = "Could not load this school";
    list.replaceChildren();
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
          sticky: data.sticky === true,
          date: datesHidden || !data.createdAt?.toDate ? "" : data.createdAt.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        };
      }).sort((a, b) => Number(b.sticky) - Number(a.sticky));
      loaded = true;
      render();
    },
    (error) => {
      console.error("Could not load announcements:", error);
      const failed = document.createElement("p");
      failed.className = "p-empty";
      failed.textContent = "Announcements could not be loaded.";
      list.replaceChildren(failed);
    }
  );
}

start();
