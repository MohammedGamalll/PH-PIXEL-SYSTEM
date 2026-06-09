import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { listEmployeesSummary, updateEmployeePermissions } from "@/lib/employees.functions";
import { mergeEmployeePermissions } from "@/lib/permissions";

export const EMPLOYEE_LIMIT = 10;

export function useEmployees() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["employees", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const resp = await listEmployeesSummary();
      return {
        rows: (resp.rows ?? []) as any[],
        count: Number(resp.count ?? 0),
        branchName: resp.branchName ?? null,
      };
    },
  });
}

export function useUpdateEmployeePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      permissions,
      existingPermissions,
    }: {
      id: string;
      permissions: Record<string, any>;
      existingPermissions?: Record<string, unknown> | null;
    }) => {
      const merged = mergeEmployeePermissions(existingPermissions, permissions as any);
      await updateEmployeePermissions({ data: { id, permissions: merged } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
      qc.invalidateQueries({ queryKey: ["current_employee"] });
      toast.success("تم تحديث الصلاحيات");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
