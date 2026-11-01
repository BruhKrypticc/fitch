const landingMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const landingPage = document.querySelector(".landing-page");
const cornerLeaves = document.querySelectorAll(".corner-leaf");
const parallaxElements = [
  { element: cornerLeaves[0], speed: -0.12, limit: 150 },
  { element: cornerLeaves[1], speed: 0.16, limit: 190 },
  { element: document.querySelector(".botanical-ornament"), speed: 0.045, limit: 60 }
].filter(({ element }) => element);

if (landingPage) {
  landingPage.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;

      event.preventDefault();
      if (window.location.hash !== link.hash) {
        window.history.pushState(null, "", link.hash);
      }
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });
}

if (!landingMotionQuery.matches) {
  document.body.classList.add("motion-ready");

  const revealTargets = document.querySelectorAll([
    ".feature-card",
    ".features-heading",
    ".dashboard-page .dashboard-brand-bar",
    ".dashboard-page .dashboard-header",
    ".dashboard-page .school-tabs",
    ".dashboard-page .join-code-panel",
    ".dashboard-page .dashboard-panel",
    ".dashboard-page .student-content-section",
    ".dashboard-page .settings-page"
  ].join(", "));

  if (landingPage) landingPage.classList.add("motion-ready");

  const pendingReveals = new Set();
  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        pendingReveals.delete(entry.target);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -32px 0px" })
    : null;

  const revealIfVisible = (element) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top >= window.innerHeight) return;
    element.classList.add("is-visible");
    pendingReveals.delete(element);
    if (revealObserver) revealObserver.unobserve(element);
  };

  const observeReveal = (element) => {
    if (element.classList.contains("motion-reveal")) return;
    element.classList.add("motion-reveal");
    pendingReveals.add(element);
    if (revealObserver) revealObserver.observe(element);
    revealIfVisible(element);
  };

  revealTargets.forEach(observeReveal);

  let revealCheckRequested = false;
  const checkVisibleReveals = () => {
    pendingReveals.forEach(revealIfVisible);
    revealCheckRequested = false;
  };

  const scheduleRevealCheck = () => {
    if (revealCheckRequested) return;
    revealCheckRequested = true;
    window.requestAnimationFrame(checkVisibleReveals);
  };

  window.addEventListener("scroll", scheduleRevealCheck, { passive: true });
  window.addEventListener("resize", scheduleRevealCheck);

  const dynamicContent = document.querySelectorAll(
    ".announcement-list, .qa-list, .photo-feed-container, .saved-schools-list"
  );
  const animatedContentSelector = [
    ".announcement-card",
    ".qa-card",
    ".photo-post-card",
    ".saved-school-button",
    ".officer-row",
    ".invitation-row"
  ].join(", ");

  const observeDynamicContent = (node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(animatedContentSelector)) observeReveal(node);
    node.querySelectorAll(animatedContentSelector).forEach(observeReveal);
  };

  dynamicContent.forEach((container) => {
    container.querySelectorAll(animatedContentSelector).forEach(observeReveal);
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(observeDynamicContent);
      });
    }).observe(container, { childList: true, subtree: true });
  });

  if (landingPage) {
    let frameRequested = false;
    const updateLeafParallax = () => {
      const scrollOffset = Math.min(window.scrollY, 1400);
      parallaxElements.forEach(({ element, speed, limit }) => {
        const offset = Math.max(-limit, Math.min(limit, scrollOffset * speed));
        element.style.setProperty("--parallax-y", `${offset}px`);
      });
      frameRequested = false;
    };

    window.addEventListener("scroll", () => {
      if (frameRequested) return;
      frameRequested = true;
      window.requestAnimationFrame(updateLeafParallax);
    }, { passive: true });

    updateLeafParallax();
  }
}

const howSection = document.querySelector(".how-section");
if (howSection) {
  const steps = [...howSection.querySelectorAll(".how-steps li")];
  const segments = [...howSection.querySelectorAll(".how-progress span")];
  const preview = howSection.querySelector(".how-preview");
  const typed = howSection.querySelector(".how-typed");
  const mockBtn = howSection.querySelector(".how-mock-btn");
  const code = howSection.querySelector(".how-code");
  const copied = howSection.querySelector(".how-copied");
  const avatars = [...howSection.querySelectorAll(".how-avatars i")];
  const feedItems = [...howSection.querySelectorAll(".how-feed li")];
  const tabs = [...howSection.querySelectorAll(".how-tab")];
  const dashTitle = howSection.querySelector(".how-dash-title");
  const joinedN = howSection.querySelector(".how-joined-n");
  const count = howSection.querySelector(".how-count b");
  const stepLabel = howSection.querySelector(".how-preview-step");
  const schoolName = "Fitchburg High School";
  const joinCode = code ? code.dataset.code : "";
  const mobileQuery = window.matchMedia("(max-width: 767px)");
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let howFrame = false;

  const updateHow = () => {
    howFrame = false;
    if (mobileQuery.matches) {
      howSection.style.setProperty("--how-grow", "1");
      return;
    }
    const rect = howSection.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    const p = clamp(range > 0 ? -rect.top / range : 0);
    const index = Math.min(steps.length - 1, Math.floor(p * steps.length));
    const t = clamp(p * steps.length - index);

    steps.forEach((step, i) => step.classList.toggle("is-active", i === index));
    segments.forEach((seg, i) => {
      const fill = clamp(p * steps.length - i);
      seg.style.setProperty("--fill", fill.toFixed(3));
      seg.classList.toggle("is-full", fill >= 0.999);
    });
    if (preview) preview.dataset.active = String(index);
    if (count) count.textContent = "0" + (index + 1);
    if (stepLabel) stepLabel.textContent = "Step " + (index + 1) + " of 3";

    const typedChars = index > 0 ? schoolName.length : Math.round(clamp(t / 0.75) * schoolName.length);
    if (typed) typed.textContent = schoolName.slice(0, typedChars);
    if (mockBtn) {
      mockBtn.classList.toggle("is-ready", index > 0 || t > 0.8);
      mockBtn.classList.toggle("is-aiming", index === 0 && t > 0.6);
      mockBtn.classList.toggle("is-click", index === 0 && t > 0.88);
    }
    if (typed) typed.parentElement.classList.toggle("is-filled", index > 0 || t > 0.75);
    avatars.forEach((a, i) => a.classList.toggle("is-in", index === 2 && i < Math.ceil(clamp(t / 0.8) * avatars.length)));
    if (code) code.parentElement.classList.toggle("is-done", index > 1 || (index === 1 && t >= 0.5));
    preview.classList.toggle("is-party", index === 2 && t > 0.8);

    const codeChars = index > 1 ? joinCode.length : index === 1 ? Math.round(clamp(t / 0.5) * joinCode.length) : 0;
    if (code) code.textContent = joinCode.slice(0, codeChars) + "•".repeat(joinCode.length - codeChars);
    if (copied) copied.classList.toggle("is-on", index === 1 && t > 0.7);

    const shown = index === 2 ? Math.min(feedItems.length, 1 + Math.floor(t * 3)) : 0;
    feedItems.forEach((item, i) => item.classList.toggle("is-in", i < shown));
    tabs.forEach((tab, i) => tab.classList.toggle("is-on", i === Math.max(0, shown - 1)));
    if (dashTitle) dashTitle.textContent = schoolName;
    howSection.style.setProperty("--how-sway", (p * 14 - 4).toFixed(2) + "deg");
    howSection.style.setProperty("--how-grow", p.toFixed(3));
    if (joinedN) joinedN.textContent = String(index === 2 ? Math.round(clamp(t / 0.8) * 128) : 0);
  };

  const requestHow = () => {
    if (howFrame) return;
    howFrame = true;
    window.requestAnimationFrame(updateHow);
  };

  window.addEventListener("scroll", requestHow, { passive: true });
  window.addEventListener("resize", requestHow);

  if ("IntersectionObserver" in window) {
    const stepObserver = new IntersectionObserver((entries) => {
      if (!mobileQuery.matches) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-active");
      });
    }, { threshold: 0.3 });
    steps.forEach((step) => stepObserver.observe(step));
  }

  updateHow();
}