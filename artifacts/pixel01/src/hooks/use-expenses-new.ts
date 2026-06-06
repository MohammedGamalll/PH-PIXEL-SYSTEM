import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { toast } from "sonner";

export type ExpenseInput = {
  branch_id?: string | null;
  category_id?: string | null;
  sub_category_id?: string | null;
  sales_rep_id?: string | null;
  ref_no?: string | null;
  expense_date: string;
  spent_by?: string | null;
  spent_to?: string | null;
  amount: number;
  reason?: string | null;
  is_recurring?: boolean;
  recur_interval_number?: number | null;
  recur_interval_type?: string | null;
  recur_count?: number | null;
  tax_applied?: string | null;
  payment_method?: string | null;
  payment_account?: string | null;
  payment_note?: string | null;
  paid_amount: number;
  due_amount: number;
  payment_status: string;
  notes?: string | null;
};

export function useExpenses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["expenses_v2"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateExpense() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { currentWarehouseId } = useWarehouseContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: ExpenseInput) => {
      const description = values.reason?.slice(0, 200) || "مصروف";
      const { error } = await (supabase.from("expenses") as any).insert({
        ...values,
        description,
        category: "general",
        owner_id: requireOwnerId(ownerId),
        warehouse_id: currentWarehouseId ?? null,
        created_by: user!.id,
      });
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses_v2"] });
      toast.success("تم حفظ المصروف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<ExpenseInput> }) => {
      const { error } = await (supabase as any).rpc("update_expense_transaction", {
        _expense_id: id,
        _values: values,
      });
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses_v2"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
      qc.invalidateQueries({ queryKey: ["treasuries"] });
      toast.success("تم التحديث");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await (supabase.from("expenses") as any).select("*").eq("id", id).maybeSingle();
      if (row && ownerId) {
        await (supabase.from("soft_deletes") as any).insert({
          owner_id: ownerId,
          entity_type: "expense",
          entity_id: id,
          entity_label: row.ref_no ?? row.description ?? null,
          snapshot: row,
          deleted_by: user?.id ?? null,
        });
      }
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses_v2"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

