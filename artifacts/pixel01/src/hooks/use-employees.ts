import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { EmployeePermissions } from "./use-current-employee";

export const EMPLOYEE_LIMIT = 10;

export function useEmployees() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["employees", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("employees" as any)
        .select("*", { count: "exact" })
        .eq("admin_id", user!.id);
      if (error) throw error;
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
  });
}

export function useUpdateEmployeePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: EmployeePermissions }) => {
      const { error } = await (supabase.from("employees" as any) as any)
        .update({ permissions })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["current_employee"] });
      toast.success("تم تحديث الصلاحيات");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
