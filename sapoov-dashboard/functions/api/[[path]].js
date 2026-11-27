import identityWorker from "../../src/index.js";

export async function onRequest(context) {
  return identityWorker.fetch(context.request, context.env);
}
