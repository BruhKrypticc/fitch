const IMAGEKIT_AUTH_URL = "https://fitch-imagekit-auth.syncoperating.workers.dev";
const IMAGEKIT_PUBLIC_KEY = "public_7w5irNVd3VlJ6wE2EU+kunsm9SU=";
const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

export function openPhotoPreview(imageUrl, caption = "") {
  const dialog = document.createElement("dialog");
  dialog.className = "photo-lightbox";

  const closeButton = document.createElement("button");
  closeButton.className = "photo-lightbox-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.setAttribute("aria-label", "Close photo preview");

  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = caption || "Expanded photo";

  dialog.append(closeButton, image);
  if (caption.trim()) {
    const captionText = document.createElement("p");
    captionText.textContent = caption;
    dialog.append(captionText);
  }
  document.body.append(dialog);

  const removeDialog = () => dialog.remove();
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", removeDialog, { once: true });
  dialog.showModal();
}

export async function uploadPhoto(file) {
  const authResponse = await fetch(IMAGEKIT_AUTH_URL);
  if (!authResponse.ok) throw new Error(`Upload auth failed (${authResponse.status}).`);
  const auth = await authResponse.json();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", file.name || "photo.jpg");
  formData.append("publicKey", IMAGEKIT_PUBLIC_KEY);
  formData.append("signature", auth.signature);
  formData.append("expire", String(auth.expire));
  formData.append("token", auth.token);
  formData.append("folder", "/fitch");

  const response = await fetch(IMAGEKIT_UPLOAD_URL, { method: "POST", body: formData });
  const result = await response.json();
  if (!response.ok || typeof result.url !== "string") {
    throw new Error(result.message || `Image upload failed (${response.status}).`);
  }

  return result.url;
}

export async function uploadDocument(file) {
  const authResponse = await fetch(IMAGEKIT_AUTH_URL);
  if (!authResponse.ok) throw new Error(`Upload auth failed (${authResponse.status}).`);
  const auth = await authResponse.json();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", file.name || "document");
  formData.append("publicKey", IMAGEKIT_PUBLIC_KEY);
  formData.append("signature", auth.signature);
  formData.append("expire", String(auth.expire));
  formData.append("token", auth.token);
  formData.append("folder", "/fitch/documents");
  formData.append("useUniqueFileName", "true");

  const response = await fetch(IMAGEKIT_UPLOAD_URL, { method: "POST", body: formData });
  const result = await response.json();
  if (!response.ok || typeof result.url !== "string" || !result.url.startsWith("https://")) {
    throw new Error(result.message || `Document upload failed (${response.status}).`);
  }
  return result.url;
}