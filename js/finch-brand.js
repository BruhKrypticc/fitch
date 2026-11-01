// Finch brand mark: a minimalist bird head with a leaf crest. Static markup only.
// `color` tints the bird; `--finch-eye` is the eye / leaf-vein colour (set it to the background).
const FINCH_SVG = `
<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M14.5 5.2C14.9 2.6 17.6 1.2 21 1.6c.3 3.2-1.6 5.7-4.7 6.3a9 9 0 0 1 3.2.8z"/>
  <path fill="currentColor" d="M15.8 8.2c5.6 0 9.6 3.9 9.6 9.1 0 5.9-4.6 10.2-10.5 10.2-4.8 0-8.5-3-8.5-7.5 0-6.6 3.8-11.8 9.4-11.8z"/>
  <path fill="currentColor" d="M24.6 14.4 31 17.1l-6.6 3z"/>
  <circle fill="var(--finch-eye, #fff)" cx="19.2" cy="15.8" r="1.7"/>
  <path fill="none" stroke="var(--finch-eye, #fff)" stroke-width=".9" stroke-linecap="round" opacity=".7" d="M15.2 6.9c1.4-1.2 3-2 4.8-2.4"/>
</svg>`;

export function createFinchAvatar() {
  const avatar = document.createElement("span");
  avatar.className = "finch-avatar";
  avatar.innerHTML = FINCH_SVG;
  return avatar;
}
