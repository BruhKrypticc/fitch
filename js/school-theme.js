const schoolFonts = {
  "DM Sans": "'DM Sans', sans-serif",
  Inter: "Inter, sans-serif",
  Manrope: "Manrope, sans-serif",
  "Comic Sans MS": "'Comic Sans MS', 'Comic Sans', cursive",
  Arial: "Arial, sans-serif",
  Georgia: "Georgia, serif",
  "Times New Roman": "'Times New Roman', serif"
};

export function applySchoolTheme(theme = {}) {
  if (!theme || typeof theme !== "object") theme = {};
  const root = document.documentElement;
  const primaryColor = typeof theme.primaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(theme.primaryColor)
    ? theme.primaryColor
    : "#245847";
  const fontFamily = schoolFonts[theme.fontFamily] || schoolFonts["DM Sans"];
  const rgb = primaryColor.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16));
  const toColor = (factor) => `#${rgb.map((channel) =>
    Math.round(channel * factor).toString(16).padStart(2, "0")
  ).join("")}`;
  const luminance = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);

  root.style.setProperty("--primary", primaryColor);
  root.style.setProperty("--primary-dark", toColor(0.72));
  root.style.setProperty("--primary-contrast", luminance > 0.179 ? "#1c2c27" : "#ffffff");
  root.style.setProperty("--body-font", fontFamily);
  root.style.setProperty("--heading-font", fontFamily);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", primaryColor);
}

export function applySchoolLogo(logoUrl) {
  const fallbackLogo = "image/fitchLogo.png";
  const source = typeof logoUrl === "string" && logoUrl.trim() ? logoUrl : fallbackLogo;
  document.querySelectorAll(".dashboard-brand-bar .brand-logo, .school-loading-screen .loading-mark").forEach((image) => {
    image.onerror = () => {
      image.onerror = null;
      image.src = fallbackLogo;
    };
    image.src = source;
  });
}
