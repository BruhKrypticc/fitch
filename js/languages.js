export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "zh", label: "中文 (普通话)" },
  { code: "ht", label: "Kreyòl Ayisyen" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ru", label: "Русский" },
  { code: "ko", label: "한국어" },
  { code: "tl", label: "Tagalog" },
  { code: "so", label: "Soomaali" }
];

export const RTL_LANGUAGES = new Set(["ar"]);

export function parentLink(schoolId) {
  return `${location.origin}/parent?s=${encodeURIComponent(schoolId)}`;
}
