import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { readSupabaseServerEnv, validateSupabaseServerEnv } from "../lib/supabase-env.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Safe env diagnostic for Vercel — no secrets, only project refs and missing vars. */
router.get("/healthz/env", (_req, res) => {
  const { urlRef, serviceRef, anonRef } = readSupabaseServerEnv();
  const issues = validateSupabaseServerEnv();
  res.json({
    ok: issues.length === 0,
    runtime: process.env.VERCEL ? "vercel" : "node",
    projects: { url: urlRef, serviceRole: serviceRef, publishable: anonRef },
    issues,
  });
});

export default router;
