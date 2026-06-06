import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { toast } from "sonner";

export type Promotion = {
  id: string;
  owner_id: string;
  name: string;
  product_ids: string[];
  brand_id: string | null;
  category_id: string | null;
  discount_type: "fixed" | "percent";
  amount: number;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};

export function usePromotions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["promotional_discounts"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("promotional_discounts" as any) as any)
        .select("*")
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Promotion[];
    },
  });
}

export function useUpsertPromotion() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<Promotion, "owner_id"> & { id?: string }) => {
      const { id, ...rest } = p;
      if (id) {
        const { error } = await (supabase.from("promotional_discounts" as any) as any)
          .update(rest).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await (supabase.from("promotional_discounts" as any) as any)
        .insert({ ...rest, owner_id: requireOwnerId(ownerId) })
        .select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotional_discounts"] });
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("promotional_discounts" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotional_discounts"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
