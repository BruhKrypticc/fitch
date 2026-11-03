import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const STUDENT_NAME_MIN_LENGTH = 1;
const STUDENT_NAME_MAX_LENGTH = 40;

export function getStoredStudentName() {
  try {
    return (localStorage.getItem("studentName") || "").trim();
  } catch (error) {
    console.error("Could not read the saved student name:", error);
    return "";
  }
}

export function setStoredStudentName(name) {
  const trimmed = (name || "").trim();
  try {
    localStorage.setItem("studentName", trimmed);
  } catch (error) {
    console.error("Could not save the student name:", error);
  }
  return trimmed;
}

export function isValidStudentName(name) {
  const trimmed = (name || "").trim();
  return trimmed.length >= STUDENT_NAME_MIN_LENGTH && trimmed.length <= STUDENT_NAME_MAX_LENGTH;
}

export async function getStudentAccountAlias(db, schoolId, userId) {
  const aliasRef = doc(db, "schools", schoolId, "studentAliases", userId);
  const aliasSnapshot = await getDoc(aliasRef);
  if (aliasSnapshot.exists()) {
    const alias = aliasSnapshot.data().displayName;
    localStorage.setItem("studentName", alias);
    return alias;
  }

  const alias = `Student ${crypto.randomUUID().slice(-12).toUpperCase()}`;
  try {
    await setDoc(aliasRef, { displayName: alias, createdAt: serverTimestamp() });
    localStorage.setItem("studentName", alias);
    return alias;
  } catch (error) {
    const savedAlias = await getDoc(aliasRef);
    if (savedAlias.exists()) {
      const savedName = savedAlias.data().displayName;
      localStorage.setItem("studentName", savedName);
      return savedName;
    }
    throw error;
  }
}

export function isAllowedSchoolEmail(email, domain) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedDomain = domain.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");

  return atIndex > 0
    && normalizedEmail.indexOf("@") === atIndex
    && normalizedEmail.slice(atIndex + 1) === normalizedDomain;
}

export function isAllowedSchoolAccount(user, domain) {
  return Boolean(user?.emailVerified
    && user.providerData?.some((provider) => provider.providerId === "google.com")
    && isAllowedSchoolEmail(user.email || "", domain));
}
