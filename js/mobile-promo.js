(function () {
  if (/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent)) return;

  const style = document.createElement("style");
  style.textContent = `
    .mp-wrap { position: fixed; left: 16px; bottom: 24px; z-index: 900; font-family: var(--body-font, "DM Sans", system-ui, sans-serif); }
    .mp-wrap::before { content: ""; position: absolute; left: -8px; bottom: -8px; width: 72px; height: 72px; }
    .mp-wrap:hover::before, .mp-wrap:focus-within::before { width: 380px; height: 220px; }
    .mp-wrap .mp-tab { position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; min-height: 0; margin: 0; padding: 0; border: 1px solid var(--line, #c9c2b6); border-radius: 999px !important; background: var(--surface, #fffdf8); color: var(--primary, #245847); cursor: pointer; box-shadow: 0 6px 20px rgba(28,44,39,.16) !important; transform: none !important; transition: background-color .25s ease, color .25s ease, box-shadow .25s ease; }
    .mp-wrap:hover .mp-tab, .mp-wrap:focus-within .mp-tab { background: var(--primary, #245847); color: var(--primary-contrast, #fff); border-color: var(--primary, #245847); box-shadow: 0 8px 24px rgba(28,44,39,.22) !important; }
    .mp-wrap .mp-tab:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary, #245847) 40%, white); outline-offset: 2px; }
    .mp-tab svg { width: 22px; height: 22px; }
    .mp-card { position: absolute; left: 0; bottom: 60px; width: 280px; padding: 18px; border-radius: 16px; background: var(--surface, #fffdf8); color: var(--ink, #1c2c27); font: 400 14px/1.5 var(--body-font, system-ui, sans-serif); border: 1px solid var(--line, #c9c2b6); box-shadow: 0 14px 36px rgba(28,44,39,.18); opacity: 0; visibility: hidden; pointer-events: none; transform: translate3d(0, 10px, 0) scale(.97); transform-origin: bottom left; transition: opacity .25s ease, transform .35s cubic-bezier(.22,.68,.24,1), visibility 0s linear .35s; }
    .mp-wrap:hover .mp-card, .mp-wrap:focus-within .mp-card { opacity: 1; visibility: visible; pointer-events: auto; transform: none; transition-delay: 0s; }
    .mp-card h3 { margin: 0 0 6px; font: 600 18px var(--heading-font, Georgia, serif); color: var(--ink, #1c2c27); }
    .mp-card h3 span { margin-left: 6px; padding: 2px 7px; border-radius: 999px; background: var(--primary, #245847); color: var(--primary-contrast, #fff); font: 700 10px var(--body-font, system-ui, sans-serif); letter-spacing: .06em; vertical-align: 3px; }
    .mp-card p { margin: 0 0 10px; color: var(--muted, #65736c); }
    .mp-card code { display: block; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line, #c9c2b6); background: var(--paper, #f4efe4); font: 500 13px var(--body-font, system-ui, sans-serif); word-break: break-all; user-select: all; }
    @media (prefers-reduced-motion: reduce) { .mp-card, .mp-wrap .mp-tab { transition: none; } }
    @media (max-width: 700px) { .mp-wrap { display: none; } }
  `;
  document.head.appendChild(style);

  const url = new URL("mobile", location.href).href.replace(/\.html$/, "");
  const wrap = document.createElement("div");
  wrap.className = "mp-wrap";
  wrap.innerHTML = `
    <div class="mp-card" role="tooltip" id="mpCard">
      <h3>Mobile web app <span>NEW</span></h3>
      <p>Open Fitch on your phone and follow the instructions to set it up as an app.</p>
      <code></code>
    </div>
    <button class="mp-tab" type="button" aria-describedby="mpCard" aria-label="Mobile web app (new)">
      
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>
    </button>`;
  wrap.querySelector("code").textContent = url;
  document.body.appendChild(wrap);
})();
