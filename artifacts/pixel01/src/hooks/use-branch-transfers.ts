import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { toast } from "sonner";

export type BranchOption = { owner_id: string; display_name: string; email: string };

export type BranchTransferItemInput = {
  product_id: string;
  quantity: number;
  base_quantity?: number;
  unit_name?: string | null;
  expiry_date?: string | null;
};


export type BranchTransferInput = {
  target_owner_id: string;
  cash_value: number;
  notes?: string | null;
  items: BranchTransferItemInput[];
};


export function useAdminBranches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin-branches", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_admin_branches");
      if (error) throw error;
      return (data ?? []) as BranchOption[];
    },
  });
}

export function useBranchTransfers() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useQuery({
    queryKey: ["inventory_branch_transfers", ownerId],
    enabled: !!user && !!ownerId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inventory_branch_transfers")
        .select("*, inventory_branch_transfer_items(id, quantity, unit_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}


export function useBranchTransferDetails(id: string | undefined) {
  return useQuery({
    queryKey: ["inventory_branch_transfer", id],
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [{ data: header }, { data: items }] = await Promise.all([
        (supabase as any).from("inventory_branch_transfers").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("inventory_branch_transfer_items").select("*").eq("transfer_id", id),
      ]);
      return { header, items: items ?? [] };
    },
  });
}


export function useCreateBranchTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: BranchTransferInput) => {
      if (!values.target_owner_id) throw new Error("اختر فرعاً");
      const items = values.items.filter((i) => i.product_id && Number(i.quantity) > 0);
      if (items.length === 0) throw new Error("أضف صنفاً واحداً على الأقل");
      const { data, error } = await (supabase as any).rpc("perform_branch_transfer", {
        p_target_owner: values.target_owner_id,
        p_items: items.map((i) => ({
          product_id: i.product_id,
          quantity: Number(i.quantity),
          base_quantity: Number(i.base_quantity ?? i.quantity),
          unit_name: i.unit_name ?? null,
          expiry_date: i.expiry_date ?? null,
        })),

        p_cash_value: Number(values.cash_value) || 0,
        p_notes: values.notes ?? null,
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("INSUFFICIENT_STOCK")) throw new Error("الرصيد غير كافٍ لأحد الأصناف");
        if (msg.includes("SENDER_TREASURY_MISSING")) throw new Error("لا توجد خزينة افتراضية لحسابك");
        if (msg.includes("TARGET_TREASURY_MISSING")) throw new Error("الفرع المستقبل ليس لديه خزينة افتراضية");
        if (msg.includes("TARGET_NOT_ADMIN")) throw new Error("الفرع المستقبل غير صالح");
        if (msg.includes("INVALID_TARGET")) throw new Error("اختر فرعاً مختلفاً");
        if (msg.includes("NO_ITEMS")) throw new Error("أضف صنفاً واحداً على الأقل");
        if (msg.includes("PRODUCT_NOT_FOUND")) throw new Error("أحد الأصناف غير موجود");
        throw new Error(msg || "تعذر التنفيذ");
      }
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_branch_transfers"] });
      qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products-min"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["treasury_transactions"] });
      toast.success("تم تنفيذ التحويل بنجاح");
    },
    onError: (e: any) => toast.error(e.message || "تعذر التنفيذ"),
  });
}
