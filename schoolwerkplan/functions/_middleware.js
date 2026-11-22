const LOGOUT_URL = "https://sapoov.cloudflareaccess.com/cdn-cgi/access/logout";

function getProfilePicture(request) {
  try {
    const token = request.headers.get("Cf-Access-Jwt-Assertion") || "";
    const payload = token.split(".")[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    const candidate =
      typeof claims.oidc_fields?.picture === "string" ? claims.oidc_fields.picture :
      typeof claims.picture === "string" ? claims.picture :
      typeof claims.custom?.picture === "string" ? claims.custom.picture : "";
    const photo = new URL(candidate);
    const host = photo.hostname.toLowerCase();
    if (photo.protocol !== "https:") return "";
    if (host !== "googleusercontent.com" && !host.endsWith(".googleusercontent.com") &&
        host !== "microsoft.com" && !host.endsWith(".microsoft.com")) return "";
    return photo.href;
  } catch {
    return "";
  }
}

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  const staticAsset = /\.(?:css|js|png|svg|jpg|jpeg|webp|ico|woff2?|map)$/i.test(pathname);
  if (!staticAsset) {
    const assertion = context.request.headers.get("Cf-Access-Jwt-Assertion") || "";
    if (!assertion) return new Response("Aanmelden via de beveiligde schoolomgeving is vereist.", { status: 401 });
    let accessResponse;
    try {
      accessResponse = await fetch("https://sapoov-identity-api.arne-nys.workers.dev/api/access/schoolwerkplan", {
        headers: { "Cf-Access-Jwt-Assertion": assertion }
      });
    } catch {
      return new Response("De centrale SAPOOV-rechtenservice is tijdelijk niet bereikbaar.", { status: 503 });
    }
    const access = await accessResponse.json().catch(() => ({}));
    if (!accessResponse.ok || !access.authorized) {
      return new Response(access.error || "Je hebt geen centrale toegang tot deze toepassing.", { status: 403 });
    }
  }
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  const email = context.request.headers.get("Cf-Access-Authenticated-User-Email") || "";
  if (!email || !contentType.toLowerCase().includes("text/html")) return response;

  const safe = email.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const picture = getProfilePicture(context.request);
  const safePicture = picture.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const avatar = safePicture
    ? '<img src="' + safePicture + '" alt="" referrerpolicy="no-referrer">'
    : "A";
  const account = `
<style>
#sapoov-account{position:fixed;z-index:2147483000;top:12px;right:18px;font:13px/1.4 Arial,sans-serif;color:#222}
#sapoov-account details{position:relative}
#sapoov-account summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #dedede;border-radius:24px;padding:6px 12px 6px 7px;box-shadow:0 2px 8px #0002;max-width:min(360px,calc(100vw - 32px))}
#sapoov-account summary::-webkit-details-marker{display:none}
#sapoov-account .sa-avatar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#d7ad01;font-weight:700;flex:none;overflow:hidden}
#sapoov-account .sa-avatar img{width:30px;height:30px;object-fit:cover;display:block}
#sapoov-account .sa-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px}
#sapoov-account .sa-menu{position:absolute;right:0;top:43px;width:290px;background:#fff;border:1px solid #dedede;border-radius:10px;box-shadow:0 8px 28px #0002;padding:15px}
#sapoov-account .sa-title{font-weight:700;margin-bottom:10px}
#sapoov-account .sa-label{font-size:11px;color:#777;margin-bottom:3px}
#sapoov-account .sa-value{overflow-wrap:anywhere;margin-bottom:14px}
#sapoov-account .sa-logout{display:block;text-decoration:none;text-align:center;background:#d7ad01;color:#171717;font-weight:700;padding:10px;border-radius:7px}
@media(max-width:600px){#sapoov-account{top:8px;right:8px}#sapoov-account .sa-email{max-width:145px}#sapoov-account .sa-menu{width:min(290px,calc(100vw - 16px))}}
</style>
<div id="sapoov-account"><details><summary><span class="sa-avatar">${avatar}</span><span class="sa-email">${safe}</span><span aria-hidden="true">⌄</span></summary><div class="sa-menu"><div class="sa-title">Gebruikersaccount</div><div class="sa-label">Aangemeld via Google</div><div class="sa-value">${safe}</div><a class="sa-logout" href="${LOGOUT_URL}">Uitloggen op alle SAPOOV-platformen</a></div></details></div>`;
  const html = await response.text();
  const updated = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, account + "</body>") : html + account;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(updated, { status: response.status, statusText: response.statusText, headers });
}
