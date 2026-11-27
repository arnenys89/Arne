const routes = {
  "/api/user-management/me": "/api/me",
  "/api/me": "/api/me",
  "/api/user-management/users": "/api/admin/users",
  "/api/user-management/applications": "/api/admin/applications",
  "/api/user-management/roles": "/api/admin/roles",
  "/api/user-management/assignments": "/api/admin/assignments",
  "/api/user-management/audit": "/api/admin/audit"
};

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetPath = routes[url.pathname] ||
    (url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/access/') ||
     url.pathname.startsWith('/api/professionalisering/') || url.pathname.startsWith('/api/werkplekreservatie/')
      ? url.pathname : null);
  if (!targetPath) return new Response("Not found", { status: 404 });

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    return Response.json({ error: "Cloudflare Access-aanmelding vereist." }, { status: 401 });
  }

  const headers = new Headers();
  headers.set("Cf-Access-Jwt-Assertion", token);
  const delegatedToken = request.headers.get("x-sapoov-access-jwt");
  if (delegatedToken) headers.set("x-sapoov-access-jwt", delegatedToken);
  const referer = request.headers.get("referer");
  if (referer) headers.set("referer", referer);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const target = "https://sapoov-identity-api.arne-nys.workers.dev" + targetPath + url.search;
  return fetch(target, init);
}
