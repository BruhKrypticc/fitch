export function toGoogleCalendarEmbedUrl(value) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input) return null;

  const iframeSource = input.match(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  const source = iframeSource || input;
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      if (url.protocol !== "https:"
        || url.hostname !== "calendar.google.com"
        || url.pathname !== "/calendar/embed"
        || !url.searchParams.get("src")
        || url.username
        || url.password) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(source)) return null;
  const url = new URL("https://calendar.google.com/calendar/embed");
  url.searchParams.set("src", source);
  return url.toString();
}
