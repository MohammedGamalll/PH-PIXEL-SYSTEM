import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const missing = [
      !url && "SUPABASE_URL (or VITE_SUPABASE_URL)",
      !key && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean).join(", ");
    throw new Error(
      `Missing server env: ${missing}. ` +
      "Local: copy .env.example → .env, add SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard → Settings → API, then run `pnpm dev:all`. " +
      "Vercel: Project Settings → Environment Variables → add SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY (not VITE_*), then redeploy."
    );
  }

  return createClient(url, key, {
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
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
