import pg from "pg";
import "./load-env.mjs";
import { resolveDatabaseUrl } from "./load-env.mjs";

const cloudUrl = process.env.CLOUD_DATABASE_URL
  || (process.env.SUPABASE_DB_PASSWORD && process.env.VITE_SUPABASE_PROJECT_ID
    ? `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${process.env.VITE_SUPABASE_PROJECT_ID}.supabase.co:5432/postgres`
    : null);

if (!cloudUrl) {
  console.error("Set CLOUD_DATABASE_URL or SUPABASE_DB_PASSWORD + VITE_SUPABASE_PROJECT_ID for cloud migration.");
  process.exit(1);
}

process.env.DATABASE_URL = cloudUrl;
await import("./run-session-standalone-returns-migration.mjs");
