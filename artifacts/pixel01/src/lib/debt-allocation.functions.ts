import { supabase } from "@/integrations/supabase/client";

export const allocateContactPayment = async ({ data }: { data: { contact_id: string; direction: "in" | "out"; amount: number; contact_type?: "customer" | "supplier" } }) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  let remaining = Number(data.amount);
  if (!(remaining > 0)) return { allocated: 0, updated: [] as string[] };

  const ctype = data.contact_type ?? (data.direction === "in" ? "customer" : "supplier");
  const isSettlement =
    (ctype === "customer" && data.direction === "in") ||
    (ctype === "supplier" && data.direction === "out");
  if (!isSettlement) return { allocated: 0, updated: [] as string[] };

  const isCustomer = ctype === "customer";
  const table = isCustomer ? "invoices" : "purchases";
  const fkCol = isCustomer ? "customer_id" : "supplier_id";

  let q = (supabase.from(table as any) as any)
    .select("id, total, paid_amount, payment_status, issue_date, created_at")
    .eq("owner_id", userId)
    .eq(fkCol, data.contact_id)
    .neq("payment_status", "paid")
    .order("issue_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (isCustomer) q = q.eq("type", "sale");

  const { data: docs, error } = await q;
  if (error) throw new Error(error.message);

  const { data: lastPay } = await (supabase.from("contact_payments") as any)
    .select("id, amount, allocated_amount")
    .eq("owner_id", userId)
    .eq("contact_id", data.contact_id)
    .eq("contact_type", isCustomer ? "customer" : "supplier")
    .eq("direction", data.direction)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const updated: string[] = [];
  for (const d of (docs ?? []) as any[]) {
    if (remaining <= 0) break;
    const total = Number(d.total ?? 0);
    const paid = Number(d.paid_amount ?? 0);
    const due = Math.max(0, total - paid);
    if (due <= 0) continue;
    const apply = Math.min(due, remaining);
    const newPaid = paid + apply;
    const fullyPaid = newPaid >= total - 0.001;
    const newStatus = isCustomer
      ? (fullyPaid ? "paid" : newPaid > 0 ? "partial" : "unpaid")
      : (fullyPaid ? "paid" : newPaid > 0 ? "partial" : "pending");
    const update: Record<string, any> = {
      paid_amount: newPaid,
      payment_status: newStatus,
    };
    if (!isCustomer) update.due_amount = Math.max(0, total - newPaid);
    const { error: uErr } = await (supabase.from(table as any) as any)
      .update(update)
      .eq("id", d.id)
      .eq("owner_id", userId);
    if (uErr) throw new Error(uErr.message);

    if (lastPay?.id) {
      await (supabase.from("contact_payment_invoice_allocations") as any).insert({
        owner_id: userId,
        contact_payment_id: lastPay.id,
        document_type: isCustomer ? "invoice" : "purchase",
        document_id: d.id,
        allocated_amount: apply,
      });
    }

    remaining -= apply;
    updated.push(d.id);
  }

  const allocatedNow = Number(data.amount) - remaining;

  if (allocatedNow > 0 && lastPay?.id) {
    const cur = Number(lastPay.allocated_amount ?? 0);
    const cap = Number(lastPay.amount ?? 0);
    const next = Math.min(cap, cur + allocatedNow);
    await (supabase.from("contact_payments") as any)
      .update({ allocated_amount: next })
      .eq("id", lastPay.id)
      .eq("owner_id", userId);
  }

  return { allocated: allocatedNow, updated };
};

export const resettleContactDebt = async ({ data }: { data: { contact_id: string; direction: "in" | "out" } }) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  const { data: result, error } = await (supabase as any).rpc("resettle_contact_debt", {
    _owner: userId,
    _contact: data.contact_id,
    _direction: data.direction,
  });
  if (error) throw new Error(error.message);
  return result ?? { applied: 0 };
};
