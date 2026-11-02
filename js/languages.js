// Languages offered for family-facing pages. `speech` is the BCP 47 tag used for read-aloud.
export const LANGUAGES = [
  { code: "en", label: "English", speech: "en-US" },
  { code: "es", label: "Español", speech: "es-ES" },
  { code: "pt", label: "Português", speech: "pt-BR" },
  { code: "fr", label: "Français", speech: "fr-FR" },
  { code: "vi", label: "Tiếng Việt", speech: "vi-VN" },
  { code: "zh", label: "中文 (普通话)", speech: "zh-CN" },
  { code: "ht", label: "Kreyòl Ayisyen", speech: "ht-HT" },
  { code: "ar", label: "العربية", speech: "ar-SA" },
  { code: "hi", label: "हिन्दी", speech: "hi-IN" },
  { code: "ru", label: "Русский", speech: "ru-RU" },
  { code: "ko", label: "한국어", speech: "ko-KR" },
  { code: "tl", label: "Tagalog", speech: "fil-PH" },
  { code: "so", label: "Soomaali", speech: "so-SO" }
];

export const RTL_LANGUAGES = new Set(["ar"]);

export function parentLink(schoolId) {
  return `${location.origin}/parent?s=${encodeURIComponent(schoolId)}`;
}
