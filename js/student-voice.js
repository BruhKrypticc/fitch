import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { cachedTranslation, currentLanguage, translateText } from "./memory-translate.js";
import { passesModeration } from "./moderation.js";

const DEVICE_KEY = "fitchVoterDevice";
const STATUSES = {
  open: "Open",
  review: "Under review",
  planned: "Planned",
  done: "Done",
  declined: "Not doing"
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!/^d_[a-z0-9]{20}$/.test(id || "")) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    id = "d_" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// Shows text in the reader's language; data-original lets polls.js re-run it on language change.
function tr(node, text) {
  node.dataset.original = text;
  const lang = currentLanguage();
  const cached = lang === "en" ? text : cachedTranslation(text, lang);
  node.textContent = cached ?? text;
  if (cached === undefined) {
    translateText(text, lang).then((translated) => {
      if (node.isConnected && node.dataset.original === text && currentLanguage() === lang) node.textContent = translated;
    }).catch((error) => console.error("Translation error:", error));
  }
  return node;
}

const tel = (tag, className, text) => tr(el(tag, className), text);

function formatDuration(ms) {
  const hours = ms / 3600000;
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

// Public accountability numbers: how many ideas got an answer, and how fast.
export function computeAccountability(ideas) {
  const answered = ideas.filter((idea) => idea.respondedAt?.toMillis && (idea.response || idea.status !== "open"));
  const delays = answered
    .map((idea) => idea.respondedAt.toMillis() - (idea.createdAt?.toMillis?.() || 0))
    .filter((ms) => ms >= 0)
    .sort((a, b) => a - b);
  const median = delays.length ? delays[Math.floor(delays.length / 2)] : null;
  return {
    total: ideas.length,
    answered: answered.length,
    percent: ideas.length ? Math.round((answered.length / ideas.length) * 100) : 0,
    done: ideas.filter((idea) => idea.status === "done").length,
    median
  };
}

/**
 * Student Voice: students post ideas and upvote them; officers reply publicly with a status.
 * `manager` is null for students, or { uid, name, isOwner } for organizers/officers.
 * `voting` is { schoolMode, uid }: one upvote per school account, or per device without school mode.
 */
export function mountStudentVoice(root, { schoolId, manager = null, voting = { schoolMode: false, uid: null } }) {
  root.replaceChildren();
  root.classList.add("xl-module");

  const voterId = voting.schoolMode ? (voting.uid || null) : deviceId();
  const canWrite = Boolean(voterId) || Boolean(manager);

  const header = el("div", "xl-head");
  const titleWrap = el("div");
  titleWrap.append(
    tel("h3", "xl-title", "Student Voice"),
    tel("p", "xl-sub", "Share an idea, upvote the ones you care about, and see how the school responds.")
  );
  header.append(titleWrap);

  const stats = el("div", "xl-voice-stats");
  const list = el("div", "xl-list");
  list.setAttribute("aria-live", "polite");
  root.append(header, stats, buildComposer(), list);

  const voteState = new Map();
  const voteUnsubs = new Map();
  const cards = new Map();
  let ideas = [];

  function buildComposer() {
    const form = el("form", "xl-form");
    const input = el("textarea", "xl-voice-input");
    input.maxLength = 280;
    input.rows = 3;
    input.required = true;
    input.placeholder = "What should change at our school? (no names, please)";
    input.setAttribute("aria-label", "Your idea");
    const submit = el("button", "xl-btn xl-btn-primary", "Post idea");
    submit.type = "submit";
    submit.disabled = !canWrite && !manager;
    const status = el("p", "xl-status");
    status.setAttribute("role", "status");
    if (voting.schoolMode && !voterId && !manager) status.textContent = "Sign in with your school account to post and vote.";
    form.append(input, submit, status);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const content = input.value.trim();
      if (content.length < 5) return;
      submit.disabled = true;
      status.textContent = "Checking…";
      try {
        if (!await passesModeration([content])) {
          status.textContent = "That idea was blocked by the school-safe filter. Try rewording it.";
          return;
        }
        await addDoc(collection(db, "schools", schoolId, "ideas"), {
          content, status: "open", createdAt: serverTimestamp()
        });
        input.value = "";
        status.textContent = "Posted. Officers will see it.";
      } catch (error) {
        console.error("Could not post idea:", error);
        status.textContent = "Could not post right now. Try again.";
      } finally {
        submit.disabled = !canWrite && !manager;
      }
    });
    return form;
  }

  function renderStats() {
    const s = computeAccountability(ideas);
    stats.replaceChildren();
    if (!s.total) return;
    const items = [
      [String(s.total), "ideas raised"],
      [`${s.percent}%`, "got a response"],
      [String(s.done), "completed"],
      [s.median === null ? "—" : formatDuration(s.median), "median reply time"]
    ];
    for (const [value, label] of items) {
      const box = el("div", "xl-voice-stat");
      box.append(el("strong", "", value), tel("span", "", label));
      stats.append(box);
    }
  }

  function sortIdeas(items) {
    return items.slice().sort((a, b) => {
      const av = voteState.get(a.id)?.length || 0;
      const bv = voteState.get(b.id)?.length || 0;
      return bv - av || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    });
  }

  function renderCard(idea) {
    let card = cards.get(idea.id);
    if (!card) {
      card = el("article", "xl-poll");
      cards.set(idea.id, card);
    }
    const votes = voteState.get(idea.id) || [];
    const mine = voterId && votes.includes(voterId);
    card.replaceChildren();

    const top = el("div", "xl-poll-top");
    top.append(tel("strong", "xl-poll-q", idea.content));
    const badge = el("span", "xl-badge", STATUSES[idea.status] || "Open");
    if (idea.status === "declined") badge.classList.add("is-closed");
    top.append(badge);
    card.append(top);

    if (idea.response) {
      const reply = el("div", "xl-voice-reply");
      reply.append(el("span", "xl-meta", "School response"), tel("p", "", idea.response));
      card.append(reply);
    }

    const foot = el("div", "xl-poll-foot");
    const upvote = el("button", "xl-btn", `${mine ? "Upvoted" : "Upvote"} · ${votes.length}`);
    upvote.type = "button";
    upvote.disabled = mine || !voterId;
    upvote.addEventListener("click", async () => {
      upvote.disabled = true;
      try {
        await setDoc(doc(db, "schools", schoolId, "ideas", idea.id, "votes", voterId), { createdAt: serverTimestamp() });
      } catch (error) {
        console.error("Could not upvote:", error);
        upvote.disabled = false;
      }
    });
    foot.append(upvote);

    if (manager) {
      const respond = el("button", "xl-btn", "Respond");
      respond.type = "button";
      respond.addEventListener("click", () => card.append(buildResponder(idea)));
      foot.append(respond);
      const remove = el("button", "xl-btn xl-btn-danger", "Delete");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          const voteDocs = await getDocs(collection(db, "schools", schoolId, "ideas", idea.id, "votes"));
          if (manager.isOwner) {
            for (let i = 0; i < voteDocs.docs.length; i += 400) {
              const batch = writeBatch(db);
              voteDocs.docs.slice(i, i + 400).forEach((v) => batch.delete(v.ref));
              await batch.commit();
            }
          }
          await deleteDoc(doc(db, "schools", schoolId, "ideas", idea.id));
        } catch (error) {
          console.error("Could not delete idea:", error);
          remove.disabled = false;
        }
      });
      foot.append(remove);
    }
    card.append(foot);
    return card;
  }

  function buildResponder(idea) {
    const form = el("form", "xl-form");
    const select = el("select");
    for (const [value, label] of Object.entries(STATUSES)) {
      const option = el("option", "", label);
      option.value = value;
      option.selected = value === idea.status;
      select.append(option);
    }
    select.setAttribute("aria-label", "Status");
    const text = el("input");
    text.type = "text";
    text.maxLength = 400;
    text.value = idea.response || "";
    text.placeholder = "Public response (keep it kind and specific)";
    text.setAttribute("aria-label", "Public response");
    const save = el("button", "xl-btn xl-btn-primary", "Save response");
    save.type = "submit";
    const status = el("p", "xl-status");
    form.append(select, text, save, status);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        if (text.value.trim() && !await passesModeration([text.value])) {
          status.textContent = "That response was blocked by the school-safe filter.";
          return;
        }
        await updateDoc(doc(db, "schools", schoolId, "ideas", idea.id), {
          status: select.value, response: text.value.trim(), respondedAt: serverTimestamp()
        });
        form.remove();
      } catch (error) {
        console.error("Could not save response:", error);
        status.textContent = "Could not save. Try again.";
      } finally {
        save.disabled = false;
      }
    });
    return form;
  }

  function renderAll() {
    renderStats();
    list.replaceChildren();
    if (!ideas.length) {
      list.append(tel("p", "xl-empty", "No ideas yet. Be the first to post one."));
      return;
    }
    for (const idea of sortIdeas(ideas)) list.append(renderCard(idea));
  }

  function watchVotes(idea) {
    if (voteUnsubs.has(idea.id)) return;
    voteUnsubs.set(idea.id, onSnapshot(
      collection(db, "schools", schoolId, "ideas", idea.id, "votes"),
      (snap) => {
        voteState.set(idea.id, snap.docs.map((d) => d.id));
        renderAll();
      },
      (error) => console.error("Could not load upvotes:", error)
    ));
  }

  const stop = onSnapshot(
    query(collection(db, "schools", schoolId, "ideas"), orderBy("createdAt", "desc")),
    (snapshot) => {
      ideas = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((idea) => typeof idea.content === "string");
      const ids = new Set(ideas.map((idea) => idea.id));
      for (const [id, unsub] of voteUnsubs) {
        if (!ids.has(id)) { unsub(); voteUnsubs.delete(id); voteState.delete(id); cards.delete(id); }
      }
      ideas.forEach(watchVotes);
      renderAll();
    },
    (error) => {
      console.error("Could not load ideas:", error);
      list.replaceChildren(el("p", "xl-empty", "Ideas could not be loaded."));
    }
  );

  return () => {
    stop();
    voteUnsubs.forEach((unsub) => unsub());
    voteUnsubs.clear();
  };
}
