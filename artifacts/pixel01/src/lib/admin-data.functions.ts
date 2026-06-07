import { supabase } from "@/integrations/supabase/client";

// Child tables without owner_id — delete via parent owner_id
const CHILD_DELETES: Array<{
  table: string;
  parentTable: string;
  parentFk: string;
}> = [
  { table: "invoice_items", parentTable: "invoices", parentFk: "invoice_id" },
  { table: "purchase_items", parentTable: "purchases", parentFk: "purchase_id" },
  { table: "purchase_return_items", parentTable: "purchase_returns", parentFk: "purchase_return_id" },
  { table: "damaged_stock_items", parentTable: "damaged_stock", parentFk: "damaged_stock_id" },
  { table: "journal_entry_lines", parentTable: "journal_entries", parentFk: "journal_entry_id" },
  { table: "stock_adjustment_items", parentTable: "stock_adjustments", parentFk: "adjustment_id" },
  { table: "contact_payment_invoice_allocations", parentTable: "contact_payments", parentFk: "contact_payment_id" },
];

// Order matters: children before parents (FK / RLS dependency).
const OWNER_TABLES: string[] = [
  "contact_payments",
  "standalone_returns",
  "treasury_transactions",
  "invoices",
  "purchase_returns",
  "purchases",
  "damaged_stock",
  "stock_adjustments",
  "expenses",
  "expense_categories",
  "journal_entries",
  "account_balances",
  "accounts",
  "cashier_sessions",
  "promotional_discounts",
  "product_warehouse_stock",
  "products",
  "categories",
  "brands",
  "price_groups",
  "contacts",
  "customer_groups",
  "sales_reps",
  "customers",
  "suppliers",
  "custom_roles",
  "soft_deletes",
];

async function deleteChildRows(
  childTable: string,
  parentTable: string,
  parentFk: string,
  userId: string,
) {
  const { data: parents, error: pErr } = await (supabase.from(parentTable as any) as any)
    .select("id")
    .eq("owner_id", userId);
  if (pErr) throw new Error(`فشل قراءة ${parentTable}: ${pErr.message}`);
  const ids = ((parents ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!ids.length) return;
  const { error } = await (supabase.from(childTable as any) as any)
    .delete()
    .in(parentFk, ids);
  if (error) throw new Error(`فشل حذف ${childTable}: ${error.message}`);
}

export const wipeAllAdminData = async () => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const { data: empRow } = await (supabase.from("employees") as any)
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (empRow) {
    throw new Error("الموظفون لا يستطيعون مسح بيانات النشاط");
  }

  for (const { table, parentTable, parentFk } of CHILD_DELETES) {
    await deleteChildRows(table, parentTable, parentFk, userId);
  }

  for (const table of OWNER_TABLES) {
    const { error } = await (supabase.from(table as any) as any)
      .delete()
      .eq("owner_id", userId);
    if (error && !/column .* owner_id/i.test(error.message)) {
      throw new Error(`فشل حذف ${table}: ${error.message}`);
    }
  }

  const { data: emps } = await (supabase.from("employees") as any)
    .select("id")
    .eq("admin_id", userId);

  let deletedEmployees = 0;
  for (const e of ((emps ?? []) as unknown) as Array<{ id: string }>) {
    const { error: delRowErr } = await (supabase.from("employees") as any)
      .delete()
      .eq("id", e.id);
    if (delRowErr) throw new Error(delRowErr.message);
    deletedEmployees++;
  }

  return { ok: true, deletedEmployees };
};
