// Server-only client — not available in client-only build
// All operations that previously used supabaseAdmin now use the regular supabase client with RLS
export const supabaseAdmin = null as any;
