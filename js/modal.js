export function showModal(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("section");
    dialog.className = "app-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "appModalTitle");
    dialog.setAttribute("aria-describedby", "appModalMessage");

    const heading = document.createElement("h2");
    heading.id = "appModalTitle";
    heading.textContent = title;

    const body = document.createElement("p");
    body.id = "appModalMessage";
    body.textContent = message;

    const closeButton = document.createElement("button");
    closeButton.className = "modal-close-button";
    closeButton.type = "button";
    closeButton.textContent = "Got it";

    dialog.append(heading, body, closeButton);
    overlay.append(dialog);
    document.body.append(overlay);

    function close() {
      document.removeEventListener("keydown", handleKeydown);
      overlay.remove();
      resolve();
    }

    function handleKeydown(event) {
      if (event.key === "Escape") close();
    }

    closeButton.addEventListener("click", close, { once: true });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", handleKeydown);
    closeButton.focus();
  });
}
