import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db } from "./firebase.js";

export const SITE_OWNER_EMAIL = "syncoperating@gmail.com";

const sessionKey = "fitchActivitySessionId";
const allowedPages = new Map([
  ["/", "/"],
  ["/index.html", "/"],
  ["/student", "/student"],
  ["/student.html", "/student"],
  ["/admin", "/admin"],
  ["/admin.html", "/admin"]
]);

let trackingEnabled = false;
let sessionId = "";

function currentPage() {
  return allowedPages.get(window.location.pathname) || null;
}

function getSessionId() {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem(sessionKey) || crypto.randomUUID();
    sessionStorage.setItem(sessionKey, sessionId);
  } catch (error) {
    console.error("Could not persist the anonymous activity session:", error);
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

function writeActivity(eventType, action, outcome = "none", durationMs = 0) {
  const page = currentPage();
  if (!trackingEnabled || !page) return;

  const user = auth.currentUser;
  void addDoc(collection(db, "site_activity"), {
    sessionId: getSessionId(),
    ...(user?.emailVerified && user.email ? { visitorEmail: user.email } : {}),
    eventType,
    page,
    action,
    outcome,
    durationMs: Math.min(Math.max(Math.round(durationMs), 0), 86_400_000),
    createdAt: serverTimestamp()
  }).catch((error) => {
    console.error("Could not record anonymous site activity:", error);
  });
}

export function trackActivityResult(action, outcome) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(action)
    || !["success", "failure"].includes(outcome)) {
    console.error("Invalid activity result was not recorded.");
    return;
  }
  writeActivity("action_result", action, outcome);
}

function actionName(element) {
  const candidate = element.id || element.dataset.track || element.dataset.tab;
  if (candidate && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(candidate)) return candidate;
  return element.tagName.toLowerCase();
}

function beginTracking() {
  if (trackingEnabled || !currentPage()) return;
  trackingEnabled = true;
  getSessionId();
  writeActivity("page_view", "page_view");

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const element = event.target.closest("button, a[href], [role='tab']");
    if (!element || element.closest("form")) return;
    writeActivity("interaction", actionName(element), "attempt");
  }, true);

  document.addEventListener("submit", (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    writeActivity("interaction", actionName(event.target), "attempt");
  }, true);

  let visibleSince = document.visibilityState === "visible" ? performance.now() : null;
  let visibleDuration = 0;
  const recordExit = () => {
    if (visibleSince === null) return;
    visibleDuration += performance.now() - visibleSince;
    visibleSince = null;
    writeActivity("page_exit", "page_exit", "none", visibleDuration);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      recordExit();
    } else {
      visibleSince = performance.now();
    }
  });
  window.addEventListener("pagehide", recordExit);
}

onAuthStateChanged(auth, () => {
  beginTracking();
});
