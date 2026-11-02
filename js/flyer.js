import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import qrcode from "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm";
import { db } from "./firebase.js";
import { LANGUAGES, RTL_LANGUAGES, parentLink } from "./languages.js";
import { translate } from "./translate-engine.js";

const params = new URLSearchParams(location.search);
const schoolId = params.get("s");
const announcementId = params.get("a");
const page = document.getElementById("flyerPage");
const langBox = document.getElementById("flyerLangs");
const status = document.getElementById("flyerStatus");
const DEFAULT_LANGS = ["es", "pt", "vi"];
const MAX_LANGS = 4;

let school = null;
let announcement = null;
let token = 0;

for (const lang of LANGUAGES.filter((l) => l.code !== "en")) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = lang.code;
  input.checked = DEFAULT_LANGS.includes(lang.code);
  label.append(input, document.createTextNode(lang.label));
  langBox.append(label);
}

function selectedLanguages() {
  return [...langBox.querySelectorAll("input:checked")].map((i) => i.value);
}

langBox.addEventListener("change", (event) => {
  if (selectedLanguages().length > MAX_LANGS) {
    event.target.checked = false;
    status.textContent = `Up to ${MAX_LANGS} languages fit on one page.`;
    return;
  }
  status.textContent = "";
  render();
});

document.getElementById("flyerPrint").addEventListener("click", () => window.print());

function block({ title, content, label, code, primary }) {
  const section = document.createElement("section");
  section.className = `flyer-block${primary ? " is-primary" : ""}`;
  section.lang = code;
  section.dir = RTL_LANGUAGES.has(code) ? "rtl" : "ltr";
  const tag = document.createElement("p");
  tag.className = "flyer-lang";
  tag.textContent = label;
  const h = document.createElement("h2");
  h.textContent = title;
  const body = document.createElement("p");
  body.textContent = content;
  section.append(tag, h, body);
  return section;
}

async function render() {
  if (!announcement) return;
  const mine = ++token;
  const codes = selectedLanguages();
  status.textContent = codes.length ? "Translating…" : "";

  const translated = await Promise.all(codes.map(async (code) => {
    try {
      const [title, content] = await Promise.all([
        translate(announcement.title, code),
        translate(announcement.content, code)
      ]);
      return { code, title, content, ok: true };
    } catch (error) {
      console.error("Flyer translation failed:", error);
      return { code, ok: false };
    }
  }));
  if (mine !== token) return;

  page.replaceChildren();
  const head = document.createElement("div");
  head.className = "flyer-head";
  const name = document.createElement("p");
  name.className = "flyer-school";
  name.textContent = school.name || "School";
  head.append(name);
  page.append(head);

  page.append(block({ title: announcement.title, content: announcement.content, label: "English", code: "en", primary: true }));
  for (const item of translated.filter((t) => t.ok)) {
    const lang = LANGUAGES.find((l) => l.code === item.code);
    page.append(block({ title: item.title, content: item.content, label: lang.label, code: item.code }));
  }

  const foot = document.createElement("div");
  foot.className = "flyer-foot";
  const qr = qrcode(0, "M");
  qr.addData(parentLink(schoolId));
  qr.make();
  const qrBox = document.createElement("div");
  qrBox.className = "flyer-qr";
  qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  const text = document.createElement("p");
  text.textContent = "Scan for all school updates in your language, with a listen button.";
  foot.append(qrBox, text);
  page.append(foot);

  const note = document.createElement("p");
  note.className = "flyer-note";
  note.textContent = "Translations are made by AI. Please confirm important details with the school office.";
  page.append(note);

  const failed = translated.filter((t) => !t.ok).length;
  status.textContent = failed ? `${failed} language(s) could not be translated. Try again.` : "Ready to print.";
}

async function start() {
  if (!schoolId || !announcementId) {
    page.textContent = "This flyer link is missing information.";
    return;
  }
  try {
    const [schoolSnap, announcementSnap] = await Promise.all([
      getDoc(doc(db, "schools", schoolId)),
      getDoc(doc(db, "schools", schoolId, "announcements", announcementId))
    ]);
    if (!schoolSnap.exists() || !announcementSnap.exists()) {
      page.textContent = "Announcement not found.";
      return;
    }
    school = schoolSnap.data();
    const data = announcementSnap.data();
    announcement = {
      title: typeof data.title === "string" && data.title.trim() ? data.title : "Announcement",
      content: typeof data.content === "string" ? data.content : ""
    };
    document.title = `${announcement.title} | Flyer`;
    render();
  } catch (error) {
    console.error("Could not load flyer:", error);
    page.textContent = "Could not load this announcement.";
  }
}

start();
