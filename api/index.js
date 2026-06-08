const APP_MODULE = "../artifacts/api-server/dist/app.mjs";

/** @type {import("express").Express | null} */
let cachedApp = null;

async function getApp() {
  if (cachedApp) return cachedApp;
  const mod = await import(APP_MODULE);
  cachedApp = mod.default;
  return cachedApp;
}

/** @type {import("@vercel/node").VercelApiHandler} */
module.exports = async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error("API handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  }
};
