import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { watchSchoolFlags } from "./school-flags.js";
import { mountPolls } from "./polls.js";
import { mountDocumentLocker } from "./documents.js";

// Admin page: Polls and Documents management for organizers and officers.
export function initAdminExtras({ schoolId, user, isOrganizer }) {
  const manager = {
    uid: user.uid,
    isOwner: isOrganizer,
    name: isOrganizer ? "School organizer" : "Class officer"
  };
  const pollsButton = document.getElementById("pollsTabButton");
  const docsButton = document.getElementById("documentsTabButton");
  let stopPolls = null;
  let stopDocs = null;

  const gate = (button, visible) => {
    button.hidden = !visible;
    if (!visible && button.classList.contains("is-active")) {
      document.querySelector('.school-tab[data-tab="board"]')?.click();
    }
  };

  const card = document.getElementById("schoolModulesCard");
  const form = document.getElementById("schoolModulesForm");
  const status = document.getElementById("schoolModulesStatus");
  let dirty = false;
  card.hidden = !isOrganizer;

  function syncModulesForm(flags) {
    if (dirty) return;
    form.querySelectorAll("[data-flag]").forEach((input) => { input.checked = flags[input.dataset.flag]; });
  }

  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isOrganizer) return;
    status.textContent = "Saving…";
    const values = {};
    form.querySelectorAll("[data-flag]").forEach((input) => { values[input.dataset.flag] = input.checked; });
    try {
      await setDoc(doc(db, "schools", schoolId, "settings", "ai_config"), {
        ...values,
        updatedAt: serverTimestamp()
      }, { merge: true });
      dirty = false;
      status.textContent = "Modules saved.";
    } catch (error) {
      console.error("Could not save modules:", error);
      status.textContent = "Could not save. Try again.";
    }
  });

  watchSchoolFlags(schoolId, (flags) => {
    syncModulesForm(flags);
    gate(pollsButton, flags.pollsEnabled);
    gate(docsButton, flags.documentLockerEnabled);

    if (flags.pollsEnabled && !stopPolls) {
      stopPolls = mountPolls(document.getElementById("pollsRoot"), { schoolId, manager });
    } else if (!flags.pollsEnabled && stopPolls) {
      stopPolls();
      stopPolls = null;
    }
    if (flags.documentLockerEnabled && !stopDocs) {
      stopDocs = mountDocumentLocker(document.getElementById("documentsRoot"), { schoolId, manager });
    } else if (!flags.documentLockerEnabled && stopDocs) {
      stopDocs();
      stopDocs = null;
    }
  });
}
