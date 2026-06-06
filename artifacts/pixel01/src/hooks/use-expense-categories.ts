import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { toast } from "sonner";

export function useExpenseCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["expense_categories"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateExpenseCategory() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      code?: string | null;
      parent_id?: string | null;
    }) => {
      const { error } = await (supabase.from("expense_categories") as any).insert({
        ...values,
        owner_id: requireOwnerId(ownerId),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense_categories"] });
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (id: string) => {
      const checks: { table: "expenses" | "expense_categories"; col: string; label: string }[] = [
        { table: "expenses", col: "category_id", label: "مصروف" },
        { table: "expenses", col: "sub_category_id", label: "مصروف" },
        { table: "expense_categories", col: "parent_id", label: "فئة فرعية" },
      ];
      for (const c of checks) {
        const { count, error: cErr } = await (supabase.from(c.table) as any)
          .select("id", { count: "exact", head: true })
          .eq(c.col, id);
        if (cErr) throw cErr;
        if ((count ?? 0) > 0) {
          throw new Error(`لا يمكن حذف فئة المصروف لأنها مستخدمة في ${count} ${c.label}`);
        }
      }
      const { data: row } = await (supabase.from("expense_categories") as any).select("*").eq("id", id).maybeSingle();
      if (row && ownerId) {
        await (supabase.from("soft_deletes") as any).insert({
          owner_id: ownerId,
          entity_type: "category",
          entity_id: id,
          entity_label: row.name ?? null,
          snapshot: row,
          deleted_by: user?.id ?? null,
        });
      }
      const { error } = await supabase
        .from("expense_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense_categories"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

