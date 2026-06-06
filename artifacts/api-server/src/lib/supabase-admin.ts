import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
      "Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as Replit secrets."
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
