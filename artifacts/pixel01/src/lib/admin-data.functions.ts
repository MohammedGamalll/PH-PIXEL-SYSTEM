import { supabase } from "@/integrations/supabase/client";

// Order matters: children before parents (FK / RLS dependency).
const OWNER_TABLES: string[] = [
  "invoice_items",
  "invoices",
  "purchase_return_items",
  "purchase_returns",
  "purchase_items",
  "purchases",
  "damaged_stock_items",
  "damaged_stock",
  "expenses",
  "expense_categories",
  "journal_entry_lines",
  "journal_entries",
  "account_balances",
  "accounts",
  "cashier_sessions",
  "promotional_discounts",
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
];

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
