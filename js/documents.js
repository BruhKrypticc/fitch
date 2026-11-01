import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { uploadDocument } from "./photo-utils.js";

export const DOCUMENT_CATEGORIES = ["Handbook", "Form", "Permission slip", "Other"];
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|png|jpe?g)$/i;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(timestamp) {
  const date = timestamp?.toDate?.();
  return date ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Renders the Document Locker into `root`.
 * `manager` is null for read-only viewers, or { uid, isOwner, name } for organizers/officers.
 */
export function mountDocumentLocker(root, { schoolId, manager = null }) {
  root.replaceChildren();
  root.classList.add("xl-module");

  const header = el("div", "xl-head");
  const titleWrap = el("div");
  titleWrap.append(el("h3", "xl-title", "Document Locker"), el("p", "xl-sub",
    "Handbooks, forms and permission slips for your school."));
  header.append(titleWrap);

  const tools = el("div", "xl-tools");
  const search = el("input", "xl-search");
  search.type = "search";
  search.placeholder = "Search documents";
  search.setAttribute("aria-label", "Search documents");
  const chips = el("div", "xl-chips");
  tools.append(search, chips);

  const list = el("div", "xl-list");
  list.setAttribute("aria-live", "polite");
  const state = { docs: [], category: "All", term: "" };

  if (manager) root.append(header, buildUploadForm(), tools, list);
  else root.append(header, tools, list);

  function buildUploadForm() {
    const form = el("form", "xl-form");
    const title = el("input");
    title.type = "text";
    title.maxLength = 90;
    title.placeholder = "Title (defaults to file name)";
    title.setAttribute("aria-label", "Document title");
    const category = el("select");
    category.setAttribute("aria-label", "Category");
    for (const name of DOCUMENT_CATEGORIES) category.append(new Option(name, name));
    const file = el("input");
    file.type = "file";
    file.accept = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg";
    file.setAttribute("aria-label", "File");
    const submit = el("button", "xl-btn xl-btn-primary", "Upload");
    submit.type = "submit";
    const status = el("p", "xl-status");
    status.setAttribute("aria-live", "polite");
    const hint = el("p", "xl-hint",
      "Anyone with the file link can open it, so don’t upload private student information. PDF, Office, text or image, up to 20 MB.");
    form.append(title, category, file, submit, status, hint);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const chosen = file.files?.[0];
      if (!chosen) { status.textContent = "Choose a file first."; return; }
      if (chosen.size > MAX_BYTES) { status.textContent = "That file is over 20 MB."; return; }
      if (!ALLOWED_EXT.test(chosen.name)) { status.textContent = "That file type isn’t supported."; return; }
      submit.disabled = true;
      status.textContent = "Uploading…";
      try {
        const fileUrl = await uploadDocument(chosen);
        await addDoc(collection(db, "schools", schoolId, "documents"), {
          title: (title.value.trim() || chosen.name).slice(0, 90),
          category: category.value,
          fileName: chosen.name.slice(0, 160),
          fileUrl,
          fileSize: chosen.size,
          mimeType: (chosen.type || "").slice(0, 100),
          uploadedBy: manager.name,
          uploadedByUid: manager.uid,
          createdAt: serverTimestamp()
        });
        form.reset();
        status.textContent = "Uploaded.";
      } catch (error) {
        console.error("Document upload failed:", error);
        status.textContent = error.code === "permission-denied"
          ? "Saved the file, but Firestore denied the record. Deploy the latest firestore.rules."
          : `Upload failed: ${error.message || "try again."}`;
      } finally {
        submit.disabled = false;
      }
    });
    return form;
  }

  function renderChips() {
    chips.replaceChildren();
    for (const name of ["All", ...DOCUMENT_CATEGORIES]) {
      const chip = el("button", `xl-chip${state.category === name ? " is-active" : ""}`, name);
      chip.type = "button";
      chip.addEventListener("click", () => {
        state.category = name;
        renderChips();
        renderList();
      });
      chips.append(chip);
    }
  }

  function renderList() {
    list.replaceChildren();
    const term = state.term.toLowerCase();
    const shown = state.docs.filter((item) =>
      (state.category === "All" || item.category === state.category)
      && (!term || `${item.title} ${item.fileName}`.toLowerCase().includes(term)));
    if (!shown.length) {
      list.append(el("p", "xl-empty", state.docs.length ? "No documents match." : "No documents yet."));
      return;
    }
    for (const item of shown) list.append(buildRow(item));
  }

  function buildRow(item) {
    const row = el("article", "xl-row");
    const info = el("div", "xl-info");
    info.append(el("strong", "xl-name", item.title));
    const meta = [item.category, formatSize(item.fileSize), formatDate(item.createdAt)].filter(Boolean).join(" · ");
    info.append(el("span", "xl-meta", meta));

    const actions = el("div", "xl-actions");
    const url = safeUrl(item.fileUrl);
    if (url) {
      const view = el("a", "xl-btn", "View");
      view.href = url;
      view.target = "_blank";
      view.rel = "noopener noreferrer";
      const download = el("a", "xl-btn", "Download");
      download.href = url;
      download.download = item.fileName || "";
      download.rel = "noopener noreferrer";
      actions.append(view, download);
    }
    if (manager && (manager.isOwner || item.uploadedByUid === manager.uid)) {
      const remove = el("button", "xl-btn xl-btn-danger", "Delete");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete “${item.title}”? Students will no longer see it.`)) return;
        remove.disabled = true;
        try {
          await deleteDoc(doc(db, "schools", schoolId, "documents", item.id));
        } catch (error) {
          console.error("Could not delete document:", error);
          remove.disabled = false;
          window.alert("Could not delete this document.");
        }
      });
      actions.append(remove);
    }
    row.append(info, actions);
    return row;
  }

  search.addEventListener("input", () => {
    state.term = search.value.trim();
    renderList();
  });

  renderChips();
  renderList();

  return onSnapshot(
    query(collection(db, "schools", schoolId, "documents"), orderBy("createdAt", "desc")),
    (snapshot) => {
      state.docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderList();
    },
    (error) => {
      console.error("Could not load documents:", error);
      list.replaceChildren(el("p", "xl-empty", "Documents could not be loaded."));
    }
  );
}
