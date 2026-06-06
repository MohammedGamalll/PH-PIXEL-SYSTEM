import { supabase } from "@/integrations/supabase/client";

const TRANSACTION_TABLES: string[] = [
  "invoice_items",
  "invoices",
  "purchase_return_items",
  "purchase_returns",
  "purchase_items",
  "purchases",
  "damaged_stock_items",
  "damaged_stock",
  "expenses",
  "journal_entry_lines",
  "journal_entries",
  "cashier_sessions",
  "attendance_logs",
  "payroll_records",
  "contact_payments",
  "warehouse_transfer_items",
  "warehouse_transfers",
  "inventory_count_items",
  "inventory_counts",
];

export const getServerTime = async () => {
  return { now: new Date().toISOString(), source: "client_fallback" };
};

export const getYearEndStatus = async () => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const { data: closures } = await (supabase.from("year_end_closures") as any)
    .select("year, executed_at, summary")
    .eq("owner_id", userId)
    .order("year", { ascending: false });

  const alreadyClosed = (closures ?? []).some((c: any) => c.year === year);

  return {
    serverYear: year,
    serverMonth: month,
    canRun: month === 12 && !alreadyClosed,
    alreadyClosed,
    closures: closures ?? [],
  };
};

export const getYearEndDebtPreview = async () => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const { data: invoices } = await (supabase.from("invoices") as any)
    .select("id, type, customer_id, total, paid_amount, payment_status")
    .eq("owner_id", userId)
    .neq("payment_status", "paid");

  const map = new Map<string, { contact_id: string; due: number; type: string }>();
  for (const inv of (invoices ?? []) as any[]) {
    if (!inv.customer_id) continue;
    const due = Number(inv.total || 0) - Number(inv.paid_amount || 0);
    if (due <= 0) continue;
    const key = `${inv.customer_id}:${inv.type}`;
    const prev = map.get(key) ?? { contact_id: inv.customer_id, due: 0, type: inv.type };
    prev.due += due;
    map.set(key, prev);
  }

  const items = Array.from(map.values());
  const contactIds = Array.from(new Set(items.map((i) => i.contact_id)));
  let contacts: any[] = [];
  if (contactIds.length > 0) {
    const { data } = await (supabase.from("contacts") as any)
      .select("id, first_name, last_name, business_name, type")
      .in("id", contactIds);
    contacts = data ?? [];
  }

  return {
    debts: items.map((d) => {
      const c = contacts.find((x) => x.id === d.contact_id);
      const name =
        c?.business_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "—";
      return { ...d, name, contact_type: c?.type ?? "customer" };
    }),
  };
};

export const executeYearEndReset = async ({ data }: { data: { confirmText: string; carryOverDebts: boolean } }) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const { data: empRow } = await (supabase.from("employees") as any)
    .select("id").eq("id", userId).maybeSingle();
  if (empRow) throw new Error("الموظفون لا يستطيعون تنفيذ هذه العملية");

  if (data.confirmText !== "نعم أؤكد إقفال السنة") {
    throw new Error("نص التأكيد غير صحيح");
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  if (now.getUTCMonth() + 1 !== 12) {
    throw new Error("الإقفال السنوي متاح فقط في شهر ديسمبر");
  }

  const carriedDebts: Array<{ contact_id: string; amount: number }> = [];
  if (data.carryOverDebts) {
    const { data: invoices } = await (supabase.from("invoices") as any)
      .select("customer_id, total, paid_amount")
      .eq("owner_id", userId)
      .neq("payment_status", "paid");
    const acc = new Map<string, number>();
    for (const inv of (invoices ?? []) as any[]) {
      if (!inv.customer_id) continue;
      const due = Number(inv.total || 0) - Number(inv.paid_amount || 0);
      if (due <= 0) continue;
      acc.set(inv.customer_id, (acc.get(inv.customer_id) ?? 0) + due);
    }
    for (const [cid, amt] of acc) carriedDebts.push({ contact_id: cid, amount: amt });
  }

  const summary: Record<string, number> = {};
  for (const table of TRANSACTION_TABLES) {
    const { error, count } = await (supabase.from(table as any) as any)
      .delete({ count: "exact" })
      .eq("owner_id", userId);
    if (!error) summary[table] = count ?? 0;
  }

  for (const d of carriedDebts) {
    const { data: cur } = await (supabase.from("contacts") as any)
      .select("opening_balance")
      .eq("id", d.contact_id)
      .maybeSingle();
    const newBal = Number((cur as any)?.opening_balance || 0) + d.amount;
    await (supabase.from("contacts") as any)
      .update({ opening_balance: newBal })
      .eq("id", d.contact_id);
  }

  await (supabase.from("year_end_closures") as any).insert({
    owner_id: userId,
    year,
    executed_by: userId,
    summary: { ...summary, carriedDebtsCount: carriedDebts.length },
  });

  return { ok: true, year, summary, carriedDebts: carriedDebts.length };
};
