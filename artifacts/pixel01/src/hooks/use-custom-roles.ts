import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { toast } from "sonner";

export function useCustomRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["custom_roles"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_roles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCustomRole() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string }) => {
      const { error } = await (supabase.from("custom_roles") as any)
        .insert({ ...values, owner_id: requireOwnerId(ownerId) });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_roles"] });
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCustomRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_roles"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
