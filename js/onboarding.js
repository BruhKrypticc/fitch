// Onboarding guide generator: fills templates/onboarding-template.html with a school's name and join code.
const TEMPLATE_URL = "templates/onboarding-template.html";
const LOGO_URL = "image/fitchLogo.png";
const BRAND_GREEN = "#275747";
const CODE_PATTERN = /^[A-Z0-9]{5}$/;
const HTML2CANVAS_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

// Replaces every {{key}} with its escaped value; unknown placeholders are left untouched.
export function fillTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.hasOwn(values, key) ? escapeHtml(values[key]) : match);
}

// The logo asset is cream on transparent; repaint it in brand green and inline it as a data URL.
async function loadGreenLogo() {
  const response = await fetch(LOGO_URL);
  if (!response.ok) throw new Error("Could not load the Fitch logo.");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = BRAND_GREEN;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function renderOnboardingGuide({ schoolName, schoolCode }) {
  const code = String(schoolCode || "").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new Error("The school code is not available yet.");
  const [response, logoSrc] = await Promise.all([fetch(TEMPLATE_URL, { cache: "no-cache" }), loadGreenLogo()]);
  if (!response.ok) throw new Error(`Could not load the onboarding template (${response.status}).`);
  const html = fillTemplate(await response.text(), {
    schoolName: String(schoolName || "").trim() || "your school",
    schoolCode: code,
    logoSrc
  });
  return { html, code };
}

export async function openOnboardingGuide(school) {
  const { html } = await renderOnboardingGuide(school);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function loadScript(src, isReady) {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the PDF tool. Check your connection and try again."));
    document.head.append(script);
  });
}

// Candidate page-break positions (bottom edges of blocks, in CSS px relative to the guide).
function breakPoints(guide) {
  const top = guide.getBoundingClientRect().top;
  return [...guide.querySelectorAll(":scope > *, li, .card")]
    .map((node) => node.getBoundingClientRect().bottom - top)
    .sort((a, b) => a - b);
}

// Renders the guide inside an isolated iframe (so the site's CSS can't interfere), then saves a PDF.
export async function downloadOnboardingGuide(school) {
  const [{ html, code }] = await Promise.all([
    renderOnboardingGuide(school),
    loadScript(HTML2CANVAS_URL, () => window.html2canvas),
    loadScript(JSPDF_URL, () => window.jspdf)
  ]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;";
  document.body.append(frame);
  try {
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = html; });
    const doc = frame.contentDocument;
    await Promise.all([
      doc.fonts.load(`700 34px "DM Sans"`, code),
      doc.fonts.load(`400 14px "DM Sans"`)
    ]).catch(() => {});
    await doc.fonts.ready;
    // html2canvas fails to paint the text inside the code box, so draw the label and code onto
    // a canvas ourselves and swap in the image (images capture reliably).
    const codeBox = doc.querySelector(".code-box");
    if (codeBox) {
      const dpr = 3;
      const width = 260;
      const height = 74;
      const art = doc.createElement("canvas");
      art.width = width * dpr;
      art.height = height * dpr;
      const ctx = art.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#275747";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 11px "DM Sans", system-ui, sans-serif`;
      ctx.fillText("YOUR SCHOOL CODE", width / 2, 16);
      ctx.font = `700 34px "DM Sans", system-ui, sans-serif`;
      const gap = 10;
      const widths = [...code].map((char) => ctx.measureText(char).width);
      let x = (width - (widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1))) / 2;
      ctx.textAlign = "left";
      [...code].forEach((char, i) => {
        ctx.fillText(char, x, 60);
        x += widths[i] + gap;
      });
      const img = doc.createElement("img");
      img.src = art.toDataURL("image/png");
      img.style.cssText = `display:block;width:${width}px;height:${height}px;`;
      await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; codeBox.replaceChildren(img); });
      codeBox.style.padding = "6px 14px";
    }
    const flatten = doc.createElement("style");
    // html2canvas can't measure the variable Bricolage font (words collapse together), so the
    // capture uses DM Sans for every element.
    flatten.textContent = "* { font-family: 'DM Sans', system-ui, sans-serif !important; letter-spacing: 0 !important; word-spacing: normal !important; font-optical-sizing: none !important; font-kerning: none !important; font-variation-settings: normal !important; } h1, h2, h3, .brand-name { font-weight: 700 !important; }";
    doc.head.append(flatten);
    doc.querySelector(".no-print")?.remove();
    doc.body.style.cssText = "margin:0;padding:0;background:#fff;";
    const guide = doc.querySelector(".guide");
    guide.style.cssText = "max-width:none;width:760px;margin:0;border:0;border-radius:0;box-shadow:none;";

    const scale = 2;
    const canvas = await window.html2canvas(guide, { scale, backgroundColor: "#ffffff", useCORS: true, windowWidth: 820 });
    const points = breakPoints(guide).map((y) => y * scale);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
    const margin = 12;
    const imgWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageHeightPx = Math.floor(((pdf.internal.pageSize.getHeight() - margin * 2) * canvas.width) / imgWidth);

    let y = 0;
    let first = true;
    while (y < canvas.height - 1) {
      let end = Math.min(y + pageHeightPx, canvas.height);
      if (end < canvas.height) {
        const safe = points.filter((point) => point > y + pageHeightPx * 0.5 && point <= end).pop();
        if (safe) end = Math.floor(safe);
      }
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = end - y;
      const ctx = slice.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgWidth, (slice.height * imgWidth) / slice.width);
      first = false;
      y = end;
    }
    pdf.save(`fitch-onboarding-${code}.pdf`);
  } finally {
    frame.remove();
  }
}