import { initFinch } from "./finch.js";

document.body.classList.add("finch-mobile-app");
initFinch().catch((error) => console.error("Finch could not start:", error));
