import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { getStudentAccountAlias, isAllowedSchoolAccount, isValidStudentName } from "./student-identity.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { openPhotoPreview } from "./photo-utils.js";
import { passesModeration } from "./moderation.js";
import { translate } from "./translate-engine.js";
import { toGoogleCalendarEmbedUrl } from "./calendar.js";
import { applySchoolTheme } from "./school-theme.js";
import {
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const schoolId = localStorage.getItem("schoolId");
const schoolName = localStorage.getItem("schoolName");
let studentName = "";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function waitForAuthState() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

function initLogin() {
  document.body.classList.remove("m-loading");
  document.body.classList.add("m-logged-out");
  const login = document.getElementById("mLogin");
  login.hidden = false;
  const form = document.getElementById("mLoginForm");
  const codeInput = document.getElementById("mLoginCode");
  const errorEl = document.getElementById("mLoginError");
  const button = document.getElementById("mLoginBtn");

  const nameInput = document.getElementById("mLoginName");
  if (nameInput) {
    const existingStudentName = localStorage.getItem("studentName");
    if (existingStudentName) nameInput.value = existingStudentName;
  }

  const boxes = [...document.querySelectorAll(".m-code-box")];
  const syncBoxes = () => {
    const value = codeInput.value;
    const active = document.activeElement === codeInput;
    boxes.forEach((box, index) => {
      box.textContent = value[index] || "";
      box.classList.toggle("is-filled", index < value.length);
      box.classList.toggle("is-active", active && index === Math.min(value.length, boxes.length - 1));
    });
  };
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    syncBoxes();
  });
  codeInput.addEventListener("focus", syncBoxes);
  codeInput.addEventListener("blur", syncBoxes);
  syncBoxes();

  const fail = (message) => {
    errorEl.textContent = message;
    form.classList.remove("is-shaking");
    void form.offsetWidth;
    form.classList.add("is-shaking");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    const code = codeInput.value.trim().toUpperCase();
    if (!code) { fail("Enter your school join code."); return; }
    if (!/^[A-Z0-9]{5}$/.test(code)) { fail("Join codes are exactly 5 letters or numbers."); return; }

    button.disabled = true;
    button.textContent = "Joining…";
    try {
      const result = await getDocs(query(collection(db, "schools"), where("joinCode", "==", code)));
      if (result.empty) {
        fail("That join code wasn't found. Check it with your class officer.");
        return;
      }
      const schoolDoc = result.docs[0];
      const school = schoolDoc.data();
      if (school.features?.studentEmailRequired === true) {
        document.getElementById("mStudentGoogleNotice").hidden = false;
        if (!school.studentEmailDomain) {
          fail("This school has not configured its student email domain. Contact the organizer.");
          return;
        }
        const credential = await signInWithPopup(auth, googleProvider);
        if (!isAllowedSchoolAccount(credential.user, school.studentEmailDomain)) {
          fail(`Use a verified Google account ending in @${school.studentEmailDomain}.`);
          return;
        }
        localStorage.setItem("schoolId", schoolDoc.id);
        localStorage.setItem("schoolName", school.name || "School");
        localStorage.setItem("studentName", await getStudentAccountAlias(db, schoolDoc.id, credential.user.uid));
        login.classList.add("is-leaving");
        setTimeout(() => window.location.reload(), 320);
        return;
      }
      const typedName = (nameInput?.value || "").trim();
      if (!isValidStudentName(typedName)) {
        fail("Enter a display name to join your school.");
        return;
      }
      localStorage.setItem("schoolId", schoolDoc.id);
      localStorage.setItem("schoolName", school.name || "School");
      localStorage.setItem("studentName", typedName);
      login.classList.add("is-leaving");
      setTimeout(() => window.location.reload(), 320);
    } catch (error) {
      console.error("Could not join school:", error);
      fail(`Could not join (${error.code || "unknown"}). Check your connection and try again.`);
    } finally {
      button.disabled = false;
      button.textContent = "Continue";
    }
  });
}

const initialUser = await waitForAuthState();
if (schoolId && schoolName) {
  try {
    const schoolSnapshot = await getDoc(doc(db, "schools", schoolId));
    if (schoolSnapshot.exists()) {
      const school = schoolSnapshot.data();
      if (school.features?.studentEmailRequired === true
        && !isAllowedSchoolAccount(initialUser, school.studentEmailDomain || "")) {
        initLogin();
        document.getElementById("mLoginError").textContent =
          `This school requires a Google account ending in @${school.studentEmailDomain}.`;
        throw new Error("School Google account required.");
      }
      studentName = school.features?.studentEmailRequired === true && initialUser
        ? await getStudentAccountAlias(db, schoolId, initialUser.uid)
        : (localStorage.getItem("studentName") || "").trim();
    }
  } catch (error) {
    if (error.message !== "School Google account required.") {
      console.error("Could not verify student school access:", error);
      initLogin();
      document.getElementById("mLoginError").textContent = "Could not verify school access. Check your connection and try again.";
    }
    throw error;
  }
}

if (!schoolId || !schoolName || !studentName) {
  initLogin();
  throw new Error("No school session; showing the login screen.");
}

const $ = (id) => document.getElementById(id);
const els = {
  header: $("mHeader"),
  schoolName: $("mSchoolName"),
  badge: $("mStudentBadge"),
  exit: $("mExitBtn"),
  langStatus: $("mTranslateStatus"),
  feed: $("feedList"),
  qa: $("qaList"),
  calendarFrame: $("mCalendarFrame"),
  calendarEmpty: $("mCalendarEmpty"),
  photos: $("photoGrid"),
  fab: $("mFab"),
  sheet: $("mSheet"),
  backdrop: $("mSheetBackdrop"),
  sheetTitle: $("mSheetTitle"),
  sheetContext: $("mSheetContext"),
  sheetBody: $("mSheetBody"),
  sheetBodyLabel: $("mSheetBodyLabel"),
  sheetStatus: $("mSheetStatus"),
  sheetSubmit: $("mSheetSubmit"),
  sheetCancel: $("mSheetCancel"),
  toast: $("mToast"),
  main: $("mMain")
};

const state = {
  tab: "feed",
  lang: "en",
  features: {},
  calendarUrl: null,
  announcements: null,
  questions: null,
  photos: null,
  langRun: 0
};
const answerUnsubscribers = new Map();

els.schoolName.textContent = schoolName;
els.badge.textContent = studentName;
document.title = `${schoolName} · Fitch`;

function syncHeaderHeight() {
  document.documentElement.style.setProperty("--header-h", `${els.header.offsetHeight}px`);
}
new ResizeObserver(syncHeaderHeight).observe(els.header);

function formatDate(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "Just now";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function metaLine(author, timestamp) {
  return state.features.hideDatesAndTimes === true ? author : `${author} · ${formatDate(timestamp)}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function translatable(tag, className, text) {
  const node = el(tag, className, text);
  node.dataset.original = text;
  return node;
}

function emptyState(message) {
  return el("p", "m-empty", message);
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
}

function activateTab(name) {
  state.tab = name;
  document.querySelectorAll(".m-tab").forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".m-panel").forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  els.main.scrollTop = 0;
  updateFab();
  if (name === "calendar") renderCalendar();
}

document.querySelectorAll(".m-tab").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.tab !== state.tab) activateTab(button.dataset.tab);
  });
});

function updateFab() {
  const canAsk = state.tab === "qa"
    && state.features.questionsEnabled !== false
    && state.features.questionPostingEnabled !== false;
  els.fab.hidden = !canAsk;
}

function applyFeatureVisibility() {
  const announcementsOn = state.features.announcementsEnabled !== false;
  const questionsOn = state.features.questionsEnabled !== false;
  const visibility = { feed: announcementsOn, qa: questionsOn, calendar: true, photos: true };
  document.querySelectorAll(".m-tab").forEach((button) => {
    if (button.dataset.tab === "polls" || button.dataset.tab === "documents") return;
    button.hidden = !visibility[button.dataset.tab];
  });
  const current = document.querySelector(`.m-tab[data-tab="${state.tab}"]`);
  if (current?.hidden) {
    const fallback = [...document.querySelectorAll(".m-tab")].find((button) => !button.hidden);
    if (fallback) activateTab(fallback.dataset.tab);
  }
  updateFab();
}

const translateText = translate;

async function applyLanguage() {
  const run = ++state.langRun;
  const lang = state.lang;
  const nodes = [...document.querySelectorAll("[data-original]")];
  if (lang === "en") {
    nodes.forEach((node) => { node.textContent = node.dataset.original; node.classList.remove("m-translating"); });
    els.langStatus.hidden = true;
    return;
  }
  els.langStatus.hidden = false;
  els.langStatus.textContent = "Translating&";
  let failed = false;
  nodes.forEach((node) => node.classList.add("m-translating"));
  await Promise.all(nodes.map(async (node) => {
    try {
      const translated = await translateText(node.dataset.original, lang);
      if (run === state.langRun && node.isConnected) node.textContent = translated;
    } catch (error) {
      failed = true;
      console.error("Translation error:", error);
    } finally {
      if (run === state.langRun) node.classList.remove("m-translating");
    }
  }));
  if (run !== state.langRun) return;
  els.langStatus.textContent = failed
    ? "Some text could not be translated right now."
    : "Translated automatically. May not be perfect.";
}

document.querySelectorAll(".m-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    if (state.lang === pill.dataset.lang) return;
    state.lang = pill.dataset.lang;
    document.querySelectorAll(".m-pill").forEach((other) => {
      const active = other === pill;
      other.classList.toggle("is-active", active);
      other.setAttribute("aria-checked", String(active));
    });
    applyLanguage();
  });
});

function announcementCard(announcement, index) {
  const pinned = announcement.sticky === true;
  const card = el("article", `m-card${pinned ? " is-pinned" : ""}`);
  card.style.animationDelay = `${Math.min(index, 8) * 40}ms`;
  if (pinned) {
    const tag = el("span", "m-pin-tag");
    tag.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3-1-7Z"/></svg>';
    tag.append("Pinned");
    card.append(tag);
  }
  card.append(translatable("h3", "", announcement.title || "Untitled"));
  if (announcement.content) card.append(translatable("p", "m-card-text", announcement.content));
  card.append(el("p", "m-meta", metaLine(announcement.authorName || "School staff", announcement.createdAt)));
  return card;
}

function renderAnnouncements() {
  const snapshot = state.announcements;
  els.feed.replaceChildren();
  if (!snapshot) { els.feed.append(el("div", "m-skeleton"), el("div", "m-skeleton")); return; }
  if (state.features.announcementsEnabled === false) {
    els.feed.append(emptyState("Announcements are turned off for this school."));
    return;
  }
  const items = snapshot.docs.map((d) => d.data());
  if (!items.length) { els.feed.append(emptyState("No announcements yet.")); return; }
  const pinned = items.filter((item) => item.sticky === true);
  const recent = items.filter((item) => item.sticky !== true);
  let index = 0;
  if (pinned.length) {
    els.feed.append(el("h2", "m-section-label", "Pinned"));
    pinned.forEach((item) => els.feed.append(announcementCard(item, index++)));
  }
  if (recent.length) {
    if (pinned.length) els.feed.append(el("h2", "m-section-label", "Recent"));
    recent.forEach((item) => els.feed.append(announcementCard(item, index++)));
  }
  if (state.lang !== "en") applyLanguage();
}

function clearAnswerListeners() {
  answerUnsubscribers.forEach((unsubscribe) => unsubscribe());
  answerUnsubscribers.clear();
}

function renderQuestions() {
  const snapshot = state.questions;
  clearAnswerListeners();
  els.qa.replaceChildren();
  if (!snapshot) { els.qa.append(el("div", "m-skeleton"), el("div", "m-skeleton")); return; }
  if (state.features.questionsEnabled === false) {
    els.qa.append(emptyState("The Q&A feature is turned off."));
    return;
  }
  if (snapshot.empty) {
    els.qa.append(emptyState("No questions yet. Tap + to ask the first one."));
    return;
  }
  const canPost = state.features.questionPostingEnabled !== false;
  snapshot.docs.forEach((questionDoc, index) => {
    const question = questionDoc.data();
    const card = el("article", "m-card");
    card.style.animationDelay = `${Math.min(index, 8) * 40}ms`;
    card.append(translatable("h3", "", question.content || ""));
    card.append(el("p", "m-meta", metaLine(question.authorName || "Student", question.createdAt)));

    const answers = el("div", "m-answers");
    answers.hidden = true;
    card.append(answers);

    if (canPost) {
      const reply = el("button", "m-reply-btn", "Reply");
      reply.type = "button";
      reply.addEventListener("click", () => openSheet({ mode: "answer", questionId: questionDoc.id, questionText: question.content || "" }));
      card.append(reply);
    }
    els.qa.append(card);

    const answersQuery = query(
      collection(db, "schools", schoolId, "questions", questionDoc.id, "answers"),
      orderBy("createdAt", "asc")
    );
    answerUnsubscribers.set(questionDoc.id, onSnapshot(answersQuery, (answerSnapshot) => {
      answers.replaceChildren();
      answers.hidden = answerSnapshot.empty;
      answerSnapshot.forEach((answerDoc) => {
        const answer = answerDoc.data();
        const row = el("p", "m-answer");
        row.append(el("b", "", `${answer.authorName || "School community"}: `));
        row.append(translatable("span", "m-answer-text", answer.content || ""));
        if (state.features.studentEmailRequired === true
          && auth.currentUser
          && answer.authorName === studentName) {
          const deleteButton = el("button", "m-answer-delete", "Delete reply");
          deleteButton.type = "button";
          deleteButton.addEventListener("click", async () => {
            deleteButton.disabled = true;
            try {
              await deleteDoc(doc(db, "schools", schoolId, "questions", questionDoc.id, "answers", answerDoc.id));
            } catch (error) {
              console.error("Could not delete reply:", error);
              showToast(`Could not delete reply (${error.code || "unknown"}).`);
              deleteButton.disabled = false;
            }
          });
          row.append(deleteButton);
        }
        answers.append(row);
      });
      if (state.lang !== "en") applyLanguage();
    }, (error) => {
      console.error("Could not load answers:", error);
      answers.hidden = false;
      answers.textContent = "Answers could not be loaded.";
    }));
  });
  if (state.lang !== "en") applyLanguage();
}

function renderCalendar() {
  const link = $("mCalendarLink");
  if (state.calendarUrl && state.tab === "calendar") {
    const url = new URL(state.calendarUrl);
    url.searchParams.set("mode", "AGENDA");
    const target = url.toString();
    if (els.calendarFrame.dataset.target !== target) {
      els.calendarFrame.dataset.target = target;
      els.calendarFrame.src = target;
    }
  }
  if (state.calendarUrl) {
    link.href = state.calendarUrl;
    link.hidden = false;
    els.calendarFrame.hidden = false;
    els.calendarEmpty.hidden = true;
  } else {
    els.calendarFrame.removeAttribute("src");
    delete els.calendarFrame.dataset.target;
    link.hidden = true;
    els.calendarFrame.hidden = true;
    els.calendarEmpty.hidden = false;
  }
}

function renderPhotos() {
  const snapshot = state.photos;
  els.photos.replaceChildren();
  if (!snapshot) { els.photos.append(el("div", "m-skeleton")); return; }
  const posts = snapshot.docs.map((d) => d.data())
    .filter((post) => typeof post.imageUrl === "string" && /^https?:\/\//i.test(post.imageUrl))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER));
  if (!posts.length) { els.photos.append(emptyState("No photos have been shared yet.")); return; }
  posts.forEach((post, index) => {
    const caption = post.caption || "";
    const button = el("button", "m-photo");
    button.type = "button";
    button.style.animationDelay = `${Math.min(index, 12) * 30}ms`;
    button.setAttribute("aria-label", caption ? `Open photo: ${caption}` : "Open photo");
    const img = document.createElement("img");
    img.src = post.imageUrl;
    img.alt = caption || "School photo";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      button.classList.add("is-broken");
      img.remove();
      button.prepend(el("span", "m-photo-fallback", "Photo unavailable"));
    }, { once: true });
    button.append(img);
    if (caption) button.append(el("span", "m-photo-cap", caption));
    button.addEventListener("click", () => openPhotoPreview(post.imageUrl, caption));
    els.photos.append(button);
  });
}

let sheetContext = null;

function openSheet(context) {
  sheetContext = context;
  const isAnswer = context.mode === "answer";
  els.sheetTitle.textContent = isAnswer ? "Reply" : "Ask a question";
  els.sheetBodyLabel.textContent = isAnswer ? "Your answer" : "Question";
  els.sheetContext.hidden = !isAnswer;
  els.sheetContext.textContent = isAnswer ? context.questionText : "";
  els.sheetBody.value = "";
  els.sheetStatus.textContent = "";
  els.sheetSubmit.disabled = true;
  els.sheet.classList.remove("is-closing");
  els.backdrop.classList.remove("is-closing");
  els.backdrop.hidden = false;
  els.sheet.hidden = false;
  setTimeout(() => els.sheetBody.focus(), 250);
}

function closeSheet() {
  if (els.sheet.hidden) return;
  els.sheet.classList.add("is-closing");
  els.backdrop.classList.add("is-closing");
  setTimeout(() => {
    els.sheet.hidden = true;
    els.backdrop.hidden = true;
    sheetContext = null;
  }, 240);
}

function updateSubmitState() {
  els.sheetSubmit.disabled = !els.sheetBody.value.trim();
}

els.fab.addEventListener("click", () => openSheet({ mode: "question" }));
els.sheetCancel.addEventListener("click", closeSheet);
els.backdrop.addEventListener("click", closeSheet);
els.sheetBody.addEventListener("input", updateSubmitState);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSheet(); });

els.sheet.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sheetContext) return;
  const authorName = studentName;
  const content = els.sheetBody.value.trim();
  if (!content) return;
  if (state.features.questionsEnabled === false || state.features.questionPostingEnabled === false) {
    els.sheetStatus.textContent = "Posting is currently unavailable.";
    return;
  }
  const { mode, questionId } = sheetContext;
  els.sheetSubmit.disabled = true;
  if (!await passesModeration([content])) {
    els.sheetSubmit.disabled = false;
    return;
  }
  els.sheetStatus.textContent = "Posting&";
  try {
    if (mode === "answer") {
      await addDoc(collection(db, "schools", schoolId, "questions", questionId, "answers"), {
        content,
        authorName,
        createdAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "schools", schoolId, "questions"), {
        content,
        authorName,
        createdAt: serverTimestamp()
      });
    }
    showToast(mode === "answer" ? "Reply posted" : "Question posted");
    closeSheet();
  } catch (error) {
    console.error("Could not post:", error);
    els.sheetStatus.textContent = `Could not post (${error.code || "unknown"}). Please try again.`;
    els.sheetSubmit.disabled = false;
  }
});

els.exit.addEventListener("click", () => {
  localStorage.removeItem("schoolId");
  localStorage.removeItem("schoolName");
  localStorage.removeItem("studentName");
  window.location.reload();
});

renderAnnouncements();
renderQuestions();
renderPhotos();
renderCalendar();

onSnapshot(doc(db, "schools", schoolId), (snapshot) => {
  if (!snapshot.exists()) {
    showToast("This school could not be found.");
    document.body.classList.remove("m-loading");
    return;
  }
  const school = snapshot.data();
  els.schoolName.textContent = school.name || schoolName;
  applySchoolTheme(school.theme && typeof school.theme === "object" ? school.theme : {});
  const logoUrl = typeof school.theme?.logoUrl === "string" && school.theme.logoUrl.trim() ? school.theme.logoUrl : "image/fitchLogo.png";
  document.querySelectorAll(".m-header-logo").forEach((img) => {
    img.onerror = () => { img.onerror = null; img.src = "image/fitchLogo.png"; };
    if (img.getAttribute("src") !== logoUrl) img.src = logoUrl;
  });
  state.features = school.features && typeof school.features === "object" ? school.features : {};
  state.calendarUrl = school.calendarEnabled === true ? toGoogleCalendarEmbedUrl(school.calendarUrl) : null;
  applyFeatureVisibility();
  renderCalendar();
  renderAnnouncements();
  renderQuestions();
  document.body.classList.remove("m-loading");
}, (error) => {
  console.error("Could not load school settings:", error);
  showToast("Could not load school settings.");
  document.body.classList.remove("m-loading");
});

onSnapshot(
  query(collection(db, "schools", schoolId, "announcements"), orderBy("createdAt", "desc"), limit(50)),
  (snapshot) => { state.announcements = snapshot; renderAnnouncements(); },
  (error) => {
    console.error("Could not load announcements:", error);
    els.feed.replaceChildren(emptyState("Announcements could not be loaded."));
  }
);

onSnapshot(
  query(collection(db, "schools", schoolId, "questions"), orderBy("createdAt", "desc"), limit(50)),
  (snapshot) => { state.questions = snapshot; renderQuestions(); },
  (error) => {
    console.error("Could not load questions:", error);
    els.qa.replaceChildren(emptyState("Questions could not be loaded."));
  }
);

onSnapshot(
  query(collection(db, "image_posts"), where("schoolId", "==", schoolId), orderBy("createdAt", "desc"), limit(60)),
  (snapshot) => { state.photos = snapshot; renderPhotos(); },
  (error) => {
    console.error("Could not load photos:", error);
    els.photos.replaceChildren(emptyState("Photos could not be loaded."));
  }
);

setTimeout(() => document.body.classList.remove("m-loading"), 4000);

