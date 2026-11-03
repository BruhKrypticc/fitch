(function initSetup() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const btn = document.getElementById("mSetupBtn");
  if (!btn || installed || !(isIOS || isAndroid)) return;
  const sheet = document.getElementById("mSetup");
  const backdrop = document.getElementById("mSetupBackdrop");
  const installBtn = document.getElementById("mSetupInstall");
  const tabs = sheet.querySelectorAll(".m-setup-tabs button");
  let deferred = null;
  const show = (os) => {
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.os === os));
    sheet.querySelectorAll(".m-setup-steps").forEach((o) => { o.hidden = o.dataset.for !== os; });
  };
  const toggle = (open) => {
    sheet.hidden = backdrop.hidden = !open;
    if (!open) localStorage.setItem("fitchSetupSeen", "1");
  };
  btn.hidden = false;
  show(isIOS ? "ios" : "android");
  if (!localStorage.getItem("fitchSetupSeen")) setTimeout(() => toggle(true), 700);
  btn.addEventListener("click", () => toggle(true));
  backdrop.addEventListener("click", () => toggle(false));
  document.getElementById("mSetupClose").addEventListener("click", () => toggle(false));
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.os)));
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    installBtn.hidden = true;
    toggle(false);
  });
})();



