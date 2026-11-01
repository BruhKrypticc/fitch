// Cloudflare Worker: signs ImageKit upload requests. The private key lives only in
// the worker's secret store (IMAGEKIT_PRIVATE_KEY), never in browser code.
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5000"
];

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const extra = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = [...ALLOWED_ORIGINS, ...extra];
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

async function hmacSha1Hex(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 600;
    const signature = await hmacSha1Hex(env.IMAGEKIT_PRIVATE_KEY, token + expire);

    return new Response(
      JSON.stringify({ token, expire, signature, publicKey: env.IMAGEKIT_PUBLIC_KEY }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors } }
    );
  }
};
