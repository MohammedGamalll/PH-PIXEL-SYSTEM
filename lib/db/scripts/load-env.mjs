import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

const ENV_FILES = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, "artifacts/pixel01/.env"),
  path.join(repoRoot, "../PH-PIXEL SYSTEM/.env"),
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

for (const f of ENV_FILES) parseEnvFile(f);

export function resolveDatabaseUrl(preferNew = false) {
  const candidates = preferNew
    ? ["NEW_DATABASE_URL", "DATABASE_URL", "OLD_DATABASE_URL"]
    : ["DATABASE_URL", "NEW_DATABASE_URL", "OLD_DATABASE_URL"];

  for (const key of candidates) {
    const val = process.env[key];
    if (val) return { url: val, source: key };
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_REF;
  if (password && ref) {
    const host = process.env.SUPABASE_DB_HOST || `db.${ref}.supabase.co`;
    const port = process.env.SUPABASE_DB_PORT || "5432";
    const user = process.env.SUPABASE_DB_USER || "postgres";
    const db = process.env.SUPABASE_DB_NAME || "postgres";
    return {
      url: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`,
      source: "constructed from SUPABASE_DB_PASSWORD",
    };
  }

  return { url: null, source: null };
}
