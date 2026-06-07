const serverless = require("serverless-http");

const APP_MODULE = "../artifacts/api-server/dist/app.mjs";

/** @type {ReturnType<typeof serverless> | null} */
let cachedHandler = null;

async function getHandler() {
  if (cachedHandler) return cachedHandler;
  const mod = await import(APP_MODULE);
  cachedHandler = serverless(mod.default);
  return cachedHandler;
}

/** @type {import("@vercel/node").VercelApiHandler} */
module.exports = async function handler(req, res) {
  try {
    const h = await getHandler();
    return h(req, res);
  } catch (err) {
    console.error("API handler error:", err);
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
};
