const UPSTREAM = "https://classid.io";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/health") return json({ ok: true, service: "sapo-doelennetwerk" });
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.SAPO_API_KEY) return json({ error: "Worker secret SAPO_API_KEY ontbreekt." }, 500);
    if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
    const allowed = url.pathname === "/api/leerplannen/list" || /^\/api\/leerplannen\/[^/]+$/.test(url.pathname) || url.pathname === "/api/leerplannen/selection";
    if (!allowed) return json({ error: "Not found" }, 404);
    const headers = new Headers({ "api-key": env.SAPO_API_KEY, "Accept": "application/json" });
    let body;
    if (request.method === "POST") {
      headers.set("Content-Type", "application/json"); body = await request.text();
      try { JSON.parse(body); } catch { return json({ error: "Ongeldige JSON-body" }, 400); }
    }
    try {
      const upstream = await fetch(UPSTREAM + url.pathname, { method: request.method, headers, body, signal: AbortSignal.timeout(30000) });
      return new Response(await upstream.text(), { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
    } catch (error) { return json({ error: "SAPO API tijdelijk niet bereikbaar", detail: error.message }, 502); }
  }
};