// Finch Gemini proxy. The API key lives only in the GEMINI_API_KEY secret.
const ALLOWED_PATH = "/v1beta/models/gemini-3.1-flash-lite:generateContent";
const MAX_BODY_BYTES = 64 * 1024;
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

function corsHeaders(origin, requestedHeaders) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Echo what the browser asks for so SDK versions that add headers don't fail preflight.
    "Access-Control-Allow-Headers": requestedHeaders || "Content-Type, x-goog-api-key, x-goog-api-client, x-goog-user-project",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!allowedOrigins(env).includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }
    const cors = corsHeaders(origin, request.headers.get("Access-Control-Request-Headers"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== ALLOWED_PATH) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return new Response("Payload too large", { status: 413, headers: cors });
    }

    const upstream = await fetch(`https://generativelanguage.googleapis.com${ALLOWED_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  },
};
