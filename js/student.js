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
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { getStudentAccountAlias, isAllowedSchoolAccount } from "./student-identity.js";
import { trackActivityResult } from "./activity-tracker.js";
import { applySchoolLogo, applySchoolTheme } from "./school-theme.js";
import { toGoogleCalendarEmbedUrl } from "./calendar.js";
import { openPhotoPreview, uploadPhoto } from "./photo-utils.js";
import { lookupInterfaceTranslation } from "./translations.js";
import { passesModeration } from "./moderation.js";
import { translate } from "./translate-engine.js";

const translateWithAPI = translate;

const translationCache = new Map();

const schoolId = localStorage.getItem("schoolId");
const schoolName = localStorage.getItem("schoolName");
let schoolFeatures = {};

function waitForAuthState() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

const initialUser = await waitForAuthState();
let studentName = "";
if (!schoolId || !schoolName) {
  window.location.replace("/");
} else {
  const schoolSnapshot = await getDoc(doc(db, "schools", schoolId));
  if (!schoolSnapshot.exists()) {
    window.location.replace("/");
    throw new Error("School was not found.");
  }
  const school = schoolSnapshot.data();
  schoolFeatures = school.features && typeof school.features === "object" ? school.features : {};
  if (school.features?.studentEmailRequired === true
    && !isAllowedSchoolAccount(initialUser, school.studentEmailDomain || "")) {
    window.location.replace("/");
    throw new Error("This school requires an approved school Google account.");
  }
  try {
    studentName = school.features?.studentEmailRequired === true && initialUser
      ? await getStudentAccountAlias(db, schoolId, initialUser.uid)
      : (localStorage.getItem("studentName") || "").trim();
    if (!studentName) {
      window.location.replace("/");
      throw new Error("Student display name was not found.");
    }
  } catch (error) {
    console.error("Could not load the student display name:", error);
    window.location.replace("/");
    throw error;
  }
  const schoolTagline = document.getElementById("schoolTagline");
  const announcementList = document.getElementById("announcementList");
  const pinnedAnnouncementList = document.getElementById("pinnedAnnouncementList");
  const pinnedAnnouncementsSection = document.getElementById("pinnedAnnouncementsSection");
  const languageSelector = document.getElementById("language-selector");
  const questionsList = document.getElementById("questionsList");
  const questionForm = document.getElementById("questionForm");
  const questionStatus = document.getElementById("questionStatus");
  const questionAuthorInput = document.getElementById("questionAuthorInput");
  const questionContentInput = document.getElementById("questionContentInput");
  const announcementPanel = document.getElementById("announcementsPanel");
  const questionComposer = document.getElementById("questionComposer");
  const questionTabButton = document.getElementById("questionsTabButton");
  const studentCalendarSection = document.getElementById("studentCalendarSection");
  const studentCalendarFrame = document.getElementById("studentCalendarFrame");
  const photoComposerSection = document.getElementById("photoComposerSection");
  const photoPostForm = document.getElementById("photo-post-form");
  const photoFileInput = document.getElementById("photo-file-input");
  const photoCaptionInput = document.getElementById("photo-caption");
  const photoPostButton = document.getElementById("photo-post-button");
  const photoPostStatus = document.getElementById("photo-post-status");
  const photoFeedContainer = document.getElementById("photo-feed-container");
  const interfaceTranslationStatus = document.getElementById("interfaceTranslationStatus");
  const interfaceTextStates = new WeakMap();
  const interfaceAttributeStates = new WeakMap();
  const interfaceTranslationSkipSelector = [
    "#language-selector",
    "#studentNameHeading",
    "#schoolNameHeading",
    ".announcement-title",
    ".announcement-content",
    ".announcement-meta",
    ".qa-question",
    ".qa-answer-content",
    ".photo-post-meta"
  ].join(",");
  let interfaceTranslationRequest = 0;
  let currentQuestionsSnapshot = null;
  let currentAnnouncementsSnapshot = null;
  let currentPhotoRole = null;
  let currentPhotoPostsSnapshot = null;
  const answerUnsubscribers = new Map();
  let questionsUnsubscribe = null;

  document.getElementById("studentNameHeading").textContent = studentName;
  document.getElementById("schoolNameHeading").textContent = schoolName;
  questionAuthorInput.value = studentName;

  document.getElementById("switchSchoolBtn").addEventListener("click", () => {
    localStorage.removeItem("schoolId");
    localStorage.removeItem("schoolName");
    localStorage.removeItem("studentName");
    window.location.href = "/";
  });

  function getInterfaceTranslation(originalText, targetLang) {
    const known = lookupInterfaceTranslation(originalText, targetLang);
    if (known !== null) return Promise.resolve(known);
    const cacheKey = JSON.stringify(["interface", targetLang, originalText]);
    let translation = translationCache.get(cacheKey);
    if (!translation) {
      translation = translateWithAPI(originalText, targetLang);
      translationCache.set(cacheKey, translation);
    }
    return translation;
  }

  function shouldTranslateInterfaceNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element && !element.closest(interfaceTranslationSkipSelector));
  }

  async function translateStudentInterface() {
    const selectedLang = languageSelector.value;
    const targetLang = selectedLang === "zh" ? "zh-CN" : selectedLang;
    const requestId = interfaceTranslationRequest;
    const jobs = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      if (!/\p{L}/u.test(node.nodeValue) || !shouldTranslateInterfaceNode(node)) continue;
      const textNode = node;
      let state = interfaceTextStates.get(node);
      if (!state) {
        state = { originalText: node.nodeValue, translatedText: null, translatedLang: null, requestId: 0 };
        interfaceTextStates.set(node, state);
      } else if ((state.translatedText !== null && node.nodeValue !== state.translatedText)
        || (state.translatedText === null && node.nodeValue !== state.originalText)) {
        state.originalText = node.nodeValue;
        state.translatedText = null;
        state.translatedLang = null;
        state.requestId += 1;
      }
      if (selectedLang === "en") {
        if (state.translatedText !== null) node.nodeValue = state.originalText;
        state.translatedText = null;
        state.translatedLang = null;
        continue;
      }
      if (state.translatedLang === selectedLang && state.translatedText !== null) continue;
      const originalText = state.originalText;
      const stateRequestId = state.requestId;
      jobs.push(async () => {
        try {
          const translatedText = await getInterfaceTranslation(originalText, targetLang);
          if (interfaceTranslationRequest !== requestId
            || languageSelector.value !== selectedLang
            || interfaceTextStates.get(textNode) !== state
            || state.requestId !== stateRequestId) return;
          state.translatedText = translatedText;
          state.translatedLang = selectedLang;
          textNode.nodeValue = translatedText;
        } catch (error) {
          const cacheKey = JSON.stringify(["interface", targetLang, originalText]);
          translationCache.delete(cacheKey);
          console.error("Could not translate student board interface text:", error);
          if (interfaceTranslationRequest === requestId
            && languageSelector.value === selectedLang) {
            interfaceTranslationStatus.textContent = "Some board text could not be translated. Please try again.";
          }
        }
      });
    }

    const translatableAttributes = ["aria-label", "title", "placeholder", "alt"];
    for (const element of document.body.querySelectorAll(translatableAttributes.map((attribute) => `[${attribute}]`).join(","))) {
      if (!shouldTranslateInterfaceNode(element)) continue;
      for (const attribute of translatableAttributes) {
        const currentValue = element.getAttribute(attribute);
        if (!currentValue?.trim()) continue;
        let states = interfaceAttributeStates.get(element);
        if (!states) {
          states = new Map();
          interfaceAttributeStates.set(element, states);
        }
        let state = states.get(attribute);
        if (!state) {
          state = { originalText: currentValue, translatedText: null, translatedLang: null, requestId: 0 };
          states.set(attribute, state);
        } else if ((state.translatedText !== null && currentValue !== state.translatedText)
          || (state.translatedText === null && currentValue !== state.originalText)) {
          state.originalText = currentValue;
          state.translatedText = null;
          state.translatedLang = null;
          state.requestId += 1;
        }
        if (selectedLang === "en") {
          if (state.translatedText !== null) element.setAttribute(attribute, state.originalText);
          state.translatedText = null;
          state.translatedLang = null;
          continue;
        }
        if (state.translatedLang === selectedLang && state.translatedText !== null) continue;
        const originalText = state.originalText;
        const stateRequestId = state.requestId;
        jobs.push(async () => {
          try {
            const translatedText = await getInterfaceTranslation(originalText, targetLang);
            if (interfaceTranslationRequest !== requestId
              || languageSelector.value !== selectedLang
              || states.get(attribute) !== state
              || state.requestId !== stateRequestId) return;
            state.translatedText = translatedText;
            state.translatedLang = selectedLang;
            element.setAttribute(attribute, translatedText);
          } catch (error) {
            const cacheKey = JSON.stringify(["interface", targetLang, originalText]);
            translationCache.delete(cacheKey);
            console.error(`Could not translate student board ${attribute}:`, error);
            if (interfaceTranslationRequest === requestId
              && languageSelector.value === selectedLang) {
              interfaceTranslationStatus.textContent = "Some board text could not be translated. Please try again.";
            }
          }
        });
      }
    }

    document.documentElement.lang = targetLang;
    document.documentElement.dir = selectedLang === "ar" ? "rtl" : "ltr";
    for (let index = 0; index < jobs.length; index += 4) {
      await Promise.all(jobs.slice(index, index + 4).map((job) => job()));
    }
  }

  let interfaceMutationQueued = false;
  const interfaceObserver = new MutationObserver(() => {
    if (interfaceMutationQueued) return;
    interfaceMutationQueued = true;
    queueMicrotask(() => {
      interfaceMutationQueued = false;
      if (languageSelector.value !== "en") translateStudentInterface();
    });
  });
  interfaceObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["aria-label", "title", "placeholder", "alt"],
    characterData: true,
    childList: true,
    subtree: true
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        studentName = currentFeatures.studentEmailRequired === true
          ? await getStudentAccountAlias(db, schoolId, user.uid)
          : (localStorage.getItem("studentName") || studentName).trim();
        document.getElementById("studentNameHeading").textContent = studentName;
        questionAuthorInput.value = studentName;
      } catch (error) {
        console.error("Could not refresh the student display name:", error);
        questionStatus.textContent = "Student identity could not be verified. Reload and try again.";
        return;
      }
    }
    currentPhotoRole = null;
    photoComposerSection.hidden = true;
    if (!user) return;

    try {
      const schoolSnapshot = await getDoc(doc(db, "schools", schoolId));
      if (!schoolSnapshot.exists()) return;
      if (schoolSnapshot.data().createdBy === user.uid) {
        currentPhotoRole = "admin";
      } else {
        const officerSnapshot = await getDoc(doc(db, "schools", schoolId, "officers", user.uid));
        if (officerSnapshot.exists()) {
          const role = String(officerSnapshot.data().role || "").toLowerCase();
          if (role === "representative" || role === "officer" || role === "classofficer") {
            currentPhotoRole = role === "representative" ? "representative" : "officer";
          }
        }
      }
      if (auth.currentUser?.uid !== user.uid) return;
      photoComposerSection.hidden = !currentPhotoRole;
      if (currentPhotoPostsSnapshot) renderPhotoPosts(currentPhotoPostsSnapshot);
    } catch (error) {
      console.error("Could not verify photo posting permissions:", error);
      photoComposerSection.hidden = true;
    }
  });

  const photoPostsQuery = query(
    collection(db, "image_posts"),
    where("schoolId", "==", schoolId),
    orderBy("createdAt", "desc"),
    limit(60)
  );

  function renderPhotoPosts(snapshot) {
    currentPhotoPostsSnapshot = snapshot;
    photoFeedContainer.replaceChildren();
    if (snapshot.empty) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "No photos have been shared yet.";
      photoFeedContainer.append(emptyState);
      return;
    }

    const posts = snapshot.docs.slice().sort((first, second) => {
      const firstCreatedAt = first.data().createdAt?.toMillis?.() || 0;
      const secondCreatedAt = second.data().createdAt?.toMillis?.() || 0;
      return secondCreatedAt - firstCreatedAt;
    });
    posts.forEach((postDocument) => {
      const post = postDocument.data();
      const article = document.createElement("article");
      article.className = "photo-post-card";

      const previewButton = document.createElement("button");
      previewButton.className = "photo-preview-button";
      previewButton.type = "button";
      previewButton.setAttribute("aria-label", "Open photo in full screen");
      const image = document.createElement("img");
      image.className = "post-image";
      image.src = post.imageUrl;
      image.alt = "User upload";
      image.loading = "lazy";
      previewButton.append(image);
      previewButton.addEventListener("click", () => openPhotoPreview(post.imageUrl, post.caption || ""));
      article.append(previewButton);

      if (typeof post.caption === "string" && post.caption.trim()) {
        const caption = document.createElement("p");
        caption.className = "photo-post-caption";
        caption.textContent = post.caption;
        article.append(caption);
      }

      const metadata = document.createElement("p");
      metadata.className = "announcement-meta photo-post-meta";
      const roleBadge = document.createElement("span");
      roleBadge.className = "photo-role-badge";
      roleBadge.textContent = post.authorRole || "Member";
      const postedAt = post.createdAt?.toDate
        ? post.createdAt.toDate().toLocaleString()
        : "Just now";
      const datesHidden = schoolFeatures.hideDatesAndTimes === true;
      metadata.append(
        document.createTextNode(`${post.authorName || "School community"} · `),
        roleBadge,
        document.createTextNode(datesHidden ? "" : ` · ${postedAt}`)
      );
      article.append(metadata);

      const canDelete = currentPhotoRole === "admin";
      if (canDelete) {
        const actions = document.createElement("div");
        actions.className = "photo-post-actions";
        const deleteButton = document.createElement("button");
        deleteButton.className = "photo-delete-button";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete photo";
        const deleteStatus = document.createElement("span");
        deleteStatus.className = "photo-delete-status";
        deleteStatus.setAttribute("role", "status");
        let awaitingConfirmation = false;

        deleteButton.addEventListener("click", async () => {
          if (!awaitingConfirmation) {
            awaitingConfirmation = true;
            deleteButton.textContent = "Confirm delete";
            const cancelButton = document.createElement("button");
            cancelButton.className = "photo-cancel-delete-button";
            cancelButton.type = "button";
            cancelButton.textContent = "Cancel";
            cancelButton.addEventListener("click", () => {
              awaitingConfirmation = false;
              deleteButton.textContent = "Delete photo";
              cancelButton.remove();
            }, { once: true });
            actions.insertBefore(cancelButton, deleteStatus);
            return;
          }

          deleteButton.disabled = true;
          deleteStatus.textContent = "Deleting photo...";
          try {
            await deleteDoc(doc(db, "image_posts", postDocument.id));
          } catch (error) {
            console.error("Could not delete photo:", error);
            deleteStatus.textContent = `Photo could not be deleted: ${error.code || error.message || "Please try again."}`;
            deleteButton.disabled = false;
            awaitingConfirmation = false;
            deleteButton.textContent = "Delete photo";
            actions.querySelector(".photo-cancel-delete-button")?.remove();
          }
        });

        actions.append(deleteButton, deleteStatus);
        article.append(actions);
      }
      photoFeedContainer.append(article);
    });
  }

  onSnapshot(photoPostsQuery, renderPhotoPosts, (error) => {
    console.error("Could not load photo posts:", error);
    photoFeedContainer.textContent = `Photos could not be loaded (${error.code || "unknown error"}).`;
  });

  photoPostForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = auth.currentUser;
    const file = photoFileInput.files?.[0];
    if (!user || !currentPhotoRole || !file || !file.type.startsWith("image/")) {
      photoPostStatus.textContent = "Choose an image and sign in with an authorized school account to post.";
      return;
    }

    if (!await passesModeration([photoCaptionInput.value])) return;
    photoPostButton.disabled = true;
    photoPostStatus.textContent = "Uploading your photo...";
    try {
      const imageUrl = await uploadPhoto(file);

      await addDoc(collection(db, "image_posts"), {
        schoolId,
        imageUrl,
        caption: photoCaptionInput.value.trim(),
        authorName: currentPhotoRole === "admin" ? "School organizer" : "Class officer",
        authorRole: currentPhotoRole,
        createdAt: serverTimestamp()
      });
      photoPostForm.reset();
      photoPostStatus.textContent = "Your photo has been posted.";
    } catch (error) {
      console.error("Could not post photo:", error);
      photoPostStatus.textContent = error.code === "permission-denied"
        ? "The image was uploaded, but Firestore denied saving the post. Deploy the latest firestore.rules, then try again."
        : `Photo could not be posted: ${error.message || "Please try again."}`;
    } finally {
      photoPostButton.disabled = false;
    }
  });

  function activateTab(name) {
    document.querySelectorAll(".school-tab").forEach((button) => {
      const active = button.dataset.tab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      const active = panel.dataset.tabPanel === name;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  }

  function keepAvailableTab(announcementsEnabled, questionsEnabled) {
    const currentTab = document.querySelector(".school-tab.is-active")?.dataset.tab;
    if (currentTab === "polls" || currentTab === "documents") return;
    if (currentTab === "board" && announcementsEnabled) return;
    if (currentTab === "questions" && questionsEnabled) return;
    if (announcementsEnabled) activateTab("board");
    else if (questionsEnabled) activateTab("questions");
  }

  document.querySelectorAll(".school-tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.hidden) activateTab(button.dataset.tab);
    });
  });

  onSnapshot(doc(db, "schools", schoolId), (schoolSnapshot) => {
    if (!schoolSnapshot.exists()) {
      schoolTagline.textContent = "This school could not be found.";
      document.body.classList.remove("school-loading");
      return;
    }
    const school = schoolSnapshot.data();
    document.getElementById("schoolNameHeading").textContent = school.name || schoolName;
    const theme = school.theme && typeof school.theme === "object" ? school.theme : {};
    applySchoolTheme(theme);
    applySchoolLogo(typeof theme.logoUrl === "string" ? theme.logoUrl : "");
    schoolTagline.textContent = typeof theme.customTagline === "string" && theme.customTagline.trim()
      ? theme.customTagline.trim()
      : "Announcements and updates.";

    schoolFeatures = school.features && typeof school.features === "object" ? school.features : {};
    const calendarUrl = school.calendarEnabled === true
      ? toGoogleCalendarEmbedUrl(school.calendarUrl)
      : null;
    studentCalendarSection.hidden = !calendarUrl;
    if (calendarUrl) {
      studentCalendarFrame.src = calendarUrl;
    } else {
      studentCalendarFrame.removeAttribute("src");
    }
    const announcementsEnabled = schoolFeatures.announcementsEnabled !== false;
    const questionsEnabled = schoolFeatures.questionsEnabled !== false;
    const questionPostingEnabled = schoolFeatures.questionPostingEnabled !== false;
    const boardEnabled = announcementsEnabled || Boolean(calendarUrl);
    announcementPanel.hidden = !announcementsEnabled;
    questionTabButton.hidden = !questionsEnabled;
    questionComposer.hidden = !questionPostingEnabled;
    document.querySelector('[data-tab="board"]').hidden = !boardEnabled;
    document.querySelector('[data-tab="board"]').textContent = !announcementsEnabled && calendarUrl
      ? "Calendar"
      : "Updates";
    document.getElementById("boardTab").hidden = !boardEnabled;
    document.getElementById("questionsTab").hidden = !questionsEnabled;
    document.getElementById("featuresDisabledMessage").hidden =
      announcementsEnabled || questionsEnabled || Boolean(calendarUrl);
    keepAvailableTab(boardEnabled, questionsEnabled);
    if (questionsEnabled) {
      startQuestionsListener();
    } else {
      if (questionsUnsubscribe) questionsUnsubscribe();
      questionsUnsubscribe = null;
      for (const unsubscribe of answerUnsubscribers.values()) unsubscribe();
      answerUnsubscribers.clear();
      questionsList.textContent = "The Q&A feature is turned off.";
    }
    if (currentQuestionsSnapshot && questionsEnabled) renderQuestions(currentQuestionsSnapshot);
    if (currentAnnouncementsSnapshot) renderAnnouncements(currentAnnouncementsSnapshot);
    if (currentPhotoPostsSnapshot) renderPhotoPosts(currentPhotoPostsSnapshot);    document.body.classList.remove("school-loading");
  }, (error) => {
    console.error("Could not load school branding and settings:", error);
    schoolTagline.textContent = "Could not load school settings.";
    document.body.classList.remove("school-loading");
  });

  const announcementsQuery = query(
    collection(db, "schools", schoolId, "announcements"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  async function applyAnnouncementLanguage() {
    const selectedLang = languageSelector.value;
    const targetLang = selectedLang === "zh" ? "zh-CN" : selectedLang;
    await Promise.all(Array.from(document.querySelectorAll(
      "#announcementList .announcement-card, #pinnedAnnouncementList .announcement-card"
    ), async (article) => {
      const title = article.querySelector(".announcement-title");
      const content = article.querySelector(".announcement-content");
      const status = article.querySelector(".announcement-translation-status");
      if (!article.hasAttribute("data-original-title")) {
        article.dataset.originalTitle = title?.textContent || "";
      }
      if (!article.hasAttribute("data-original-body")) {
        article.dataset.originalBody = content?.textContent || "";
      }
      const originalTitle = article.dataset.originalTitle;
      const originalBody = article.dataset.originalBody;
      const requestId = String(Number(article.dataset.translationRequestId || 0) + 1);
      article.dataset.translationRequestId = requestId;

      if (selectedLang === "en") {
        if (title) title.textContent = originalTitle;
        content.textContent = originalBody;
        status.textContent = "";
        article.removeAttribute("aria-busy");
        return;
      }

      const cacheKey = JSON.stringify([
        article.dataset.announcementId,
        targetLang,
        originalTitle,
        originalBody
      ]);
      let translation = translationCache.get(cacheKey);
      if (!translation) {
        translation = Promise.all([
          originalTitle ? translateWithAPI(originalTitle, targetLang) : Promise.resolve(""),
          originalBody ? translateWithAPI(originalBody, targetLang) : Promise.resolve("")
        ]);
        translationCache.set(cacheKey, translation);
      }

      article.setAttribute("aria-busy", "true");
      status.textContent = "Translating&";
      try {
        const [translatedTitle, translatedBody] = await translation;
        if (article.dataset.translationRequestId !== requestId
          || languageSelector.value !== selectedLang) return;
        if (title) title.textContent = translatedTitle;
        content.textContent = translatedBody;
        status.textContent = "";
      } catch (error) {
        if (translationCache.get(cacheKey) === translation) {
          translationCache.delete(cacheKey);
        }
        console.error(`Could not translate announcement ${article.dataset.announcementId}:`, error);
        if (article.dataset.translationRequestId === requestId
          && languageSelector.value === selectedLang) {
          status.textContent = "Translation unavailable. Please try again.";
        }
      } finally {
        if (article.dataset.translationRequestId === requestId) {
          article.removeAttribute("aria-busy");
        }
      }
    }));
  }

  async function translateQaText(element, targetLang) {
    const selectedLang = languageSelector.value;
    if (!element.hasAttribute("data-original-text")) {
      element.dataset.originalText = element.textContent || "";
    }
    const originalText = element.dataset.originalText;
    const status = element.nextElementSibling;
    const requestId = String(Number(element.dataset.translationRequestId || 0) + 1);
    element.dataset.translationRequestId = requestId;
    if (targetLang === "en") {
      element.textContent = originalText;
      if (status?.classList.contains("translation-status")) status.textContent = "";
      element.removeAttribute("aria-busy");
      return;
    }

    const cacheKey = JSON.stringify([
      "qa",
      element.dataset.translationId,
      targetLang,
      originalText
    ]);
    let translation = translationCache.get(cacheKey);
    if (!translation) {
      translation = translateWithAPI(originalText, targetLang);
      translationCache.set(cacheKey, translation);
    }

    element.setAttribute("aria-busy", "true");
    if (status?.classList.contains("translation-status")) {
      status.textContent = "Translating&";
    }
    try {
      const translatedText = await translation;
      if (element.dataset.translationRequestId !== requestId
        || languageSelector.value !== selectedLang) return;
      element.textContent = translatedText;
      if (status?.classList.contains("translation-status")) status.textContent = "";
    } catch (error) {
      if (translationCache.get(cacheKey) === translation) {
        translationCache.delete(cacheKey);
      }
      console.error(`Could not translate Q&A text ${element.dataset.translationId}:`, error);
      if (element.dataset.translationRequestId === requestId
        && languageSelector.value === selectedLang
        && status?.classList.contains("translation-status")) {
        status.textContent = "Translation unavailable. Please try again.";
      }
    } finally {
      if (element.dataset.translationRequestId === requestId) {
        element.removeAttribute("aria-busy");
      }
    }
  }

  async function applyQuestionLanguage() {
    const targetLang = languageSelector.value === "zh" ? "zh-CN" : languageSelector.value;
    await Promise.all(Array.from(
      questionsList.querySelectorAll(".qa-question, .qa-answer-content"),
      (element) => translateQaText(element, languageSelector.value === "en" ? "en" : targetLang)
    ));
  }

  async function applyBoardLanguage() {
    await Promise.all([applyAnnouncementLanguage(), applyQuestionLanguage()]);
  }

  languageSelector.addEventListener("change", () => {
    interfaceTranslationRequest += 1;
    interfaceTranslationStatus.textContent = "";
    Promise.all([applyBoardLanguage(), translateStudentInterface()]);
  });
  translateStudentInterface();

  function createAnnouncementCard(announcementDoc) {
    const announcement = announcementDoc.data();
    const article = document.createElement("article");
    article.className = "announcement-card";
    if (announcement.sticky === true) article.classList.add("is-sticky");
    article.dataset.announcementId = announcementDoc.id;
    const titleText = typeof announcement.title === "string" && announcement.title.trim()
      ? announcement.title
      : "Announcement";
    const contentText = typeof announcement.content === "string" ? announcement.content : "";
    article.dataset.originalTitle = titleText;
    article.dataset.originalBody = contentText;
    if (announcement.sticky === true) {
      const stickyBadge = document.createElement("span");
      stickyBadge.className = "announcement-sticky-badge";
      stickyBadge.textContent = "Pinned";
      article.append(stickyBadge);
    }
    const title = document.createElement("h3");
    title.className = "announcement-title";
    title.textContent = titleText;
    const message = document.createElement("p");
    message.className = "announcement-content";
    message.textContent = contentText;
    const translationStatus = document.createElement("span");
    translationStatus.className = "announcement-translation-status";
    translationStatus.setAttribute("role", "status");
    translationStatus.setAttribute("aria-live", "polite");
    const details = document.createElement("p");
    details.className = "announcement-meta";
    const postedAt = announcement.createdAt?.toDate
      ? announcement.createdAt.toDate().toLocaleString()
      : "Just now";
    details.textContent = schoolFeatures.hideDatesAndTimes === true
      ? (announcement.authorName || "School organizer")
      : `${announcement.authorName || "School organizer"} · ${postedAt}`;
    article.append(title, message, translationStatus, details);
    return article;
  }

  function renderAnnouncements(snapshot) {
    currentAnnouncementsSnapshot = snapshot;
    pinnedAnnouncementList.replaceChildren();
    announcementList.replaceChildren();
    if (snapshot.empty) {
      pinnedAnnouncementsSection.hidden = true;
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "There are no announcements yet. Check back soon.";
      announcementList.append(emptyState);
      return;
    }

    const announcements = snapshot.docs.slice().sort((first, second) => {
      const firstAnnouncement = first.data();
      const secondAnnouncement = second.data();
      if (Boolean(firstAnnouncement.sticky) !== Boolean(secondAnnouncement.sticky)) {
        return firstAnnouncement.sticky ? -1 : 1;
      }
      const firstCreatedAt = firstAnnouncement.createdAt?.toMillis?.() || 0;
      const secondCreatedAt = secondAnnouncement.createdAt?.toMillis?.() || 0;
      return secondCreatedAt - firstCreatedAt;
    });

    const pinnedAnnouncements = announcements.filter((announcementDoc) =>
      announcementDoc.data().sticky === true
    );
    const regularAnnouncements = announcements.filter((announcementDoc) =>
      announcementDoc.data().sticky !== true
    );
    pinnedAnnouncementsSection.hidden = pinnedAnnouncements.length === 0
      || schoolFeatures.announcementsEnabled === false;
    pinnedAnnouncements.forEach((announcementDoc) => {
      pinnedAnnouncementList.append(createAnnouncementCard(announcementDoc));
    });

    if (regularAnnouncements.length === 0) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = pinnedAnnouncements.length
        ? "No other announcements right now."
        : "There are no announcements yet. Check back soon.";
      announcementList.append(emptyState);
    } else {
      regularAnnouncements.forEach((announcementDoc) => {
        announcementList.append(createAnnouncementCard(announcementDoc));
      });
    }

    if (languageSelector.value !== "en") {
      applyAnnouncementLanguage();
    }
  }

  onSnapshot(announcementsQuery, (snapshot) => {
    renderAnnouncements(snapshot);
  }, (error) => {
    console.error("Could not load announcements:", error);
    announcementList.textContent = "Announcements could not be loaded. Check Firebase access and try again.";
  });

  function renderQuestions(snapshot) {
    currentQuestionsSnapshot = snapshot;
    for (const unsubscribe of answerUnsubscribers.values()) unsubscribe();
    answerUnsubscribers.clear();
    questionsList.replaceChildren();
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No questions yet. Start the conversation.";
      questionsList.append(empty);
      return;
    }

    snapshot.forEach((questionDoc) => {
      const question = questionDoc.data();
      const card = document.createElement("article");
      card.className = "qa-card";
      const content = document.createElement("p");
      content.className = "qa-question";
      content.textContent = question.content || "";
      content.dataset.translationId = `question-${questionDoc.id}`;
      content.dataset.originalText = question.content || "";
      const questionTranslationStatus = document.createElement("span");
      questionTranslationStatus.className = "translation-status";
      questionTranslationStatus.setAttribute("role", "status");
      questionTranslationStatus.setAttribute("aria-live", "polite");
      const author = document.createElement("p");
      author.className = "announcement-meta";
      author.textContent = schoolFeatures.hideDatesAndTimes === true
        ? (question.authorName || "Student")
        : `${question.authorName || "Student"} · ${question.createdAt?.toDate ? question.createdAt.toDate().toLocaleString() : "Just now"}`;
      const answers = document.createElement("div");
      answers.className = "qa-answers";
      card.append(content, questionTranslationStatus, author, answers);

      if (schoolFeatures.anyoneCanAnswerQuestions === true) {
        const answerForm = document.createElement("form");
        answerForm.className = "qa-answer-form";
        const answerInput = document.createElement("textarea");
        answerInput.rows = 2;
        answerInput.maxLength = 1200;
        answerInput.required = true;
        answerInput.placeholder = "Share an answer...";
        answerInput.setAttribute("aria-label", "Answer this question");
        const answerInputWrap = document.createElement("div");
        answerInputWrap.className = "qa-answer-input-wrap";
        answerInputWrap.append(answerInput);
        const answerButton = document.createElement("button");
        answerButton.type = "submit";
        answerButton.className = "qa-answer-submit";
        answerButton.setAttribute("aria-label", "Post answer");
        answerButton.title = "Post answer";
        answerButton.disabled = true;
        answerButton.hidden = true;
        answerButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
          </svg>
        `;
        answerInputWrap.append(answerButton);
        answerForm.append(answerInputWrap);
        answerInput.addEventListener("input", () => {
          const hasAnswer = Boolean(answerInput.value.trim());
          answerButton.hidden = !hasAnswer;
          answerButton.disabled = !hasAnswer;
        });
        answerForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!answerInput.value.trim()) {
            trackActivityResult("post_answer", "failure");
            return;
          }
          answerButton.disabled = true;
          if (!await passesModeration([answerInput.value])) {
            answerButton.disabled = false;
            return;
          }
          try {
            await addDoc(collection(db, "schools", schoolId, "questions", questionDoc.id, "answers"), {
              content: answerInput.value.trim(),
              authorName: studentName,
              createdAt: serverTimestamp()
            });
            trackActivityResult("post_answer", "success");
            answerForm.reset();
            answerButton.hidden = true;
          } catch (error) {
            trackActivityResult("post_answer", "failure");
            console.error("Could not post answer:", error);
            questionStatus.textContent = `Answer could not be posted (${error.code || "unknown"}).`;
          } finally {
            answerButton.disabled = false;
          }
        });
        card.append(answerForm);
      }
      questionsList.append(card);

      const answersQuery = query(
        collection(db, "schools", schoolId, "questions", questionDoc.id, "answers"),
        orderBy("createdAt", "asc")
      );
      const unsubscribe = onSnapshot(answersQuery, (answerSnapshot) => {
        answers.replaceChildren();
        answerSnapshot.forEach((answerDoc) => {
          const answer = answerDoc.data();
          const item = document.createElement("p");
          item.className = "qa-answer";
          const answerAuthor = document.createElement("span");
          answerAuthor.className = "qa-answer-author";
          answerAuthor.textContent = `${answer.authorName || "School community"}: `;
          const answerContent = document.createElement("span");
          answerContent.className = "qa-answer-content";
          answerContent.textContent = answer.content || "";
          answerContent.dataset.translationId = `answer-${answerDoc.id}`;
          answerContent.dataset.originalText = answer.content || "";
          const answerTranslationStatus = document.createElement("span");
          answerTranslationStatus.className = "translation-status";
          answerTranslationStatus.setAttribute("role", "status");
          answerTranslationStatus.setAttribute("aria-live", "polite");
          item.append(answerAuthor, answerContent, answerTranslationStatus);
          const currentUser = auth.currentUser;
          if (currentPhotoRole === "admin"
            || currentPhotoRole === "officer"
            || (schoolFeatures.studentEmailRequired === true
              && currentUser
              && answer.authorName === studentName)) {
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "qa-answer-delete-button";
            deleteButton.textContent = "Delete reply";
            deleteButton.addEventListener("click", async () => {
              deleteButton.disabled = true;
              try {
                await deleteDoc(doc(db, "schools", schoolId, "questions", questionDoc.id, "answers", answerDoc.id));
              } catch (error) {
                console.error("Could not delete reply:", error);
                questionStatus.textContent = `Reply could not be deleted (${error.code || "unknown"}).`;
                deleteButton.disabled = false;
              }
            });
            item.append(deleteButton);
          }
          answers.append(item);
        });
        if (languageSelector.value !== "en") applyQuestionLanguage();
      }, (error) => {
        console.error("Could not load answers:", error);
        answers.textContent = "Answers could not be loaded.";
      });
      answerUnsubscribers.set(questionDoc.id, unsubscribe);
    });
    if (languageSelector.value !== "en") applyQuestionLanguage();
  }

  function startQuestionsListener() {
    if (questionsUnsubscribe) return;
    const questionsQuery = query(
      collection(db, "schools", schoolId, "questions"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    questionsUnsubscribe = onSnapshot(questionsQuery, renderQuestions, (error) => {
      console.error("Could not load questions:", error);
      questionsList.textContent = "Questions could not be loaded. Check Firebase access and try again.";
    });
  }

  questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const authorName = studentName;
    const content = questionContentInput.value.trim();
    if (!authorName || !content || schoolFeatures.questionPostingEnabled === false || schoolFeatures.questionsEnabled === false) {
      trackActivityResult("post_question", "failure");
      questionStatus.textContent = "Question posting is currently unavailable.";
      return;
    }
    const button = document.getElementById("askQuestionBtn");
    button.disabled = true;
    questionStatus.textContent = "Checking...";
    if (!await passesModeration([content])) {
      questionStatus.textContent = "";
      button.disabled = false;
      return;
    }
    questionStatus.textContent = "Posting question...";
    try {
      await addDoc(collection(db, "schools", schoolId, "questions"), {
        content,
        authorName,
        createdAt: serverTimestamp()
      });
      trackActivityResult("post_question", "success");
      questionForm.reset();
      questionAuthorInput.value = authorName;
      questionStatus.textContent = "Your question has been posted.";
      questionComposer.open = false;
    } catch (error) {
      trackActivityResult("post_question", "failure");
      console.error("Could not post question:", error);
      questionStatus.textContent = `Question could not be posted (${error.code || "unknown"}).`;
    } finally {
      button.disabled = false;
    }
  });
}

