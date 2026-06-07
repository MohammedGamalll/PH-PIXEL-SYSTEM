import type { VercelRequest, VercelResponse } from "@vercel/node";
import serverless from "serverless-http";

type ServerlessHandler = ReturnType<typeof serverless>;

let cachedHandler: ServerlessHandler | null = null;

async function getHandler(): Promise<ServerlessHandler> {
  if (cachedHandler) return cachedHandler;
  const { default: app } = await import("../artifacts/api-server/dist/app.mjs");
  cachedHandler = serverless(app);
  return cachedHandler;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const h = await getHandler();
    return h(req, res);
  } catch (err: any) {
    console.error("API handler error:", err);
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
