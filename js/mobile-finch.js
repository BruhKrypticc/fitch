import { initFinch } from "./finch.js";

// Separate module: mobile.js throws at top level when no student is signed in, which would
// otherwise prevent Finch from loading. The login screen hides the widget via CSS.
document.body.classList.add("finch-mobile-app");
initFinch().catch((error) => console.error("Finch could not start:", error));
