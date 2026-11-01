// Finch moderation proxy. The key lives only in the OPENAI_API_KEY secret.
// Calls OpenAI's free omni-moderation-latest endpoint and returns only { flagged }.
const MODEL = "omni-moderation-latest";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_TEXTS = 12;
const MAX_TEXT_CHARS = 4000;
const DEFAULT_ORIGINS = [
  "https://fitch-6393c.web.app",
  "https://fitch-6393c.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:5000",
];

function allowedOrigins(env) {
  const extra = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

// OpenAI's moderation ignores bare profanity, so a school-appropriate blocklist runs first.
// Each letter allows repeats (fuuuck) and common leetspeak is normalized before matching.
const PREFIX_WORDS = ["fuck", "motherfuck", "shit", "bullshit", "horseshit", "bitch", "bastard", "cunt", "asshole", "dumbass", "jackass", "nigg", "faggot", "wtf", "stfu"];
const EXACT_WORDS = ["dick", "dicks", "dickhead", "pussy", "slut", "sluts", "whore", "whores", "retard", "retarded", "cock", "cocks", "cum", "tits", "twat", "wanker", "milf"];
const loose = (word) => word.split("").map((c) => `${c}+`).join("[^a-z0-9]?");
const PROFANITY = new RegExp(
  `(?:^|[^a-z0-9])(?:(?:${PREFIX_WORDS.map(loose).join("|")})[a-z]*|(?:${EXACT_WORDS.map(loose).join("|")}))(?![a-z0-9])`
);
const LEET = { "@": "a", "4": "a", "$": "s", "5": "s", "0": "o", "1": "i", "!": "i", "3": "e", "7": "t" };

function hasProfanity(text) {
  const normalized = text.toLowerCase().replace(/[@4$50!137]/g, (c) => LEET[c]);
  return PROFANITY.test(normalized);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!allowedOrigins(env).includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/") {
      return json({ error: "Not found" }, 404, cors);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413, cors);

    let texts;
    try {
      texts = JSON.parse(raw).texts;
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    if (!Array.isArray(texts) || texts.length > MAX_TEXTS || !texts.every((t) => typeof t === "string")) {
      return json({ error: "Expected { texts: string[] }" }, 400, cors);
    }
    const input = texts.map((t) => t.trim().slice(0, MAX_TEXT_CHARS)).filter(Boolean);
    if (!input.length) return json({ flagged: false }, 200, cors);
    if (input.some(hasProfanity)) return json({ flagged: true }, 200, cors);

    if (!env.OPENAI_API_KEY) return json({ error: "Moderation is not configured" }, 503, cors);
    let upstream;
    try {
      upstream = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: MODEL, input }),
      });
    } catch {
      return json({ error: "Moderation unavailable" }, 502, cors);
    }
    if (!upstream.ok) return json({ error: "Moderation unavailable" }, 502, cors);

    const data = await upstream.json();
    const flagged = Array.isArray(data.results) && data.results.some((r) => r.flagged === true);
    return json({ flagged }, 200, cors);
  },
};
