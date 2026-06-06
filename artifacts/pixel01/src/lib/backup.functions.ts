import { supabase } from "@/integrations/supabase/client";

const BACKUP_TABLES: string[] = [
  "business_settings",
  "warehouses",
  "categories",
  "brands",
  "price_groups",
  "customer_groups",
  "products",
  "product_warehouse_stock",
  "contacts",
  "customers",
  "accounts",
  "expense_categories",
  "custom_roles",
  "invoices",
  "invoice_items",
  "purchases",
  "purchase_items",
  "expenses",
  "journal_entries",
  "journal_entry_lines",
  "cashier_sessions",
  "damaged_stock",
  "damaged_stock_items",
  "warehouse_transfers",
  "warehouse_transfer_items",
  "attendance_logs",
  "payroll_records",
  "contact_payments",
  "admin_messages",
];

export const exportBackup = async () => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const dump: Record<string, any[]> = {};
  for (const table of BACKUP_TABLES) {
    try {
      const { data } = await (supabase.from(table as any) as any)
        .select("*")
        .eq("owner_id", userId);
      if (data) dump[table] = data;
    } catch {
      // skip tables without owner_id or that don't exist
    }
  }
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    owner_id: userId,
    data: dump,
  };
};

export const importBackup = async ({ data }: { data: { payload: any; mode: "merge" | "replace" } }) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const payload = data.payload;
  if (!payload || !payload.data) throw new Error("ملف نسخة غير صالح");

  const summary: Record<string, number> = {};

  if (data.mode === "replace") {
    for (const table of [...BACKUP_TABLES].reverse()) {
      try {
        await (supabase.from(table as any) as any).delete().eq("owner_id", userId);
      } catch {}
    }
  }

  for (const table of BACKUP_TABLES) {
    const rows: any[] = payload.data[table] ?? [];
    if (!rows.length) continue;
    const stamped = rows.map((r) => ({ ...r, owner_id: userId }));
    const { error } = await (supabase.from(table as any) as any).upsert(stamped, {
      onConflict: "id",
    });
    if (!error) summary[table] = rows.length;
  }

  return { ok: true, summary };
};
