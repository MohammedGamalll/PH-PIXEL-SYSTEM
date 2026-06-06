import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { restoreEmployeeAccount } from "@/lib/employees.functions";
import { toast } from "sonner";

export type SoftDeleteEntityType =
  | "contact"
  | "product"
  | "invoice"
  | "purchase"
  | "expense"
  | "employee"
  | "category"
  | "brand";

const TABLE_MAP: Record<SoftDeleteEntityType, any> = {
  contact: "contacts",
  product: "products",
  invoice: "invoices",
  purchase: "purchases",
  expense: "expenses",
  employee: "employees",
  category: "categories",
  brand: "brands",
};

/** Fetch a row and snapshot it into soft_deletes, then delete the original. */
export async function softDelete(opts: {
  entityType: SoftDeleteEntityType;
  entityId: string;
  entityLabel?: string;
  ownerId: string;
  userId?: string | null;
}) {
  const tableName = TABLE_MAP[opts.entityType];
  // 1. fetch full row
  const { data: row, error: fetchErr } = await (supabase.from(tableName) as any)
    .select("*").eq("id", opts.entityId).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!row) throw new Error("الصف غير موجود");

  // 2. snapshot
  const { error: insErr } = await (supabase.from("soft_deletes") as any).insert({
    owner_id: opts.ownerId,
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    entity_label: opts.entityLabel ?? null,
    snapshot: row,
    deleted_by: opts.userId ?? null,
  });
  if (insErr) throw insErr;

  // 3. delete original
  const { error: delErr } = await supabase.from(tableName).delete().eq("id", opts.entityId);
  if (delErr) throw delErr;
}

export function useSoftDeletes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["soft-deletes"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("soft_deletes") as any)
        .select("*")
        .is("restored_at", null)
        .order("deleted_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useRestoreSoftDelete() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const restoreEmployee = restoreEmployeeAccount;
  return useMutation({
    mutationFn: async (id: string) => {
      // 1. fetch the snapshot row
      const { data: rec, error: fetchErr } = await (supabase.from("soft_deletes") as any)
        .select("*").eq("id", id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!rec) throw new Error("السجل غير موجود");
      const tableName = TABLE_MAP[rec.entity_type as SoftDeleteEntityType];
      if (!tableName) throw new Error("نوع غير مدعوم");
      if (rec.entity_type === "employee") {
        await restoreEmployee({ data: { softDeleteId: id } });
        return;
      }

      // 2. re-insert the snapshot
      const snap = { ...rec.snapshot };
      // Drop fields that may conflict; keep id so references stay intact
      const { error: insErr } = await (supabase.from(tableName) as any)
        .upsert(snap, { onConflict: "id" });
      if (insErr) throw insErr;

      // 3. mark restored
      const { error: updErr } = await (supabase.from("soft_deletes") as any)
        .update({ restored_at: new Date().toISOString(), restored_by: user?.id ?? null })
        .eq("id", id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["soft-deletes"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employees-map"] });
      qc.invalidateQueries();
      toast.success("تم الاسترجاع");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePurgeSoftDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("soft_deletes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["soft-deletes"] });
      toast.success("تم الحذف نهائياً");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Helper hook returning a function to soft-delete a row. */
export function useSoftDelete() {
  const ownerId = useOwnerId();
  const { user } = useAuth();
  return async (opts: { entityType: SoftDeleteEntityType; entityId: string; entityLabel?: string }) => {
    if (!ownerId) throw new Error("غير مصرح");
    await softDelete({ ...opts, ownerId, userId: user?.id });
  };
}
