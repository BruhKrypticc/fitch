import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";

// Operational toggles stored in schools/{id}/settings/ai_config. Anything an organizer has
// not switched off stays on, so schools that predate these toggles keep working.
export const FLAG_DEFAULTS = Object.freeze({
  pollsEnabled: true,
  documentLockerEnabled: true,
  finchAnnouncements: true,
  finchPhotoCaptions: true
});

export const FLAG_KEYS = Object.freeze(Object.keys(FLAG_DEFAULTS));

export function normalizeFlags(data = {}) {
  const flags = { ...FLAG_DEFAULTS };
  for (const key of FLAG_KEYS) {
    if (typeof data[key] === "boolean") flags[key] = data[key];
  }
  return flags;
}

export function watchSchoolFlags(schoolId, callback) {
  if (!schoolId) {
    callback({ ...FLAG_DEFAULTS });
    return () => {};
  }
  return onSnapshot(doc(db, "schools", schoolId, "settings", "ai_config"), (snapshot) => {
    callback(normalizeFlags(snapshot.exists() ? snapshot.data() : {}));
  }, (error) => {
    console.error("School feature settings unavailable:", error);
    callback({ ...FLAG_DEFAULTS });
  });
}
