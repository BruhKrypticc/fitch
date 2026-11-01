const eyebrow = document.querySelector(".landing-page .eyebrow-line");

if (eyebrow) {
  const phrases = [
    { lang: "en", text: "For everyone" },
    { lang: "es", text: "Para todos" },
    { lang: "ar", text: "للجميع" },
    { lang: "fr", text: "Pour tous" },
    { lang: "vi", text: "Dành cho mọi người" },
    { lang: "zh", text: "适合所有人" },
    { lang: "ht", text: "Pou tout moun" }
  ];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0;

  eyebrow.classList.add("eyebrow-line--rotating");
  // Screen readers get the stable English label instead of a changing one.
  eyebrow.setAttribute("aria-label", phrases[0].text);

  const showNext = () => {
    index = (index + 1) % phrases.length;
    const swap = () => {
      eyebrow.textContent = phrases[index].text;
      eyebrow.setAttribute("lang", phrases[index].lang);
      eyebrow.classList.remove("is-fading");
    };
    if (reducedMotion.matches) {
      swap();
    } else {
      eyebrow.classList.add("is-fading");
      setTimeout(swap, 350);
    }
  };

  setInterval(() => {
    if (!document.hidden) showNext();
  }, 2600);
}
