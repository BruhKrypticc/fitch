import {
  collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { createFinchAvatar } from "./finch-brand.js";
import { normalizeFlags } from "./school-flags.js";

const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/";
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const CHUNK_CHARS = 6000;
const MAX_CHUNKS = 60;
const MAX_TEXT_CHUNK = 20000;

const byId = (id) => document.getElementById(id);
let pdfjsPromise = null;

function loadPdfJs() {
  pdfjsPromise ||= (async () => {
    const lib = await import(`${PDFJS_BASE}pdf.min.mjs`);
    // Load the worker through a blob URL so it works from a cross-origin CDN.
    const workerSource = await (await fetch(`${PDFJS_BASE}pdf.worker.min.mjs`)).text();
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    return lib;
  })().catch((error) => {
    pdfjsPromise = null;
    throw error;
  });
  return pdfjsPromise;
}

async function extractPdfText(file) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      pages.push(text.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
    }
  } finally {
    await pdf.destroy();
  }
  return pages.filter(Boolean).join("\n\n");
}

function splitLongText(text) {
  const pieces = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length <= CHUNK_CHARS) {
      pieces.push(sentence);
      continue;
    }
    for (let start = 0; start < sentence.length; start += CHUNK_CHARS) {
      pieces.push(sentence.slice(start, start + CHUNK_CHARS));
    }
  }
  return pieces;
}

function chunkText(text) {
  const units = text.split(/\n{2,}/).flatMap((paragraph) => (
    paragraph.length > CHUNK_CHARS ? splitLongText(paragraph) : [paragraph]
  ));
  const chunks = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + unit;
  }
  if (current) chunks.push(current);
  return chunks;
}

function baseName(fileName) {
  return fileName.replace(/\.pdf$/i, "").trim();
}

async function saveEntries(schoolId, entries) {
  const batch = writeBatch(db);
  for (const entry of entries) {
    batch.set(doc(collection(db, "schools", schoolId, "knowledge_base")), { ...entry, createdAt: serverTimestamp() });
  }
  await batch.commit();
}

async function buildPdfEntries(file, category, titleOverride) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("Please choose a PDF file.");
  if (file.size > MAX_PDF_BYTES) throw new Error("That PDF is larger than 15 MB.");
  const text = await extractPdfText(file);
  if (!text.trim()) throw new Error("No selectable text was found. Scanned PDFs aren’t supported.");
  const chunks = chunkText(text);
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(`That PDF is too long (over ${MAX_CHUNKS * CHUNK_CHARS / 1000}k characters). Split it into smaller files.`);
  }
  const title = (titleOverride || baseName(file.name) || "Untitled PDF").slice(0, 90);
  const fileId = crypto.randomUUID();
  return chunks.map((content, index) => ({
    title: chunks.length > 1 ? `${title} (part ${index + 1}/${chunks.length})` : title,
    category,
    content,
    source: "pdf",
    fileName: file.name.slice(0, 200),
    fileId,
    chunkIndex: index,
    chunkCount: chunks.length
  }));
}

// Groups chunk documents back into one row per uploaded PDF; text entries stay one row each.
function groupEntries(snapshot) {
  const groups = new Map();
  for (const entryDoc of snapshot.docs) {
    const data = entryDoc.data();
    const key = data.fileId || entryDoc.id;
    const group = groups.get(key) || {
      title: data.fileId ? (data.fileName || data.title) : data.title,
      category: data.category,
      isPdf: Boolean(data.fileId),
      chars: 0,
      refs: []
    };
    group.chars += String(data.content || "").length;
    group.refs.push(entryDoc.ref);
    groups.set(key, group);
  }
  return [...groups.values()];
}

async function deleteRefs(refs) {
  for (let start = 0; start < refs.length; start += 400) {
    const batch = writeBatch(db);
    refs.slice(start, start + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

function renderGroup(group, status) {
  const item = document.createElement("article");
  item.className = "finch-kb-item";

  const copy = document.createElement("div");
  copy.className = "finch-kb-copy";
  const title = document.createElement("strong");
  title.textContent = group.title || "Untitled";
  const meta = document.createElement("span");
  const kind = group.isPdf ? `PDF · ${group.refs.length} pieces` : "Text";
  meta.textContent = `${group.category || "Other"} · ${kind} · ${group.chars.toLocaleString()} characters`;
  copy.append(title, meta);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "finch-kb-delete";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete ${group.title || "entry"}`);
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      await deleteRefs(group.refs);
      status.textContent = `Deleted “${group.title}”.`;
    } catch (error) {
      console.error("Could not delete knowledge entry:", error);
      status.textContent = "Could not delete that entry. Try again.";
      remove.disabled = false;
    }
  });

  item.append(copy, remove);
  return item;
}

function listenForSettings(schoolId) {
  const form = byId("finchSettingsForm");
  const enabled = byId("finchEnabledInput");
  const instructions = byId("finchInstructionsInput");
  const status = byId("finchSettingsStatus");
  let dirty = false;

  form.addEventListener("input", () => { dirty = true; });

  onSnapshot(doc(db, "schools", schoolId, "settings", "ai_config"), (snapshot) => {
    if (dirty) return;
    const config = snapshot.exists() ? snapshot.data() : {};
    enabled.checked = config.enabled === true;
    instructions.value = typeof config.instructions === "string" ? config.instructions : "";
    const flags = normalizeFlags(config);
    form.querySelectorAll("[data-flag]").forEach((input) => { input.checked = flags[input.dataset.flag]; });
  }, (error) => {
    console.error("Could not load Finch settings:", error);
    status.textContent = "Finch settings could not be loaded.";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Saving…";
    try {
      const flags = {};
      form.querySelectorAll("[data-flag]").forEach((input) => { flags[input.dataset.flag] = input.checked; });
      await setDoc(doc(db, "schools", schoolId, "settings", "ai_config"), {
        enabled: enabled.checked,
        instructions: instructions.value.trim().slice(0, 1000),
        ...flags,
        updatedAt: serverTimestamp()
      }, { merge: true });
      dirty = false;
      status.textContent = "Finch settings saved.";
    } catch (error) {
      console.error("Could not save Finch settings:", error);
      status.textContent = "Could not save Finch settings. Try again.";
    }
  });
}

function listenForKnowledgeBase(schoolId) {
  const form = byId("finchKbForm");
  const status = byId("finchKbStatus");
  const list = byId("finchKbList");
  const saveButton = byId("finchKbSaveBtn");
  const fileInput = byId("finchKbFileInput");

  onSnapshot(
    query(collection(db, "schools", schoolId, "knowledge_base"), orderBy("createdAt", "desc")),
    (snapshot) => {
      const groups = groupEntries(snapshot);
      if (!groups.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Nothing here yet. Upload a PDF or paste text above.";
        list.replaceChildren(empty);
        return;
      }
      list.replaceChildren(...groups.map((group) => renderGroup(group, status)));
    },
    (error) => {
      console.error("Could not load knowledge base:", error);
      status.textContent = "The knowledge base could not be loaded.";
    }
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const category = byId("finchKbCategoryInput").value;
    const title = byId("finchKbTitleInput").value.trim();
    const content = byId("finchKbContentInput").value.trim();
    const file = fileInput.files[0];
    if (!file && !(title && content)) {
      status.textContent = "Choose a PDF, or enter a title and some text.";
      return;
    }

    saveButton.disabled = true;
    try {
      let entries = [];
      if (file) {
        status.textContent = "Reading PDF…";
        entries = await buildPdfEntries(file, category, title);
      }
      if (title && content) {
        entries.push({ title, category, content: content.slice(0, MAX_TEXT_CHUNK) });
      }
      status.textContent = "Saving…";
      await saveEntries(schoolId, entries);
      form.reset();
      status.textContent = file ? `Added “${file.name}” to the knowledge base.` : "Added to the knowledge base.";
    } catch (error) {
      console.error("Could not save knowledge entry:", error);
      status.textContent = error instanceof Error && error.message && !error.code
        ? error.message
        : "Could not save. Check your connection and try again.";
    } finally {
      saveButton.disabled = false;
    }
  });
}

export function initFinchAdmin(schoolId) {
  byId("finchSettingsCard").hidden = false;
  byId("finchTabButton").hidden = false;
  document.querySelector(".finch-brand-badge")?.replaceChildren(createFinchAvatar());
  listenForSettings(schoolId);
  listenForKnowledgeBase(schoolId);
}
