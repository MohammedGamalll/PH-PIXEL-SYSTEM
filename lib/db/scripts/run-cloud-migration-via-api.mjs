import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "./load-env.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_REF || "idtygsydzixnswntbign";

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set — cannot run cloud SQL via Management API.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "../../../docs/supabase-session-standalone-returns.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("--"));

for (const statement of statements) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: statement }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("Failed:", statement.slice(0, 80), body);
    process.exit(1);
  }
  console.log("OK:", statement.split("\n")[0].slice(0, 80));
}

console.log("Cloud migration via Management API complete.");
