import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { cachedTranslation, currentLanguage, onLanguageChange, translateText } from "./memory-translate.js";
import { passesModeration } from "./moderation.js";

const MAX_OPTIONS = 6;
const DEVICE_KEY = "fitchVoterDevice";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function getDeviceVoterId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!/^d_[a-z0-9]{20}$/.test(id || "")) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    id = "d_" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function checkIcon() {
  const icon = el("span", "xl-check");
  icon.setAttribute("role", "img");
  icon.setAttribute("aria-label", "Your vote");
  icon.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="10" fill="currentColor"/><path d="M5.6 10.4l3 3 5.8-6.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return icon;
}

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

function tel(tag, className, text) {
  return tr(el(tag, className), text);
}

async function deletePollWithVotes(schoolId, pollId) {
  const votes = await getDocs(collection(db, "schools", schoolId, "polls", pollId, "votes"));
  for (let i = 0; i < votes.docs.length; i += 400) {
    const batch = writeBatch(db);
    votes.docs.slice(i, i + 400).forEach((v) => batch.delete(v.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, "schools", schoolId, "polls", pollId));
}

export function mountPolls(root, { schoolId, manager = null, voting = { schoolMode: false, uid: null } }) {
  root.replaceChildren();
  root.classList.add("xl-module");

  const header = el("div", "xl-head");
  const titleWrap = el("div");
  titleWrap.append(tel("h3", "xl-title", "Class office polls"), tel("p", "xl-sub",
    "Official polls from your school’s organizers. Results update live."));
  header.append(titleWrap);

  const voterId = voting.schoolMode ? (voting.uid || null) : getDeviceVoterId();
  const mode = tel("p", "xl-mode", voting.schoolMode
    ? "Verified voting: one vote per school Google account."
    : "One vote per device. Your choice stays anonymous.");

  const list = el("div", "xl-list");
  list.setAttribute("aria-live", "polite");
  root.append(header);
  if (manager) root.append(buildComposer());
  else root.append(mode);
  root.append(list);

  const voteUnsubs = new Map();
  const cards = new Map();

  function buildComposer() {
    const form = el("form", "xl-form xl-form-poll");
    const question = el("input");
    question.type = "text";
    question.maxLength = 160;
    question.required = true;
    question.placeholder = "Poll question";
    question.setAttribute("aria-label", "Poll question");
    const optionsWrap = el("div", "xl-options-edit");
    const addOption = (value = "") => {
      const input = el("input");
      input.type = "text";
      input.maxLength = 80;
      input.placeholder = `Option ${optionsWrap.children.length + 1}`;
      input.value = value;
      input.setAttribute("aria-label", `Option ${optionsWrap.children.length + 1}`);
      optionsWrap.append(input);
    };
    addOption(); addOption();
    const more = el("button", "xl-btn", "Add option");
    more.type = "button";
    more.addEventListener("click", () => {
      if (optionsWrap.children.length < MAX_OPTIONS) addOption();
      more.disabled = optionsWrap.children.length >= MAX_OPTIONS;
    });
    const submit = el("button", "xl-btn xl-btn-primary", "Publish poll");
    submit.type = "submit";
    const status = el("p", "xl-status");
    status.setAttribute("aria-live", "polite");
    form.append(question, optionsWrap, more, submit, status);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const options = Array.from(optionsWrap.children, (i) => i.value.trim()).filter(Boolean);
      if (options.length < 2) { status.textContent = "Add at least two options."; return; }
      submit.disabled = true;
      status.textContent = "Checking…";
      if (!await passesModeration([question.value, ...options])) {
        status.textContent = "";
        submit.disabled = false;
        return;
      }
      status.textContent = "Publishing…";
      try {
        await addDoc(collection(db, "schools", schoolId, "polls"), {
          question: question.value.trim().slice(0, 160),
          options: options.slice(0, MAX_OPTIONS),
          status: "open",
          createdBy: manager.name,
          createdByUid: manager.uid,
          createdAt: serverTimestamp()
        });
        form.reset();
        while (optionsWrap.children.length > 2) optionsWrap.lastChild.remove();
        more.disabled = false;
        status.textContent = "Poll published.";
      } catch (error) {
        console.error("Could not publish poll:", error);
        status.textContent = error.code === "permission-denied"
          ? "Firestore denied this. Deploy the latest firestore.rules."
          : "Could not publish the poll.";
      } finally {
        submit.disabled = false;
      }
    });
    return form;
  }

  function renderCard(card) {
    const { poll, votes } = card;
    const counts = poll.options.map(() => 0);
    let mine = null;
    for (const v of votes) {
      if (Number.isInteger(v.option) && counts[v.option] !== undefined) counts[v.option] += 1;
      if (voterId && v.id === voterId) mine = v.option;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    const closed = poll.status === "closed";
    const showResults = Boolean(manager) || closed || mine !== null;

    const node = card.node;
    node.replaceChildren();
    const top = el("div", "xl-poll-top");
    top.append(tel("strong", "xl-poll-q", poll.question),
      tel("span", `xl-badge${closed ? " is-closed" : ""}`, closed ? "Closed" : "Open"));
    node.append(top);

    const needsLogin = !manager && voting.schoolMode && !voterId;
    const choices = el("div", showResults ? "xl-results" : "xl-choices");
    node.append(choices);
    poll.options.forEach((label, index) => {
      const percent = total ? Math.round((counts[index] / total) * 100) : 0;
      if (showResults) {
        const row = el("div", `xl-result${mine === index ? " is-mine" : ""}`);
        const bar = el("span", "xl-bar");
        bar.style.width = `${percent}%`;
        const text = el("span", "xl-result-text");
        text.append(tel("span", "", label));
        if (mine === index) text.append(checkIcon());
        const num = el("span", "xl-result-num", `${counts[index]} · ${percent}%`);
        row.append(bar, text, num);
        choices.append(row);
      } else {
        const btn = tel("button", "xl-option", label);
        btn.type = "button";
        btn.disabled = closed || needsLogin;
        btn.addEventListener("click", async () => {
          node.querySelectorAll("button").forEach((b) => { b.disabled = true; });
          try {
            await setDoc(doc(db, "schools", schoolId, "polls", poll.id, "votes", voterId), {
              option: index,
              createdAt: serverTimestamp()
            });
          } catch (error) {
            console.error("Vote failed:", error);
            window.alert(error.code === "permission-denied"
              ? "Your vote couldn’t be counted. You may have already voted, or this poll just closed."
              : "Your vote couldn’t be saved. Try again.");
            renderCard(card);
          }
        });
        choices.append(btn);
      }
    });

    const foot = el("div", "xl-poll-foot");
    foot.append(el("span", "xl-meta", `${total} vote${total === 1 ? "" : "s"}`));
    if (needsLogin) foot.append(el("span", "xl-meta", "Sign in with your school Google account to vote."));
    if (manager) {
      const toggle = el("button", "xl-btn", closed ? "Reopen" : "Close poll");
      toggle.type = "button";
      toggle.addEventListener("click", () => updateDoc(doc(db, "schools", schoolId, "polls", poll.id), {
        status: closed ? "open" : "closed"
      }).catch((e) => console.error("Could not update poll:", e)));
      foot.append(toggle);
      if (manager.isOwner) {
        const remove = el("button", "xl-btn xl-btn-danger", "Delete");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!window.confirm("Delete this poll and all its votes?")) return;
          remove.disabled = true;
          try { await deletePollWithVotes(schoolId, poll.id); }
          catch (e) { console.error("Could not delete poll:", e); remove.disabled = false; }
        });
        foot.append(remove);
      }
    }
    node.append(foot);
  }

  function syncList(polls) {
    const ids = new Set(polls.map((p) => p.id));
    for (const [id, unsub] of voteUnsubs) {
      if (!ids.has(id)) { unsub(); voteUnsubs.delete(id); cards.delete(id); }
    }
    list.replaceChildren();
    if (!polls.length) {
      list.append(el("p", "xl-empty", manager ? "No polls yet. Publish your first one above." : "No polls right now."));
      return;
    }
    for (const poll of polls) {
      let card = cards.get(poll.id);
      if (!card) {
        card = { poll, votes: [], node: el("article", "xl-poll") };
        cards.set(poll.id, card);
        const target = card;
        voteUnsubs.set(poll.id, onSnapshot(
          collection(db, "schools", schoolId, "polls", poll.id, "votes"),
          (snap) => { target.votes = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderCard(target); },
          (error) => console.error("Could not load votes:", error)
        ));
      }
      card.poll = poll;
      renderCard(card);
      list.append(card.node);
    }
  }

  const stop = onSnapshot(
    query(collection(db, "schools", schoolId, "polls"), orderBy("createdAt", "desc")),
    (snapshot) => syncList(snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => typeof p.question === "string" && Array.isArray(p.options) && p.options.length >= 2)),
    (error) => {
      console.error("Could not load polls:", error);
      list.replaceChildren(el("p", "xl-empty", "Polls could not be loaded."));
    }
  );

  const stopLanguage = onLanguageChange(() => {
    root.querySelectorAll("[data-original]").forEach((node) => tr(node, node.dataset.original));
  });

  return () => {
    stop();
    stopLanguage();
    voteUnsubs.forEach((u) => u());
    voteUnsubs.clear();
  };
}
