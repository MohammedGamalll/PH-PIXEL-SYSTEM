import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Returns a map of { user_id -> display name } for the current admin's employees
 * (plus the admin themselves). Used to render "Created by" columns.
 */
export function useEmployeesMap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["employees-map", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const displayName = (row: any) =>
        [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim()
        || row?.name
        || row?.email
        || "موظف";
      // Owner / admin
      const meta: any = user?.user_metadata ?? {};
      map[user!.id] =
        meta.full_name || meta.name || user!.email || "المالك";
      // Use RPC so employees can also see all of their teammates (RLS would otherwise
      // restrict employees to only their own row)
      const [{ data }, { data: deletedRows }, { data: activityRows }, { data: adminRows }] = await Promise.all([
        (supabase as any).rpc("get_admin_employees"),
        (supabase.from("soft_deletes" as any) as any)
          .select("entity_id, entity_label, snapshot, deleted_at")
          .eq("entity_type", "employee")
          .order("deleted_at", { ascending: false })
          .limit(2000),
        (supabase.from("employee_activity_log" as any) as any)
          .select("employee_id, actor_name, created_at")
          .not("employee_id", "is", null)
          .not("actor_name", "is", null)
          .order("created_at", { ascending: false })
          .limit(2000),
        (supabase as any).rpc("get_admin_profile"),
      ]);
      // Ensure the admin (owner) is in the map even when an employee is logged in
      for (const a of (adminRows ?? []) as any[]) {
        if (a?.id) map[a.id] = a.name || a.email || "المالك";
      }
      for (const rec of (deletedRows ?? []) as any[]) {
        const label = rec.entity_label || displayName(rec.snapshot);
        if (rec.entity_id && label) map[rec.entity_id] = label;
      }
      for (const rec of (activityRows ?? []) as any[]) {
        if (rec.employee_id && rec.actor_name && !map[rec.employee_id]) map[rec.employee_id] = rec.actor_name;
      }
      for (const e of (data ?? []) as any[]) {
        map[e.id] = displayName(e);
      }
      return map;
    },
  });
}
