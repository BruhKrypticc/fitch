import {
  collection,
  addDoc,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { getStudentAccountAlias, isAllowedSchoolAccount, isValidStudentName } from "./student-identity.js";
import { showModal } from "./modal.js";
import { SITE_OWNER_EMAIL, trackActivityResult } from "./activity-tracker.js";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Keep track of the currently logged-in organizer
let currentUser = null;

// UI elements
const roleSelect = document.getElementById("roleSelect");
const studentSection = document.getElementById("studentSection");
const organizerSection = document.getElementById("organizerSection");
const googleSignInBtn = document.getElementById("googleSignInBtn");
const emailSignInToggle = document.getElementById("emailSignInToggle");
const emailSignInForm = document.getElementById("emailSignInForm");
const emailSignInInput = document.getElementById("emailSignInInput");
const emailSignInStatus = document.getElementById("emailSignInStatus");
const emailLinkSubmit = emailSignInForm?.querySelector("button[type='submit']");
const googleSignInLabel = googleSignInBtn?.querySelector("span");
const signOutBtn = document.getElementById("signOutBtn");
const authStatus = document.getElementById("authStatus");
const siteActivityLink = document.getElementById("siteActivityLink");
const organizerSchoolsList = document.getElementById("organizerSchoolsList");
const officerInvitationsPanel = document.getElementById("officerInvitationsPanel");
const officerInvitationsList = document.getElementById("officerInvitationsList");
const savedStudentSchoolsPanel = document.getElementById("savedStudentSchools");
const savedStudentSchoolsList = document.getElementById("savedStudentSchoolsList");
const savedStudentSchoolsKey = "savedStudentSchools";
const emailLinkStorageKey = "emailForSignIn";
let authMessage = "";

// Prefill the display-name field with the last name this device used, so returning
// students do not need to retype it (and do not get a new generated name).
const studentDisplayNameInput = document.getElementById("studentDisplayNameInput");
if (studentDisplayNameInput) {
  const existingStudentName = localStorage.getItem("studentName");
  if (existingStudentName) studentDisplayNameInput.value = existingStudentName;
}

async function openSchool(schoolId, schoolName, studentName = null) {
  if (!studentName) {
    localStorage.setItem("schoolId", schoolId);
    localStorage.setItem("schoolName", schoolName);
    localStorage.removeItem("studentName");
    window.location.href = "/admin";
    return;
  }

  try {
    const schoolSnapshot = await getDoc(doc(db, "schools", schoolId));
    if (!schoolSnapshot.exists()) {
      await showModal("School not found", "This school is no longer available. Ask the organizer for help.");
      return;
    }

    const school = schoolSnapshot.data();
    // In non-required mode, keep the student's previously saved display name as-is.
    let displayName = studentName;
    if (school.features?.studentEmailRequired === true) {
      const domain = school.studentEmailDomain || "";
      if (!domain) {
        await showModal("School sign-in unavailable", "This school has not configured its student email domain. Contact the organizer.");
        return;
      }

      const credential = await signInWithPopup(auth, googleProvider);
      if (!isAllowedSchoolAccount(credential.user, domain)) {
        await showModal("School Google account required", `Use a verified Google account ending in @${domain}.`);
        return;
      }
      displayName = await getStudentAccountAlias(db, schoolId, credential.user.uid);
    }

    localStorage.setItem("schoolId", schoolId);
    localStorage.setItem("schoolName", schoolName);
    localStorage.setItem("studentName", displayName);
    window.location.href = "/student";
  } catch (error) {
    console.error("Could not open the saved school:", error);
    const message = error.code === "auth/popup-closed-by-user"
      ? "Google sign-in was cancelled."
      : `Could not open this school (${error.code || "unknown"}). Check your connection and try again.`;
    await showModal("Could not open school", message);
  }
}

function getSavedStudentSchools() {
  try {
    const saved = JSON.parse(localStorage.getItem(savedStudentSchoolsKey) || "[]");
    if (!Array.isArray(saved)) return [];
    // Keep each school's own saved display name; never regenerate or overwrite it here.
    const sanitized = saved.filter((school) =>
      school
      && typeof school.schoolId === "string"
      && typeof school.schoolName === "string"
      && typeof school.studentName === "string"
      && school.studentName.trim().length > 0
    ).map((school) => ({
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      studentName: school.studentName
    }));
    localStorage.setItem(savedStudentSchoolsKey, JSON.stringify(sanitized));
    return sanitized;
  } catch (error) {
    console.error("Could not read saved student schools:", error);
    return [];
  }
}

function rememberStudentSchool(school) {
  const schools = getSavedStudentSchools().filter((saved) => saved.schoolId !== school.schoolId);
  schools.unshift(school);
  localStorage.setItem(savedStudentSchoolsKey, JSON.stringify(schools.slice(0, 10)));
}

function renderSavedStudentSchools() {
  const savedSchools = getSavedStudentSchools();
  savedStudentSchoolsPanel.hidden = savedSchools.length === 0;
  savedStudentSchoolsList.replaceChildren();

  for (const school of savedSchools) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-school-button";
    button.textContent = `${school.schoolName} · ${school.studentName}`;
    button.addEventListener("click", () => openSchool(school.schoolId, school.schoolName, school.studentName));
    savedStudentSchoolsList.append(button);
  }
}

async function loadOrganizerSchools(user) {
  if (!organizerSchoolsList) return;
  organizerSchoolsList.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "empty-state";
  loading.textContent = "Loading your schools...";
  organizerSchoolsList.append(loading);

  try {
    const schoolsQuery = query(collection(db, "schools"), where("createdBy", "==", user.uid));
    const schoolDocuments = new Map();
    const schoolsSnapshot = await getDocs(schoolsQuery);
    schoolsSnapshot.forEach((schoolDocument) => {
      schoolDocuments.set(schoolDocument.id, { ...schoolDocument.data(), id: schoolDocument.id });
    });

    if (user.email) {
      const acceptedInvitesQuery = query(
        collection(db, "officerInvitations"),
        where("email", "==", user.email.toLowerCase())
      );
      const acceptedInvites = await getDocs(acceptedInvitesQuery);
      for (const invitation of acceptedInvites.docs.filter((entry) => entry.data().status === "accepted")) {
        const invitedSchool = await getDoc(doc(db, "schools", invitation.data().schoolId));
        if (invitedSchool.exists()) {
          schoolDocuments.set(invitedSchool.id, { ...invitedSchool.data(), id: invitedSchool.id });
        }
      }
    }

    organizerSchoolsList.replaceChildren();

    if (schoolDocuments.size === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-state";
      emptyMessage.textContent = "No schools found for this Google account yet. Create your first school below.";
      organizerSchoolsList.append(emptyMessage);
      return;
    }

    for (const school of schoolDocuments.values()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "saved-school-button";
      button.textContent = `${school.name || "School"} · Code ${school.joinCode || "unavailable"}`;
      button.addEventListener("click", () => openSchool(school.id, school.name || "Your school"));
      organizerSchoolsList.append(button);
    }
  } catch (error) {
    console.error("Could not load your schools:", error);
    organizerSchoolsList.replaceChildren();
    const errorMessage = document.createElement("p");
    errorMessage.className = "empty-state";
    errorMessage.textContent = `Could not load your schools: ${error.message || "Check your connection and Firestore permissions."}`;
    organizerSchoolsList.append(errorMessage);
  }
}

async function loadOfficerInvitations(user) {
  officerInvitationsPanel.hidden = true;
  officerInvitationsList.replaceChildren();
  if (!user?.email) return;

  try {
    const invitationsQuery = query(
      collection(db, "officerInvitations"),
      where("email", "==", user.email.toLowerCase())
    );
    const invitationsSnapshot = await getDocs(invitationsQuery);
    const pendingInvitations = invitationsSnapshot.docs.filter((entry) => entry.data().status === "pending");
    if (pendingInvitations.length === 0) return;

    officerInvitationsPanel.hidden = false;
    for (const invitationDocument of pendingInvitations) {
      const invitation = invitationDocument.data();
      const schoolSnapshot = await getDoc(doc(db, "schools", invitation.schoolId));
      if (!schoolSnapshot.exists()) continue;

      const school = schoolSnapshot.data();
      const row = document.createElement("div");
      row.className = "invitation-row";
      const details = document.createElement("p");
      details.className = "invitation-copy";
      details.textContent = `${school.name || "A school"} invited you to join as a class officer.`;
      const acceptButton = document.createElement("button");
      acceptButton.type = "button";
      acceptButton.className = "invitation-accept-button";
      acceptButton.textContent = "Accept invitation";
      acceptButton.addEventListener("click", async () => {
        acceptButton.disabled = true;
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, "officerInvitations", invitationDocument.id), {
            status: "accepted",
            acceptedBy: user.uid,
            acceptedAt: serverTimestamp()
          });
          batch.set(doc(db, "schools", invitation.schoolId, "officers", user.uid), {
            email: user.email,
            displayName: user.displayName || user.email,
            role: "classOfficer",
            inviteId: invitationDocument.id,
            createdAt: serverTimestamp()
          });
          await batch.commit();
          await showModal("Welcome aboard", `You’re now a class officer for ${school.name || "this school"}.`);
          await loadOrganizerSchools(user);
          await loadOfficerInvitations(user);
        } catch (error) {
          console.error("Could not accept officer invitation:", error);
          acceptButton.disabled = false;
          await showModal(
            "Could not accept invitation",
            `Firebase error (${error.code || "unknown"}): ${error.message || "Try again or contact the school organizer."}`
          );
        }
      });
      row.append(details, acceptButton);
      officerInvitationsList.append(row);
    }
  } catch (error) {
    console.error("Could not load officer invitations:", error);
    officerInvitationsPanel.hidden = false;
    officerInvitationsList.textContent = "Could not load invitations. Check your connection and try again.";
  }
}

renderSavedStudentSchools();

function updateAuthUI(user) {
  const isLoggedIn = Boolean(user);

  if (siteActivityLink) {
    siteActivityLink.hidden = user?.email?.toLowerCase() !== SITE_OWNER_EMAIL;
  }
  if (googleSignInBtn) googleSignInBtn.hidden = false;
  if (googleSignInLabel) googleSignInLabel.textContent = isLoggedIn ? "Switch Google account" : "Sign in with Google";
  if (emailSignInToggle) emailSignInToggle.hidden = isLoggedIn;
  if (emailSignInForm && isLoggedIn) emailSignInForm.hidden = true;
  if (emailSignInToggle && isLoggedIn) emailSignInToggle.textContent = "Sign in with Email";
  if (signOutBtn) signOutBtn.hidden = !isLoggedIn;

  if (authStatus) {
    if (isLoggedIn) {
      authStatus.textContent = `Signed in as ${user.displayName || user.email || "Google user"}`;
    } else {
      authStatus.textContent = authMessage || "";
    }
  }

  if (!isLoggedIn) {
    if (roleSelect) roleSelect.value = "student";
    if (studentSection) studentSection.style.display = "block";
    if (organizerSection) organizerSection.style.display = "none";
    return;
  }

  if (roleSelect && roleSelect.value === "organizer") {
    if (studentSection) studentSection.style.display = "none";
    if (organizerSection) organizerSection.style.display = "block";
  } else {
    if (studentSection) studentSection.style.display = "block";
    if (organizerSection) organizerSection.style.display = "none";
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) authMessage = "";
  currentUser = user;

  if (user) {
    console.log("Logged in user:", user.email);
    if (roleSelect) roleSelect.value = "organizer";
    loadOrganizerSchools(user);
    loadOfficerInvitations(user);
  } else {
    console.log("No user logged in.");
    officerInvitationsPanel.hidden = true;
  }

  updateAuthUI(user);
});

// UI Toggle between Student and Organizer views
roleSelect?.addEventListener("change", (e) => {
  if (!currentUser && e.target.value === "organizer") {
    showModal("Sign in required", "Please sign in with Google before creating a school.");
    e.target.value = "student";
    studentSection.style.display = "block";
    organizerSection.style.display = "none";
    return;
  }

  if (e.target.value === "organizer") {
    studentSection.style.display = "none";
    organizerSection.style.display = "block";
  } else {
    studentSection.style.display = "block";
    organizerSection.style.display = "none";
  }
});

googleSignInBtn?.addEventListener("click", async () => {
  try {
    if (currentUser) {
      await signOut(auth);
      currentUser = null;
    }
    const result = await signInWithPopup(auth, googleProvider);
    trackActivityResult("google_sign_in", "success");
    console.log("Google sign-in successful:", result.user.email);
    authMessage = "";
    if (roleSelect) roleSelect.value = "organizer";
    updateAuthUI(result.user);
  } catch (error) {
    trackActivityResult("google_sign_in", "failure");
    console.error("Google sign-in error:", error);
    if (!currentUser) {
      if (emailSignInForm) emailSignInForm.hidden = false;
      if (emailSignInToggle) emailSignInToggle.textContent = "Hide email sign-in";
      emailSignInInput?.focus();
      authMessage = "Google sign-in failed. You can sign in with your email instead.";
      updateAuthUI(null);
    } else {
      authMessage = "Could not switch Google accounts. Please try again.";
      updateAuthUI(currentUser);
    }
  }
});

emailSignInToggle?.addEventListener("click", () => {
  const isOpening = emailSignInForm.hidden;
  emailSignInForm.hidden = !isOpening;
  emailSignInToggle.textContent = isOpening ? "Hide email sign-in" : "Sign in with Email";
  if (emailSignInForm && !emailSignInForm.hidden) emailSignInInput?.focus();
});

emailSignInForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = emailSignInInput.value.trim().toLowerCase();
  if (!email) return;

  emailLinkSubmit.disabled = true;
  emailSignInStatus.hidden = false;
  emailSignInStatus.textContent = "Sending sign-in link...";
  let action = "email_link_sent";
  try {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      action = "email_link_sign_in";
      await signInWithEmailLink(auth, email, window.location.href);
      trackActivityResult(action, "success");
      localStorage.removeItem(emailLinkStorageKey);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    await sendSignInLinkToEmail(auth, email, {
      url: `${window.location.origin}/`,
      handleCodeInApp: true
    });
    trackActivityResult("email_link_sent", "success");
    localStorage.setItem(emailLinkStorageKey, email);
    emailSignInStatus.textContent = "Link sent. Check your inbox, then open the link on this device.";
  } catch (error) {
    trackActivityResult(action, "failure");
    console.error("Email-link sign-in error:", error);
    if (error.code === "auth/operation-not-allowed") {
      emailSignInStatus.textContent = "Email link sign-in is not enabled in Firebase Authentication.";
    } else if (error.code === "auth/unauthorized-continue-uri" || error.code === "auth/invalid-continue-uri") {
      emailSignInStatus.textContent = "This website domain is not authorized for email sign-in in Firebase.";
    } else {
      emailSignInStatus.textContent = error.message || "Could not send the sign-in link. Check the address and try again.";
    }
  } finally {
    emailLinkSubmit.disabled = false;
  }
});

if (isSignInWithEmailLink(auth, window.location.href)) {
  const savedEmail = localStorage.getItem(emailLinkStorageKey);
  if (savedEmail) {
    emailSignInInput.value = savedEmail;
    emailSignInForm.requestSubmit();
  } else {
    emailSignInForm.hidden = false;
    emailSignInToggle.textContent = "Hide email sign-in";
    authMessage = "Enter the same email address where you received the sign-in link.";
    updateAuthUI(null);
    emailSignInInput.focus();
  }
}

signOutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    console.log("User signed out.");
    if (roleSelect) roleSelect.value = "student";
    updateAuthUI(null);
  } catch (error) {
    console.error("Sign-out error:", error);
    await showModal("Sign-out failed", error.message || "There was a problem signing out.");
  }
});

// 1. Organizer creates school and links it to their Auth UID
const createSchoolBtn = document.getElementById("createSchoolBtn");
createSchoolBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    trackActivityResult("create_school", "failure");
    await showModal("Sign in required", "You must be logged in to create a school.");
    return;
  }
  
  const schoolNameInput = document.getElementById("schoolNameInput");
  const schoolName = schoolNameInput ? schoolNameInput.value.trim() : "";
  if (!schoolName) {
    trackActivityResult("create_school", "failure");
    await showModal("School name required", "Please enter a school name.");
    return;
  }
  const createSchoolStatus = document.getElementById("createSchoolStatus");

  // Generate random 5-char code
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  try {
    createSchoolBtn.disabled = true;
    if (createSchoolStatus) createSchoolStatus.textContent = "Creating your school...";
    const docRef = await addDoc(collection(db, "schools"), {
      name: schoolName,
      joinCode: code,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      calendarUrl: "",
      calendarEnabled: false,
      theme: {
        primaryColor: "#245847",
        fontFamily: "DM Sans",
        customTagline: ""
      },
      features: {
        announcementsEnabled: true,
        questionsEnabled: true,
        questionPostingEnabled: true,
        anyoneCanAnswerQuestions: false,
        studentEmailRequired: false
      },
      studentEmailDomain: ""
    });
    localStorage.setItem("schoolId", docRef.id);
    localStorage.setItem("schoolName", schoolName);
    localStorage.removeItem("studentName");
    if (currentUser) loadOrganizerSchools(currentUser);
    trackActivityResult("create_school", "success");
    await showModal("School created", `Your school is ready. Share this join code with students: ${code}`);
    window.location.href = "/admin";
  } catch (error) {
    trackActivityResult("create_school", "failure");
    console.error("Error adding school: ", error);
    const errorCode = error.code || "unknown";
    const errorMessage = error.message || "No additional error details were provided.";
    const guidance = errorCode === "permission-denied"
      ? " Check that the Firestore rules in firestore.rules are deployed and that you are signed in."
      : "";
    if (createSchoolStatus) createSchoolStatus.textContent = "";
    await showModal("Could not create school", `Firebase error (${errorCode}): ${errorMessage}${guidance}`);
  } finally {
    createSchoolBtn.disabled = false;
  }
});

// 2. Student joins school using code
const joinSchoolBtn = document.getElementById("joinSchoolBtn");
joinSchoolBtn?.addEventListener("click", async () => {
  const joinCodeInput = document.getElementById("joinCodeInput");
  const studentEmailRequiredNotice = document.getElementById("studentEmailRequiredNotice");
  const studentJoinStatus = document.getElementById("studentJoinStatus");
  studentEmailRequiredNotice.hidden = true;
  studentJoinStatus.textContent = "";
  const enteredCode = joinCodeInput ? joinCodeInput.value.trim().toUpperCase() : "";

  if (!enteredCode) {
    trackActivityResult("join_school", "failure");
    await showModal("School code required", "Please enter your school join code.");
    return;
  }
  if (!/^[A-Z0-9]{5}$/.test(enteredCode)) {
    trackActivityResult("join_school", "failure");
    await showModal("Check the join code", "School join codes must be exactly 5 letters or numbers.");
    return;
  }

  try {
    const q = query(collection(db, "schools"), where("joinCode", "==", enteredCode));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      trackActivityResult("join_school", "failure");
      await showModal("School not found", "That join code was not found. Check it with your class officer.");
      return;
    }

    const schoolDoc = querySnapshot.docs[0];
    const school = schoolDoc.data();
    if (school.features?.studentEmailRequired === true) {
      studentEmailRequiredNotice.hidden = false;
      if (!school.studentEmailDomain) {
        studentJoinStatus.textContent = "This school has not configured its student email domain. Contact the organizer.";
        return;
      }
      const credential = await signInWithPopup(auth, googleProvider);
      if (!isAllowedSchoolAccount(credential.user, school.studentEmailDomain)) {
        studentJoinStatus.textContent = `Use a verified Google account ending in @${school.studentEmailDomain}.`;
        if (roleSelect) roleSelect.value = "student";
        updateAuthUI(credential.user);
        await showModal("School Google account required", `This school only allows verified Google accounts from @${school.studentEmailDomain}.`);
        return;
      }
      const studentName = await getStudentAccountAlias(db, schoolDoc.id, credential.user.uid);
      localStorage.setItem("schoolId", schoolDoc.id);
      localStorage.setItem("schoolName", school.name || "School");
      rememberStudentSchool({
        schoolId: schoolDoc.id,
        schoolName: school.name || "School",
        studentName
      });
      trackActivityResult("join_school", "success");
      window.location.href = "/student";
      return;
    }

    const typedName = (studentDisplayNameInput?.value || "").trim();
    if (!isValidStudentName(typedName)) {
      trackActivityResult("join_school", "failure");
      studentJoinStatus.textContent = "Enter a display name (1-40 characters) to join your school.";
      return;
    }

    localStorage.setItem("schoolId", schoolDoc.id);
    localStorage.setItem("schoolName", school.name);
    localStorage.setItem("studentName", typedName);
    const studentName = typedName;
    rememberStudentSchool({
      schoolId: schoolDoc.id,
      schoolName: school.name,
      studentName
    });

    trackActivityResult("join_school", "success");
    await showModal("Welcome to your school", `You joined ${school.name} as ${studentName}.`);
    window.location.href = "/student";
  } catch (error) {
    trackActivityResult("join_school", "failure");
    console.error("Error joining school: ", error);
    await showModal("Could not join school", `Firebase error (${error.code || "unknown"}): ${error.message || "Please try again."}`);
  }
});
