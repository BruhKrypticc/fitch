import { createFinchAvatar } from "./finch-brand.js";

// Set after deploying workers/moderation/. The OpenAI key lives only in that worker.
export const MODERATION_URL = "https://moderation.krypticc.com";
const TIMEOUT_MS = 8000;

const STYLE = `
.finch-alert-overlay { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 20px; background: rgb(8 14 11 / 55%); }
.finch-alert { width: min(100%, 380px); padding: 24px; border-radius: 20px; background: #fff; color: #1c2c27; box-shadow: 0 24px 60px rgb(0 0 0 / 30%); font-family: var(--body-font, var(--m-font, system-ui, sans-serif)); text-align: center; }
.finch-alert .finch-avatar { width: 52px; height: 52px; margin: 0 auto 12px; display: grid; place-items: center; border-radius: 50%; background: var(--primary, #2f6f5a); color: var(--primary-contrast, #fff); --finch-eye: var(--primary, #2f6f5a); }
.finch-alert .finch-avatar svg { width: 30px; height: 30px; }
.finch-alert h2 { margin: 0 0 8px; font-family: inherit; font-size: 18px; font-weight: 700; line-height: 1.3; }
.finch-alert p { margin: 0 0 18px; font-family: inherit; font-size: 14px; font-weight: 500; line-height: 1.5; color: #52615b; }
.finch-alert button { min-height: 44px; padding: 0 22px; border: 0; border-radius: 12px; background: var(--primary, #2f6f5a); color: var(--primary-contrast, #fff); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
`;

function ensureStyle() {
  if (document.getElementById("finchAlertStyle")) return;
  const style = document.createElement("style");
  style.id = "finchAlertStyle";
  style.textContent = STYLE;
  document.head.append(style);
}

export function showFinchAlert(
  title = "Let\u2019s keep it school-appropriate",
  message = "Finch noticed something in your post that doesn\u2019t fit our school community. Please reword it to be kind and school-appropriate, then try again."
) {
  ensureStyle();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "finch-alert-overlay";
    const dialog = document.createElement("section");
    dialog.className = "finch-alert";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "finchAlertTitle");
    dialog.setAttribute("aria-describedby", "finchAlertMessage");
    const heading = document.createElement("h2");
    heading.id = "finchAlertTitle";
    heading.textContent = title;
    const body = document.createElement("p");
    body.id = "finchAlertMessage";
    body.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Got it";
    dialog.append(createFinchAvatar(), heading, body, button);
    overlay.append(dialog);
    document.body.append(overlay);

    const close = () => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve();
    };
    const onKey = (event) => { if (event.key === "Escape") close(); };
    button.addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    button.focus();
  });
}

/**
 * Checks user-submitted text with OpenAI moderation (via the proxy worker).
 * Resolves true when the content may be saved. When it is flagged, shows the Finch alert and
 * resolves false. If the moderation service is unreachable the check is skipped so the school
 * can keep working; the failure is logged.
 */
export async function passesModeration(texts) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t ?? "").trim()).filter(Boolean);
  if (!list.length) return true;
  let flagged = false;
  try {
    const response = await fetch(MODERATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: list }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Moderation responded ${response.status}`);
    flagged = (await response.json()).flagged === true;
  } catch (error) {
    console.warn("Content moderation unavailable; skipping check:", error);
    return true;
  }
  if (flagged) await showFinchAlert();
  return !flagged;
}
