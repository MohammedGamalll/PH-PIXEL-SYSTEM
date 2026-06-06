import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { toast } from "sonner";

export type TransferItemInput = {
  product_id: string;
  description: string;
  quantity: number;
  unit_name?: string | null;
  base_quantity?: number | null;
};

export type TransferInput = {
  ref_no?: string | null;
  from_warehouse_id: string;
  to_warehouse_id: string;
  transfer_date?: string;
  notes?: string | null;
  items: TransferItemInput[];
};

export function useWarehouseTransfers() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useQuery({
    queryKey: ["warehouse_transfers", ownerId],
    enabled: !!user && !!ownerId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_transfers")
        .select("*, warehouse_transfer_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateWarehouseTransfer() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: TransferInput) => {
      if (!ownerId) throw new Error("no owner");
      if (values.from_warehouse_id === values.to_warehouse_id) {
        throw new Error("لا يمكن التحويل لنفس المخزن");
      }
      // Validate source warehouse has enough stock for each line
      for (const it of values.items) {
        const need = Number(it.base_quantity ?? it.quantity);
        const { data: srcRow } = await (supabase as any)
          .from("product_warehouse_stock")
          .select("stock")
          .eq("product_id", it.product_id)
          .eq("warehouse_id", values.from_warehouse_id)
          .maybeSingle();
        const have = Number(srcRow?.stock ?? 0);
        if (have < need) {
          throw new Error(`الرصيد غير كافٍ في المخزن المصدر للصنف (المتوفر: ${have})`);
        }
      }
      const { items, ...header } = values;
      const { data: t, error: e1 } = await (supabase as any)
        .from("warehouse_transfers")
        .insert({
          ...header,
          owner_id: ownerId,
          created_by: user?.id ?? null,
          status: "completed",
        })
        .select("id")
        .single();
      if (e1) throw e1;
      if (items.length) {
        const { error: e2 } = await (supabase as any)
          .from("warehouse_transfer_items")
          .insert(items.map((it) => ({ ...it, transfer_id: t.id })));
        if (e2) throw e2;

        // adjust product_warehouse_stock for each item
        for (const it of items) {
          // decrement source
          await adjustStock(ownerId, it.product_id, values.from_warehouse_id, -Number(it.base_quantity ?? it.quantity));
          // increment destination
          await adjustStock(ownerId, it.product_id, values.to_warehouse_id, +Number(it.base_quantity ?? it.quantity));
        }
      }
      return t.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse_transfers"] });
      qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products-min"] });
      toast.success("تم تنفيذ التحويل");
    },
    onError: (e: any) => toast.error(e.message || "تعذر التنفيذ"),
  });
}

async function adjustStock(ownerId: string, productId: string, warehouseId: string, delta: number) {
  await (supabase as any).rpc("adjust_warehouse_stock", {
    _owner: ownerId,
    _product: productId,
    _warehouse: warehouseId,
    _delta: delta,
  });
}
