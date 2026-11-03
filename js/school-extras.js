import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { watchSchoolFlags } from "./school-flags.js";
import { mountPolls } from "./polls.js";
import { mountDocumentLocker } from "./documents.js";

const schoolId = localStorage.getItem("schoolId");
const byId = (id) => document.getElementById(id);

if (schoolId) {
  let flags = { pollsEnabled: true, documentLockerEnabled: true };
  let schoolMode = false;
  let schoolReady = false;
  let uid = null;
  let authReady = false;
  let stopPolls = null;
  let pollsKey = "";
  let stopDocs = null;

  const isMobile = Boolean(byId("mTabbar"));
  const tabButton = (name) => document.querySelector(isMobile ? `.m-tab[data-tab="${name}"]` : `.school-tab[data-tab="${name}"]`);

  function showTab(name, visible) {
    const button = tabButton(name);
    if (!button) return;
    button.hidden = !visible;
    if (!visible && button.classList.contains("is-active")) {
      document.querySelector(isMobile ? '.m-tab[data-tab="feed"]' : '.school-tab[data-tab="board"]')?.click();
    }
  }

  function update() {
    if (!schoolReady || !authReady) return;
    showTab("polls", flags.pollsEnabled);
    showTab("documents", flags.documentLockerEnabled);

    if (flags.pollsEnabled) {
      const key = `${schoolMode}|${schoolMode ? uid : ""}`;
      if (key !== pollsKey) {
        stopPolls?.();
        pollsKey = key;
        stopPolls = mountPolls(byId("pollsRoot"), { schoolId, voting: { schoolMode, uid } });
      }
    } else if (stopPolls) {
      stopPolls();
      stopPolls = null;
      pollsKey = "";
    }

    if (flags.documentLockerEnabled && !stopDocs) {
      stopDocs = mountDocumentLocker(byId("documentsRoot"), { schoolId });
    } else if (!flags.documentLockerEnabled && stopDocs) {
      stopDocs();
      stopDocs = null;
    }
  }

  onSnapshot(doc(db, "schools", schoolId), (snapshot) => {
    schoolMode = snapshot.data()?.features?.studentEmailRequired === true;
    schoolReady = true;
    update();
  }, (error) => console.error("Could not read school settings:", error));

  onAuthStateChanged(auth, (user) => {
    uid = user?.uid || null;
    authReady = true;
    update();
  });

  watchSchoolFlags(schoolId, (next) => {
    flags = next;
    update();
  });
}
