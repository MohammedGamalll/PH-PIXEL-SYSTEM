/** Extract Supabase project ref from URL or JWT (no secrets logged). */
export function projectRefFromSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export function projectRefFromJwt(key: string | undefined): string | null {
  if (!key) return null;
  const parts = key.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const ref = payload.ref ?? payload.project_id;
    return ref ? String(ref).toLowerCase() : null;
  } catch {
    return null;
  }
}

export function readSupabaseServerEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const urlRef = projectRefFromSupabaseUrl(url);
  const serviceRef = projectRefFromJwt(serviceKey);
  const anonRef = projectRefFromJwt(anonKey);
  return { url, serviceKey, anonKey, urlRef, serviceRef, anonRef };
}

export function validateSupabaseServerEnv(): string[] {
  const { url, serviceKey, anonKey, urlRef, serviceRef, anonRef } = readSupabaseServerEnv();
  const issues: string[] = [];
  if (!url) issues.push("SUPABASE_URL (or VITE_SUPABASE_URL) is missing");
  if (!serviceKey) issues.push("SUPABASE_SERVICE_ROLE_KEY is missing");
  if (!anonKey) issues.push("SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) is missing");
  if (urlRef && serviceRef && urlRef !== serviceRef) {
    issues.push(
      `SUPABASE_URL project (${urlRef}) does not match service_role key project (${serviceRef}) — use keys from the same Supabase project`,
    );
  }
  if (urlRef && anonRef && urlRef !== anonRef) {
    issues.push(
      `SUPABASE_URL project (${urlRef}) does not match anon/publishable key project (${anonRef})`,
    );
  }
  return issues;
}
