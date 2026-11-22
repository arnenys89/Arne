import bestelplatform from "./index.js";

/**
 * Runtime adapter for the SAPOOV Worker deployment.
 *
 * The existing API implementation is kept isolated in index.js while the
 * central Worker receives dedicated bindings. This adapter intentionally
 * does not create or migrate databases; it only maps bindings at runtime.
 */
export default {
  async fetch(request, env, ctx) {
    const adaptedEnv = new Proxy(env, {
      get(target, key, receiver) {
        if (key === "DB") return target.BESTEL_DB;
        if (key === "IMAGES") return target.BESTEL_IMAGES;
        return Reflect.get(target, key, receiver);
      }
    });
    if (!adaptedEnv.DB || !adaptedEnv.IMAGES) {
      return new Response(JSON.stringify({
        error: "De centrale Bestelplatform-databindingen zijn nog niet geconfigureerd."
      }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
    }
    return bestelplatform.fetch(request, adaptedEnv, ctx);
  }
};
