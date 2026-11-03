import {
  addDoc, collection, deleteDoc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const normalize = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export function groupGaps(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = normalize(entry.question);
    if (!key) continue;
    const group = groups.get(key) || { question: entry.question, count: 0, refs: [] };
    group.count += 1;
    group.refs.push(entry.ref);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * "Finch gaps": questions Finch could not answer, ranked by how often they were asked.
 * Only the organizer can turn a gap into a knowledge-base entry.
 */
export function mountFinchGaps(root, { schoolId, isOwner }) {
  root.replaceChildren();
  root.classList.add("xl-module");
  root.append(
    el("h3", "xl-title", "What students asked that Finch couldn’t answer"),
    el("p", "xl-sub", "Questions are logged anonymously with no names or accounts. Add the answer to the knowledge base and the gap closes for everyone.")
  );
  const list = el("div", "xl-list");
  list.setAttribute("aria-live", "polite");
  root.append(list);

  async function clearGroup(group) {
    const batch = writeBatch(db);
    group.refs.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  function buildAnswerForm(group) {
    const form = el("form", "xl-form");
    const title = el("input");
    title.type = "text";
    title.maxLength = 120;
    title.value = group.question.slice(0, 120);
    title.setAttribute("aria-label", "Entry title");
    const content = el("textarea", "xl-voice-input");
    content.rows = 4;
    content.maxLength = 5000;
    content.required = true;
    content.placeholder = "Write the answer Finch should give. Don’t include private information.";
    content.setAttribute("aria-label", "Answer");
    const save = el("button", "xl-btn xl-btn-primary", "Add to knowledge base");
    save.type = "submit";
    const status = el("p", "xl-status");
    form.append(title, content, save, status);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await addDoc(collection(db, "schools", schoolId, "knowledge_base"), {
          title: title.value.trim() || group.question.slice(0, 120),
          category: "Other",
          content: content.value.trim(),
          createdAt: serverTimestamp()
        });
        await clearGroup(group);
      } catch (error) {
        console.error("Could not save answer:", error);
        status.textContent = "Could not save. Try again.";
        save.disabled = false;
      }
    });
    return form;
  }

  function render(groups) {
    list.replaceChildren();
    if (!groups.length) {
      list.append(el("p", "xl-empty", "No gaps yet. When Finch can’t answer something, it will show up here."));
      return;
    }
    for (const group of groups) {
      const card = el("article", "xl-poll");
      const top = el("div", "xl-poll-top");
      top.append(el("strong", "xl-poll-q", group.question), el("span", "xl-gap-count", `×${group.count}`));
      const foot = el("div", "xl-poll-foot");
      if (isOwner) {
        const answer = el("button", "xl-btn xl-btn-primary", "Answer it");
        answer.type = "button";
        answer.addEventListener("click", () => {
          answer.disabled = true;
          card.append(buildAnswerForm(group));
        });
        foot.append(answer);
      }
      const dismiss = el("button", "xl-btn", "Dismiss");
      dismiss.type = "button";
      dismiss.addEventListener("click", async () => {
        dismiss.disabled = true;
        try { await clearGroup(group); } catch (error) { console.error("Could not dismiss:", error); dismiss.disabled = false; }
      });
      foot.append(dismiss);
      card.append(top, foot);
      list.append(card);
    }
  }

  return onSnapshot(
    query(collection(db, "schools", schoolId, "finch_gaps"), orderBy("createdAt", "desc"), limit(300)),
    (snapshot) => render(groupGaps(snapshot.docs.map((d) => ({ ref: d.ref, ...d.data() })).filter((d) => typeof d.question === "string"))),
    (error) => {
      console.error("Could not load Finch gaps:", error);
      list.replaceChildren(el("p", "xl-empty", "Finch gaps could not be loaded."));
    }
  );
}
