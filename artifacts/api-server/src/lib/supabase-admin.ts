import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerEnv, validateSupabaseServerEnv } from "./supabase-env.js";

function createAdminClient() {
  const issues = validateSupabaseServerEnv();
  if (issues.length) {
    throw new Error(
      `Missing or invalid server env: ${issues.join("; ")}. ` +
      "Local: copy .env.example → .env with keys from ONE Supabase project, then run `pnpm dev:all`. " +
      "Vercel: Settings → Environment Variables → set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY " +
      "(and VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY for the build — all from the same project), then redeploy.",
    );
  }

  const { url, serviceKey } = readSupabaseServerEnv();
  return createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let _admin: ReturnType<typeof createAdminClient> | undefined;

export function getSupabaseAdmin() {
  if (!_admin) _admin = createAdminClient();
  return _admin;
}

/** Verify a bearer JWT and return the user id, or throw if invalid. */
export async function verifyJwt(token: string): Promise<string> {
  const { url, anonKey } = readSupabaseServerEnv();
  if (!url || !anonKey) throw new Error("Supabase URL/anon key not configured");

  const { createClient: cc } = await import("@supabase/supabase-js");
  const client = cc(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired token");
  return data.user.id;
}

export { readSupabaseServerEnv, validateSupabaseServerEnv } from "./supabase-env.js";
