import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Resolves the effective owner_id for the current session.
 * - If user is an employee (exists in `employees` table) → returns admin_id
 * - Otherwise (admin themselves) → returns user.id
 *
 * Cached forever per user. Used everywhere we insert/filter by owner_id
 * so employees write rows under their admin's namespace (matching RLS).
 */
export function useOwnerId(): string | undefined {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["owner-id", user?.id],
    enabled: !!user,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const { data } = await (supabase.from("employees") as any)
        .select("admin_id")
        .eq("id", user!.id)
        .maybeSingle();
      return (data as any)?.admin_id ?? user!.id;
    },
  });
  return data as string | undefined;
}
