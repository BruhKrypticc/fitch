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
  where,
  getDocs,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { trackActivityResult } from "./activity-tracker.js";
import { showModal } from "./modal.js";
import { passesModeration } from "./moderation.js";
import { applySchoolLogo, applySchoolTheme } from "./school-theme.js";
import { toGoogleCalendarEmbedUrl } from "./calendar.js";
import { openPhotoPreview, uploadPhoto } from "./photo-utils.js";
import { initFinchAdmin } from "./finch-admin.js";
import { mountFinchGaps } from "./finch-gaps.js";
import { parentLink } from "./languages.js";
import { initAdminExtras } from "./admin-extras.js";
import { downloadOnboardingGuide, openOnboardingGuide } from "./onboarding.js";

const schoolId = localStorage.getItem("schoolId");
const schoolName = localStorage.getItem("schoolName");

if (!schoolId || !schoolName) {
  window.location.replace("/");
} else {
  const schoolNameHeading = document.getElementById("schoolNameHeading");
  const schoolTagline = document.getElementById("schoolTagline");
  const joinCode = document.getElementById("joinCode");
  const form = document.getElementById("announcementForm");
  const contentInput = document.getElementById("announcementContent");
  const announcementTitleInput = document.getElementById("announcementTitleInput");
  const postButton = document.getElementById("postAnnouncementBtn");
  const status = document.getElementById("adminStatus");
  const list = document.getElementById("announcementList");
  const logoutButton = document.getElementById("logoutBtn");
  const settingsForm = document.getElementById("schoolSettingsForm");
  const schoolNameInput = document.getElementById("schoolNameSettingInput");
  const primaryColorInput = document.getElementById("primaryColorInput");
  const fontFamilyInput = document.getElementById("fontFamilyInput");
  const schoolLogoInput = document.getElementById("schoolLogoInput");
  const schoolLogoPreview = document.getElementById("schoolLogoPreview");
  const removeSchoolLogoBtn = document.getElementById("removeSchoolLogoBtn");
  const customTaglineInput = document.getElementById("customTaglineInput");
  const announcementsEnabledInput = document.getElementById("announcementsEnabledInput");
  const questionsEnabledInput = document.getElementById("questionsEnabledInput");
  const questionPostingEnabledInput = document.getElementById("questionPostingEnabledInput");
  const hideDatesInput = document.getElementById("hideDatesInput");
  const anyoneCanAnswerInput = document.getElementById("anyoneCanAnswerInput");
  const studentEmailRequiredInput = document.getElementById("studentEmailRequiredInput");
  const studentEmailDomainGroup = document.getElementById("studentEmailDomainGroup");
  const studentEmailDomainInput = document.getElementById("studentEmailDomainInput");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const settingsStatus = document.getElementById("settingsStatus");
  const schoolSettingsPanel = document.getElementById("schoolSettingsPanel");
  const settingsTabButton = document.getElementById("settingsTabButton");
  const calendarSettingsCard = document.getElementById("calendarSettingsCard");
  const calendarSettingsForm = document.getElementById("calendarSettingsForm");
  const calendarUrlInput = document.getElementById("calendarUrlInput");
  const calendarEnabledInput = document.getElementById("calendarEnabledInput");
  const calendarSettingsStatus = document.getElementById("calendarSettingsStatus");
  const saveCalendarSettingsBtn = document.getElementById("saveCalendarSettingsBtn");
  const calendarHelpButton = document.getElementById("calendarHelpButton");
  const questionForm = document.getElementById("questionForm");
  const questionAuthorInput = document.getElementById("questionAuthorInput");
  const questionContentInput = document.getElementById("questionContentInput");
  const questionStatus = document.getElementById("questionStatus");
  const questionsList = document.getElementById("questionsList");
  const questionTabButton = document.querySelector('[data-tab="questions"]');
  const questionListeners = new Map();
  const officerManagementPanel = document.getElementById("officerManagementPanel");
  const officerInviteForm = document.getElementById("officerInviteForm");
  const officerEmailInput = document.getElementById("officerEmailInput");
  const sendOfficerInviteBtn = document.getElementById("sendOfficerInviteBtn");
  const officerInviteStatus = document.getElementById("officerInviteStatus");
  const pendingOfficersList = document.getElementById("pendingOfficersList");
  const schoolOfficersList = document.getElementById("schoolOfficersList");
  const photoComposerSection = document.getElementById("photoComposerSection");
  const photoPostForm = document.getElementById("photo-post-form");
  const photoFileInput = document.getElementById("photo-file-input");
  const photoCaptionInput = document.getElementById("photo-caption");
  const photoPostButton = document.getElementById("photo-post-button");
  const photoPostStatus = document.getElementById("photo-post-status");
  const photoFeedContainer = document.getElementById("photo-feed-container");
  const announcementComposerPanel = document.getElementById("announcementComposerPanel");
  const announcementListPanel = document.getElementById("announcementList").parentElement;
  const announcementsDisabledNotice = document.getElementById("announcementsDisabledNotice");
  let signedInUser = null;
  let settingsDirty = false;
  let calendarSettingsDirty = false;
  let schoolLogoUrl = "";
  let schoolLogoPreviewObjectUrl = null;
  let schoolOwnerUid = null;
  let schoolLoaded = false;
  let authReady = false;
  let isOrganizer = false;
  let finchAdminStarted = false;
  let extrasStarted = false;
  let isOfficer = false;
  let currentFeatures = {};
  let currentQuestionsSnapshot = null;
  let currentAnnouncementSnapshot = null;
  let announcementsExpanded = false;
  let currentPhotoPostsSnapshot = null;
  let unsubscribeQuestions = null;
  let officerListenersStarted = false;
  let photoRole = null;

  for (const input of [calendarUrlInput, calendarEnabledInput]) {
    input.addEventListener("input", () => {
      calendarSettingsDirty = true;
    });
    input.addEventListener("change", () => {
      calendarSettingsDirty = true;
    });
  }

  calendarHelpButton.addEventListener("click", () => {
    void showModal(
      "Find your Google Calendar embed URL",
      "1. Open Google Calendar on a computer using your school or club account.\n\n2. Click the Settings gear, then select Settings for your calendar.\n\n3. Under “Access permissions for events,” check “Make available to public.”\n\n4. Scroll to “Integrate calendar” and copy the Embed code or Calendar ID. Paste it here."
    );
  });

  for (const input of [schoolNameInput, primaryColorInput, fontFamilyInput, customTaglineInput,
    announcementsEnabledInput, questionsEnabledInput, questionPostingEnabledInput, anyoneCanAnswerInput,
    studentEmailRequiredInput, studentEmailDomainInput, hideDatesInput]) {
    input.addEventListener("input", () => {
      settingsDirty = true;
    });
    input.addEventListener("change", () => {
      settingsDirty = true;
    });
  }

  studentEmailRequiredInput.addEventListener("change", () => {
    studentEmailDomainGroup.hidden = !studentEmailRequiredInput.checked;
  });

  primaryColorInput.addEventListener("input", () => {
    applySchoolTheme({
      primaryColor: primaryColorInput.value,
      fontFamily: fontFamilyInput.value
    });
  });

  schoolLogoInput.addEventListener("change", () => {
    const file = schoolLogoInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      schoolLogoInput.value = "";
      settingsStatus.textContent = "Choose an image file for the school logo.";
      return;
    }
    if (schoolLogoPreviewObjectUrl) URL.revokeObjectURL(schoolLogoPreviewObjectUrl);
    schoolLogoPreviewObjectUrl = URL.createObjectURL(file);
    updateSchoolLogoPreview(schoolLogoPreviewObjectUrl);
    settingsDirty = true;
    settingsStatus.textContent = "";
  });

  removeSchoolLogoBtn.addEventListener("click", () => {
    schoolLogoInput.value = "";
    schoolLogoUrl = "";
    if (schoolLogoPreviewObjectUrl) {
      URL.revokeObjectURL(schoolLogoPreviewObjectUrl);
      schoolLogoPreviewObjectUrl = null;
    }
    updateSchoolLogoPreview("");
    settingsDirty = true;
    settingsStatus.textContent = "";
  });

  function updateSchoolLogoPreview(url) {
    schoolLogoPreview.hidden = !url;
    if (url) schoolLogoPreview.src = url;
    else schoolLogoPreview.removeAttribute("src");
    removeSchoolLogoBtn.hidden = !url;
    applySchoolLogo(url);
  }

  onAuthStateChanged(auth, (user) => {
    signedInUser = user;
    authReady = true;
    if (schoolLoaded) void verifySchoolAccess();
  });

  document.getElementById("parentLinkCopy")?.addEventListener("click", async (event) => {
    const input = document.getElementById("parentLinkInput");
    try {
      await navigator.clipboard.writeText(input.value);
      event.target.textContent = "Copied";
    } catch {
      input.select();
    }
    setTimeout(() => { event.target.textContent = "Copy link"; }, 1500);
  });

  function configureOfficerManagement() {
    officerManagementPanel.hidden = !isOrganizer;
    schoolSettingsPanel.hidden = !isOrganizer;
    calendarSettingsCard.hidden = !isOrganizer;
    settingsTabButton.hidden = !isOrganizer;
    if (isOrganizer && !finchAdminStarted) {
      finchAdminStarted = true;
      initFinchAdmin(schoolId);
      mountFinchGaps(document.getElementById("finchGapsRoot"), { schoolId, isOwner: true });
    }
    if (isOrganizer && !officerListenersStarted) {
      officerListenersStarted = true;
      listenForOfficerChanges();
    }
  }

  function updateAnnouncementManagementVisibility() {
    document.querySelector('[data-tab="board"]').hidden = false;
    document.getElementById("boardTab").hidden = false;
    announcementComposerPanel.hidden = false;
    announcementListPanel.hidden = false;
    announcementsDisabledNotice.hidden = currentFeatures.announcementsEnabled !== false;
  }

  async function verifySchoolAccess() {
    if (!signedInUser) {
      window.location.replace("/");
      return;
    }
    isOrganizer = signedInUser.uid === schoolOwnerUid;
    isOfficer = false;
    if (!isOrganizer) {
      try {
        isOfficer = (await getDoc(doc(db, "schools", schoolId, "officers", signedInUser.uid))).exists();
      } catch (error) {
        console.error("Could not verify school role:", error);
      }
    }
    if (!isOrganizer && !isOfficer) {
      window.location.replace("/");
      return;
    }
    questionAuthorInput.value = isOfficer ? "Class officer" : "School organizer";
    photoRole = isOrganizer ? "admin" : "officer";
    photoComposerSection.hidden = false;
    updateAnnouncementManagementVisibility();
    if (!extrasStarted) {
      extrasStarted = true;
      initAdminExtras({ schoolId, user: signedInUser, isOrganizer });
    }
    configureOfficerManagement();
    if (currentPhotoPostsSnapshot) renderPhotoPosts(currentPhotoPostsSnapshot);
    if (currentAnnouncementSnapshot) renderAnnouncements(currentAnnouncementSnapshot);
    if (currentFeatures.announcementsEnabled === false) activateTab("board");
    document.getElementById("featuresDisabledMessage").hidden =
      currentFeatures.announcementsEnabled !== false || currentFeatures.questionsEnabled !== false || isOrganizer;
    if (currentQuestionsSnapshot) renderQuestions(currentQuestionsSnapshot);
    document.body.classList.remove("school-loading");
  }

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
      const datesHidden = currentFeatures.hideDatesAndTimes === true;
      metadata.append(
        document.createTextNode(`${post.authorName || "School community"} · `),
        roleBadge,
        document.createTextNode(datesHidden ? "" : ` · ${postedAt}`)
      );
      article.append(metadata);

      const canDelete = isOrganizer;
      if (canDelete) {
        const actions = document.createElement("div");
        actions.className = "photo-post-actions";
        const deleteButton = document.createElement("button");
        deleteButton.className = "photo-delete-button";
        deleteButton.type = "button";
        deleteButton.title = "Delete photo";
        deleteButton.setAttribute("aria-label", "Delete photo");
        deleteButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M4 7h16"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="m5 7 1 13h12l1-13M9 7V4h6v3"></path>
          </svg>
        `;
        const deleteStatus = document.createElement("span");
        deleteStatus.className = "photo-delete-status";
        deleteStatus.setAttribute("role", "status");
        let awaitingConfirmation = false;

        deleteButton.addEventListener("click", async () => {
          if (!awaitingConfirmation) {
            awaitingConfirmation = true;
            deleteButton.title = "Confirm delete photo";
            deleteButton.setAttribute("aria-label", "Confirm delete photo");
            const cancelButton = document.createElement("button");
            cancelButton.className = "photo-cancel-delete-button";
            cancelButton.type = "button";
            cancelButton.textContent = "Cancel";
            cancelButton.addEventListener("click", () => {
              awaitingConfirmation = false;
              deleteButton.title = "Delete photo";
              deleteButton.setAttribute("aria-label", "Delete photo");
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
            deleteButton.title = "Delete photo";
            deleteButton.setAttribute("aria-label", "Delete photo");
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
    if (!user || !photoRole || !file || !file.type.startsWith("image/")) {
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
        authorName: photoRole === "admin" ? "School organizer" : "Class officer",
        authorRole: photoRole,
        createdAt: serverTimestamp()
      });
      trackActivityResult("post_photo", "success");
      photoPostForm.reset();
      photoPostStatus.textContent = "Your photo has been posted.";
    } catch (error) {
      trackActivityResult("post_photo", "failure");
      console.error("Could not post photo:", error);
      photoPostStatus.textContent = error.code === "permission-denied"
        ? "The image was uploaded, but Firestore denied saving the post. Deploy the latest firestore.rules, then try again."
        : `Photo could not be posted: ${error.message || "Please try again."}`;
    } finally {
      photoPostButton.disabled = false;
    }
  });

  function activateTab(name) {
    document.querySelectorAll("[data-tab]").forEach((button) => {
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

  function keepAvailableTab(questionsEnabled) {
    const currentTab = document.querySelector(".school-tab.is-active")?.dataset.tab;
    if (currentTab === "settings" && isOrganizer) return;
    if (currentTab === "board") return;
    if (currentTab === "questions" && questionsEnabled) return;
    activateTab("board");
  }

  document.querySelectorAll(".school-tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.hidden) activateTab(button.dataset.tab);
    });
  });

  function renderOfficerRows(container, documents, kind) {
    container.replaceChildren();
    if (documents.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-state";
      emptyMessage.textContent = kind === "pending"
        ? "No pending invitations."
        : "No class officers added yet.";
      container.append(emptyMessage);
      return;
    }

    documents.forEach((entry) => {
      const data = entry.data();
      const row = document.createElement("div");
      row.className = "officer-row";
      const identity = document.createElement("span");
      identity.className = "officer-email";
      identity.textContent = kind === "pending"
        ? data.email
        : `${data.displayName || data.email} · ${data.email}`;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "officer-remove-button";
      removeButton.textContent = kind === "pending" ? "Cancel" : "Remove";
      removeButton.addEventListener("click", () => revokeOfficer(entry.id, data, kind));
      row.append(identity, removeButton);
      container.append(row);
    });
  }

  function listenForOfficerChanges() {
    const invitationsQuery = query(
      collection(db, "officerInvitations"),
      where("schoolId", "==", schoolId)
    );
    onSnapshot(invitationsQuery, (snapshot) => {
      renderOfficerRows(
        pendingOfficersList,
        snapshot.docs.filter((entry) => entry.data().status === "pending"),
        "pending"
      );
    }, (error) => {
      console.error("Could not load officer invitations:", error);
      pendingOfficersList.textContent = "Could not load pending invitations.";
    });

    onSnapshot(collection(db, "schools", schoolId, "officers"), (snapshot) => {
      renderOfficerRows(schoolOfficersList, snapshot, "officer");
    }, (error) => {
      console.error("Could not load class officers:", error);
      schoolOfficersList.textContent = "Could not load class officers.";
    });
  }

  officerInviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!signedInUser || signedInUser.uid !== schoolOwnerUid) {
      await showModal("Organizer access required", "Only the school organizer can invite or remove class officers.");
      return;
    }

    const email = officerEmailInput.value.trim().toLowerCase();
    if (!email || !officerEmailInput.validity.valid) {
      await showModal("Check the email", "Enter a valid email address for the invitee’s Google account.");
      return;
    }

    sendOfficerInviteBtn.disabled = true;
    officerInviteStatus.textContent = "Creating invitation...";
    try {
      const existingOfficerQuery = query(
        collection(db, "schools", schoolId, "officers"),
        where("email", "==", email)
      );
      const existingInviteQuery = query(
        collection(db, "officerInvitations"),
        where("schoolId", "==", schoolId)
      );
      const [existingOfficers, existingInvites] = await Promise.all([
        getDocs(existingOfficerQuery),
        getDocs(existingInviteQuery)
      ]);
      const hasPendingInvite = existingInvites.docs.some((invite) =>
        invite.data().email === email && invite.data().status === "pending"
      );
      if (!existingOfficers.empty || hasPendingInvite) {
        officerInviteStatus.textContent = "";
        await showModal("Already invited", "That email already belongs to an officer or has a pending invitation.");
        return;
      }

      await addDoc(collection(db, "officerInvitations"), {
        schoolId,
        email,
        invitedBy: signedInUser.uid,
        status: "pending",
        createdAt: serverTimestamp()
      });
      officerInviteForm.reset();
      officerInviteStatus.textContent = "Invitation created. Ask them to sign in to Fitch with this Google email.";
    } catch (error) {
      console.error("Could not create officer invitation:", error);
      officerInviteStatus.textContent = "";
      await showModal(
        "Could not create invitation",
        `Firebase error (${error.code || "unknown"}): ${error.message || "Check your permissions and try again."}`
      );
    } finally {
      sendOfficerInviteBtn.disabled = false;
    }
  });

  async function revokeOfficer(entryId, data, kind) {
    if (!signedInUser || signedInUser.uid !== schoolOwnerUid) return;
    const batch = writeBatch(db);
    if (kind === "pending") {
      batch.update(doc(db, "officerInvitations", entryId), { status: "revoked" });
    } else {
      batch.delete(doc(db, "schools", schoolId, "officers", entryId));
      if (data.inviteId) {
        batch.update(doc(db, "officerInvitations", data.inviteId), { status: "revoked" });
      }
    }

    try {
      await batch.commit();
      officerInviteStatus.textContent = kind === "pending"
        ? "Invitation canceled."
        : "Class officer removed.";
    } catch (error) {
      console.error("Could not remove officer access:", error);
      await showModal(
        "Could not update officer access",
        `Firebase error (${error.code || "unknown"}): ${error.message || "Try again."}`
      );
    }
  }

  function renderAnnouncements(snapshot) {
    currentAnnouncementSnapshot = snapshot;
    list.replaceChildren();
    if (snapshot.empty) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "No announcements yet. Your first post will appear here.";
      list.append(emptyState);
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

    announcements.forEach((announcementDoc, index) => {
      const announcement = announcementDoc.data();
      const article = document.createElement("article");
      article.className = "announcement-card";
      article.hidden = !announcementsExpanded && index >= 3;
      if (announcement.sticky === true) article.classList.add("is-sticky");
      if (announcement.sticky === true) {
        const stickyBadge = document.createElement("span");
        stickyBadge.className = "announcement-sticky-badge";
        stickyBadge.textContent = "Pinned";
        article.append(stickyBadge);
      }
      const title = document.createElement("h3");
      title.className = "announcement-title";
      title.textContent = typeof announcement.title === "string" && announcement.title.trim()
        ? announcement.title
        : "Announcement";
      const message = document.createElement("p");
      message.className = "announcement-content";
      message.textContent = announcement.content || "";
      const details = document.createElement("p");
      details.className = "announcement-meta";
      const postedAt = announcement.createdAt?.toDate
        ? announcement.createdAt.toDate().toLocaleString()
        : "Just now";
      details.textContent = currentFeatures.hideDatesAndTimes === true
        ? (announcement.authorName || "School organizer")
        : `${announcement.authorName || "School organizer"} · ${postedAt}`;
      article.append(title, message, details);
      if (isOrganizer) {
        const actions = document.createElement("div");
        actions.className = "announcement-actions";
        const stickyButton = document.createElement("button");
        stickyButton.type = "button";
        stickyButton.className = "announcement-sticky-toggle";
        const pinAction = announcement.sticky === true ? "Unpin announcement" : "Pin announcement";
        stickyButton.setAttribute("aria-label", pinAction);
        stickyButton.title = pinAction;
        stickyButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M8 4h8l-1.5 5 2.5 2v1H7v-1l2.5-2L8 4Z"></path>
            <path d="M12 12v8"></path>
          </svg>
        `;
        stickyButton.addEventListener("click", async () => {
          stickyButton.disabled = true;
          try {
            await updateDoc(doc(db, "schools", schoolId, "announcements", announcementDoc.id), {
              sticky: announcement.sticky !== true
            });
          } catch (error) {
            console.error("Could not update pinned announcement:", error);
            await showModal("Could not update announcement", `Firebase error (${error.code || "unknown"}): ${error.message || "Try again."}`);
          } finally {
            stickyButton.disabled = false;
          }
        });
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "announcement-remove-button";
        removeButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M4 7h16"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="m5 7 1 13h12l1-13M9 7V4h6v3"></path>
          </svg>
        `;
        removeButton.title = "Delete announcement";
        removeButton.setAttribute("aria-label", "Delete this announcement");
        removeButton.addEventListener("click", async () => {
          try {
            await deleteDoc(doc(db, "schools", schoolId, "announcements", announcementDoc.id));
          } catch (error) {
            console.error("Could not remove announcement:", error);
            await showModal("Could not remove announcement", `Firebase error (${error.code || "unknown"}): ${error.message || "Try again."}`);
          }
        });
        actions.append(stickyButton, removeButton);
        article.append(actions);
      }
      list.append(article);
    });

    if (announcements.length > 3) {
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "admin-announcements-toggle";
      toggleButton.setAttribute("aria-expanded", String(announcementsExpanded));
      toggleButton.innerHTML = `
        <span>${announcementsExpanded ? "Show fewer" : `Show all ${announcements.length} announcements`}</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="${announcementsExpanded ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"}"></path>
        </svg>
      `;
      toggleButton.addEventListener("click", () => {
        announcementsExpanded = !announcementsExpanded;
        renderAnnouncements(snapshot);
        list.querySelector(".admin-announcements-toggle")?.focus();
      });
      list.append(toggleButton);
    }
  }

  const announcementsQuery = query(
    collection(db, "schools", schoolId, "announcements"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  let receivedServerSnapshot = false;
  const connectionTimeout = window.setTimeout(() => {
    if (!receivedServerSnapshot && !list.querySelector(".announcement-card")) {
      const connectionMessage = document.createElement("p");
      connectionMessage.className = "empty-state";
      connectionMessage.textContent = "Could not connect to announcements. Confirm the Firestore database exists and its rules are deployed.";
      list.replaceChildren(connectionMessage);
    }
  }, 10000);

  onSnapshot(announcementsQuery, (snapshot) => {
    if (snapshot.metadata.fromCache && snapshot.empty) {
      const connectionMessage = document.createElement("p");
      connectionMessage.className = "empty-state";
      connectionMessage.textContent = "Connecting to announcements...";
      list.replaceChildren(connectionMessage);
      return;
    }
    if (!snapshot.metadata.fromCache) {
      receivedServerSnapshot = true;
      window.clearTimeout(connectionTimeout);
    }
    renderAnnouncements(snapshot);
  }, (error) => {
    window.clearTimeout(connectionTimeout);
    console.error("Could not load announcements:", error);
    const errorMessage = document.createElement("p");
    errorMessage.className = "empty-state";
    errorMessage.textContent = "Announcements could not be loaded. Check Firebase access and try again.";
    list.replaceChildren(errorMessage);
  });

  const onboardingStatus = document.getElementById("onboardingStatus");
  for (const [id, action] of [["onboardingGuideBtn", openOnboardingGuide], ["onboardingDownloadBtn", downloadOnboardingGuide]]) {
    document.getElementById(id).addEventListener("click", async () => {
      onboardingStatus.textContent = "";
      try {
        await action({ schoolName: schoolNameHeading.textContent, schoolCode: joinCode.textContent });
      } catch (error) {
        console.error("Could not create the onboarding guide:", error);
        onboardingStatus.textContent = error.message || "Could not create the guide. Try again.";
      }
    });
  }

  onSnapshot(doc(db, "schools", schoolId), async (schoolSnapshot) => {
    if (!schoolSnapshot.exists()) {
      joinCode.textContent = "Unavailable";
      status.textContent = "This school could not be found.";
      document.body.classList.remove("school-loading");
      return;
    }

    const school = schoolSnapshot.data();
    schoolOwnerUid = school.createdBy || null;
    schoolNameHeading.textContent = school.name || schoolName;
    joinCode.textContent = school.joinCode || "Unavailable";
    document.getElementById("parentLinkInput").value = parentLink(schoolId);
    const theme = school.theme && typeof school.theme === "object" ? school.theme : {};
    applySchoolTheme(theme);
    schoolTagline.textContent = typeof theme.customTagline === "string" && theme.customTagline.trim()
      ? theme.customTagline.trim()
      : "Manage announcements and updates for your school.";

    currentFeatures = school.features && typeof school.features === "object" ? school.features : {};
    if (!calendarSettingsDirty) {
      calendarUrlInput.value = school.calendarUrl || "";
      calendarEnabledInput.checked = school.calendarEnabled === true;
    }
    const announcementsEnabled = currentFeatures.announcementsEnabled !== false;
    const questionsEnabled = currentFeatures.questionsEnabled !== false;
    const questionPostingEnabled = currentFeatures.questionPostingEnabled !== false;
    announcementsEnabledInput.checked = announcementsEnabled;
    questionsEnabledInput.checked = questionsEnabled;
    questionPostingEnabledInput.checked = questionPostingEnabled;
    anyoneCanAnswerInput.checked = currentFeatures.anyoneCanAnswerQuestions === true;
    studentEmailRequiredInput.checked = currentFeatures.studentEmailRequired === true;
    studentEmailDomainInput.value = school.studentEmailDomain || "";
    studentEmailDomainGroup.hidden = !studentEmailRequiredInput.checked;
    hideDatesInput.checked = currentFeatures.hideDatesAndTimes === true;
    document.querySelector('[data-tab="board"]').hidden = false;
    questionTabButton.hidden = !questionsEnabled;
    updateAnnouncementManagementVisibility();
    document.getElementById("questionsTab").hidden = !questionsEnabled;
    questionForm.parentElement.hidden = !questionPostingEnabled;
    document.getElementById("featuresDisabledMessage").hidden =
      announcementsEnabled || questionsEnabled || isOrganizer;
    keepAvailableTab(questionsEnabled);
    if (!settingsDirty) {
      schoolNameInput.value = school.name || schoolName;
      primaryColorInput.value = /^#[0-9a-fA-F]{6}$/.test(theme.primaryColor || "")
        ? theme.primaryColor
        : "#245847";
      fontFamilyInput.value = ["DM Sans", "Manrope", "Inter", "Comic Sans MS", "Arial", "Georgia", "Times New Roman"].includes(theme.fontFamily)
        ? theme.fontFamily
        : "DM Sans";
      schoolLogoUrl = typeof theme.logoUrl === "string" ? theme.logoUrl : "";
      schoolLogoInput.value = "";
      updateSchoolLogoPreview(schoolLogoUrl);
      customTaglineInput.value = typeof theme.customTagline === "string" ? theme.customTagline : "";
    }
    if (questionsEnabled && !unsubscribeQuestions) {
      const questionsQuery = query(
        collection(db, "schools", schoolId, "questions"),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      unsubscribeQuestions = onSnapshot(questionsQuery, (snapshot) => {
        currentQuestionsSnapshot = snapshot;
        renderQuestions(snapshot);
      }, (error) => {
        console.error("Could not load questions:", error);
        questionsList.textContent = "Questions could not be loaded. Check Firebase access and try again.";
      });
    } else if (!questionsEnabled && unsubscribeQuestions) {
      unsubscribeQuestions();
      unsubscribeQuestions = null;
      currentQuestionsSnapshot = null;
      for (const unsubscribe of questionListeners.values()) unsubscribe();
      questionListeners.clear();
      questionsList.textContent = "The Q&A feature is turned off.";
    }
    schoolLoaded = true;
    if (authReady) await verifySchoolAccess();
  }, (error) => {
    console.error("Could not load school:", error);
    joinCode.textContent = "Unable to load";
    status.textContent = `Could not load the school settings: ${error.message || "Check Firebase access and try again."}`;
    document.body.classList.remove("school-loading");
  });

  function renderQuestions(snapshot) {
    for (const unsubscribe of questionListeners.values()) unsubscribe();
    questionListeners.clear();
    questionsList.replaceChildren();
    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No questions yet.";
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
      const author = document.createElement("p");
      author.className = "announcement-meta";
      author.textContent = currentFeatures.hideDatesAndTimes === true
        ? (question.authorName || "Student")
        : `${question.authorName || "Student"} · ${question.createdAt?.toDate ? question.createdAt.toDate().toLocaleString() : "Just now"}`;
      const answers = document.createElement("div");
      answers.className = "qa-answers";
      const answerForm = document.createElement("form");
      answerForm.className = "qa-answer-form";
      const canAnswer = isOrganizer || isOfficer || currentFeatures.anyoneCanAnswerQuestions === true;
      if (canAnswer) {
        const answerInput = document.createElement("textarea");
        answerInput.rows = 2;
        answerInput.maxLength = 1200;
        answerInput.required = true;
        answerInput.placeholder = "Write an answer...";
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
          if (!answerInput.value.trim()) return;
          answerButton.disabled = true;
          if (!await passesModeration([answerInput.value])) {
            answerButton.disabled = false;
            return;
          }
          try {
            await addDoc(collection(db, "schools", schoolId, "questions", questionDoc.id, "answers"), {
              content: answerInput.value.trim(),
              authorName: isOfficer ? "Class officer" : "School organizer",
              createdAt: serverTimestamp()
            });
            answerForm.reset();
            answerButton.hidden = true;
          } catch (error) {
            console.error("Could not post answer:", error);
            await showModal("Could not post answer", `Firebase error (${error.code || "unknown"}): ${error.message || "Try again."}`);
          } finally {
            answerButton.disabled = false;
          }
        });
      }
      const canDeleteQuestion = isOrganizer || isOfficer;
      if (canDeleteQuestion) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "qa-delete-button";
        removeButton.title = `Delete question from ${question.authorName || "student"}`;
        removeButton.setAttribute("aria-label", `Delete question from ${question.authorName || "student"}`);
        removeButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M4 7h16"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="m5 7 1 13h12l1-13M9 7V4h6v3"></path>
          </svg>
        `;
        removeButton.addEventListener("click", async () => {
          removeButton.disabled = true;
          try {
            const answersSnapshot = await getDocs(
              collection(db, "schools", schoolId, "questions", questionDoc.id, "answers")
            );
            for (let start = 0; start < answersSnapshot.docs.length; start += 450) {
              const batch = writeBatch(db);
              answersSnapshot.docs
                .slice(start, start + 450)
                .forEach((answerDoc) => batch.delete(answerDoc.ref));
              await batch.commit();
            }
            await deleteDoc(doc(db, "schools", schoolId, "questions", questionDoc.id));
          } catch (error) {
            console.error("Could not delete question:", error);
            await showModal("Could not delete question", `Firebase error (${error.code || "unknown"}): ${error.message || "Try again."}`);
            removeButton.disabled = false;
          }
        });
        card.append(content, author, answers, answerForm, removeButton);
      } else {
        card.append(content, author, answers, answerForm);
      }
      questionsList.append(card);

      const answerQuery = query(
        collection(db, "schools", schoolId, "questions", questionDoc.id, "answers"),
        orderBy("createdAt", "asc")
      );
      const unsubscribe = onSnapshot(answerQuery, (answerSnapshot) => {
        answers.replaceChildren();
        answerSnapshot.forEach((answerDoc) => {
          const answer = answerDoc.data();
          const item = document.createElement("p");
          item.className = "qa-answer";
          const author = document.createElement("strong");
          author.textContent = `${answer.authorName || "School community"}: `;
          const content = document.createElement("span");
          content.textContent = answer.content || "";
          item.append(author, content);
          if (isOrganizer || isOfficer) {
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
                await showModal("Could not delete reply", `Firebase error (${error.code || "unknown"}): ${error.message || "Try again."}`);
                deleteButton.disabled = false;
              }
            });
            item.append(deleteButton);
          }
          answers.append(item);
        });
      }, (error) => {
        console.error("Could not load answers:", error);
        answers.textContent = "Answers could not be loaded.";
      });
      questionListeners.set(questionDoc.id, unsubscribe);
    });
  }

  questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const authorName = questionAuthorInput.value.trim();
    const content = questionContentInput.value.trim();
    if (!authorName || !content || !currentFeatures.questionsEnabled && currentFeatures.questionsEnabled !== undefined ||
        currentFeatures.questionPostingEnabled === false) {
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
    } catch (error) {
      trackActivityResult("post_question", "failure");
      console.error("Could not post question:", error);
      questionStatus.textContent = `Question could not be posted (${error.code || "unknown"}).`;
    } finally {
      button.disabled = false;
    }
  });

  calendarSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isOrganizer || !signedInUser) {
      await showModal("Organizer access required", "Only the school organizer can save calendar settings.");
      return;
    }

    const rawCalendarUrl = calendarUrlInput.value.trim();
    const calendarEnabled = calendarEnabledInput.checked;
    const calendarUrl = toGoogleCalendarEmbedUrl(rawCalendarUrl);
    if (rawCalendarUrl && !calendarUrl) {
      calendarSettingsStatus.textContent = "Enter a valid Google Calendar embed URL, iframe embed code, or Calendar ID.";
      calendarUrlInput.focus();
      return;
    }
    if (calendarEnabled && !calendarUrl) {
      calendarSettingsStatus.textContent = "Add a valid public Google Calendar URL or Calendar ID before enabling the calendar.";
      calendarUrlInput.focus();
      return;
    }

    saveCalendarSettingsBtn.disabled = true;
    calendarSettingsStatus.textContent = "Saving calendar settings...";
    try {
      await updateDoc(doc(db, "schools", schoolId), {
        calendarUrl: calendarUrl || "",
        calendarEnabled
      });
      trackActivityResult("save_calendar_settings", "success");
      calendarUrlInput.value = calendarUrl || "";
      calendarSettingsDirty = false;
      calendarSettingsStatus.textContent = "Calendar settings saved.";
    } catch (error) {
      trackActivityResult("save_calendar_settings", "failure");
      console.error("Could not save calendar settings:", error);
      calendarSettingsStatus.textContent = error.code === "permission-denied"
        ? "Permission denied. Deploy the updated firestore.rules, then sign in as the school organizer and try again."
        : `Calendar settings could not be saved (${error.code || "unknown"}).`;
    } finally {
      saveCalendarSettingsBtn.disabled = false;
    }
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isOrganizer || !signedInUser) {
      await showModal("Organizer access required", "Only the school organizer can save school settings.");
      return;
    }

    saveSettingsBtn.disabled = true;
    settingsStatus.textContent = "Saving school settings...";
    const updatedName = schoolNameInput.value.trim();
    const selectedLogo = schoolLogoInput.files?.[0];
    const theme = {
      primaryColor: primaryColorInput.value,
      fontFamily: fontFamilyInput.value,
      logoUrl: schoolLogoUrl,
      customTagline: customTaglineInput.value.trim()
    };
    const features = {
      announcementsEnabled: announcementsEnabledInput.checked,
      questionsEnabled: questionsEnabledInput.checked,
      questionPostingEnabled: questionPostingEnabledInput.checked,
      anyoneCanAnswerQuestions: anyoneCanAnswerInput.checked,
      studentEmailRequired: studentEmailRequiredInput.checked,
      hideDatesAndTimes: hideDatesInput.checked
    };
    const studentEmailDomain = studentEmailDomainInput.value.trim().toLowerCase();
    const validStudentEmailDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(studentEmailDomain);
    if ((studentEmailRequiredInput.checked && !studentEmailDomain)
      || (studentEmailDomain && !validStudentEmailDomain)) {
      studentEmailDomainGroup.hidden = false;
      settingsStatus.textContent = studentEmailRequiredInput.checked && !studentEmailDomain
        ? "Enter the school email domain before requiring Google sign-in."
        : "Enter a valid school email domain, or clear the field.";
      studentEmailDomainInput.focus();
      saveSettingsBtn.disabled = false;
      return;
    }
    currentFeatures = features;
    document.querySelector('[data-tab="board"]').hidden = false;
    questionTabButton.hidden = !features.questionsEnabled;
    updateAnnouncementManagementVisibility();
    document.getElementById("questionsTab").hidden = !features.questionsEnabled;
    keepAvailableTab(features.questionsEnabled);
    questionForm.parentElement.hidden = !features.questionPostingEnabled;
    document.getElementById("featuresDisabledMessage").hidden =
      features.announcementsEnabled || features.questionsEnabled || isOrganizer;
    if (currentQuestionsSnapshot) renderQuestions(currentQuestionsSnapshot);

    try {
      if (selectedLogo) {
        if (!selectedLogo.type.startsWith("image/")) {
          throw new Error("Choose an image file for the school logo.");
        }
        settingsStatus.textContent = "Uploading school logo...";
        theme.logoUrl = await uploadPhoto(selectedLogo);
      }
      await updateDoc(doc(db, "schools", schoolId), {
        name: updatedName,
        theme,
        features,
        studentEmailDomain
      });
      trackActivityResult("save_school_settings", "success");
      localStorage.setItem("schoolName", updatedName);
      settingsDirty = false;
      schoolLogoUrl = theme.logoUrl;
      schoolLogoInput.value = "";
      if (schoolLogoPreviewObjectUrl) {
        URL.revokeObjectURL(schoolLogoPreviewObjectUrl);
        schoolLogoPreviewObjectUrl = null;
      }
      applySchoolTheme(theme);
      updateSchoolLogoPreview(schoolLogoUrl);
      schoolNameHeading.textContent = updatedName;
      schoolTagline.textContent = theme.customTagline || "Manage announcements and updates for your school.";
      settingsStatus.textContent = "School settings saved.";
      await showModal("Settings saved", "Your school details, appearance, and feature settings have been updated.");
    } catch (error) {
      trackActivityResult("save_school_settings", "failure");
      console.error("Could not save school settings:", error);
      settingsStatus.textContent = "";
      await showModal(
        "Could not save settings",
        `Firebase error (${error.code || "unknown"}): ${error.message || "Confirm you are signed in as the school creator and try again."}`
      );
    } finally {
      saveSettingsBtn.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = announcementTitleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) {
      status.textContent = "Enter an announcement title and message before posting.";
      return;
    }
    if (!signedInUser) {
      status.textContent = "Sign in with Google before posting an announcement.";
      return;
    }

    postButton.disabled = true;
    status.textContent = "Checking...";
    if (!await passesModeration([title, content])) {
      status.textContent = "";
      postButton.disabled = false;
      return;
    }
    status.textContent = "Posting announcement...";
    try {
      await addDoc(collection(db, "schools", schoolId, "announcements"), {
        title,
        content,
        sticky: false,
        authorName: "School organizer",
        createdAt: serverTimestamp()
      });
      trackActivityResult("post_announcement", "success");
      form.reset();
      status.textContent = "Announcement posted.";
    } catch (error) {
      trackActivityResult("post_announcement", "failure");
      console.error("Could not post announcement:", error);
      status.textContent = "Announcement could not be posted. Confirm you are the school creator and try again.";
    } finally {
      postButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    try {
      if (auth.currentUser) await signOut(auth);
    } catch (error) {
      console.error("Could not sign out:", error);
    } finally {
      localStorage.removeItem("schoolId");
      localStorage.removeItem("schoolName");
      localStorage.removeItem("studentName");
      window.location.href = "/";
    }
  });

}
