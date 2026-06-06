import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { toast } from "sonner";

export function useCustomerGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["customer_groups"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCustomerGroup() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const { error } = await (supabase.from("customer_groups") as any)
        .insert({ ...values, owner_id: requireOwnerId(ownerId) });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_groups"] });
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCustomerGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: cErr } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("customer_group_id", id);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        throw new Error(`لا يمكن حذف مجموعة العملاء لأنها مستخدمة مع ${count} جهة اتصال`);
      }
      const { error } = await supabase.from("customer_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_groups"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
