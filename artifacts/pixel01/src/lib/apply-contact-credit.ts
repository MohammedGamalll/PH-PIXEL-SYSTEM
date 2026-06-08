import { supabase } from "@/integrations/supabase/client";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";

const EPS = 0.0001;

export type ApplyCustomerCreditArgs = {
  ownerId: string | undefined;
  customerId: string;
  invoiceId: string;
  invoiceRef?: string | null;
  total: number;
  cashPaid: number;
  createdBy?: string | null;
};

export type ApplyCustomerCreditResult = {
  creditApplied: number;
  newPaidAmount: number;
  paymentStatus: "paid" | "partial" | "unpaid";
};

function paymentStatus(total: number, paid: number): "paid" | "partial" | "unpaid" {
  if (paid >= total - EPS && total > EPS) return "paid";
  if (paid > EPS) return "partial";
  return "unpaid";
}

/** Preview how much customer credit would cover on a new/edited invoice. */
export function previewCustomerCreditApplication(totalCredit: number, total: number, cashPaid: number) {
  const remainingDue = Math.max(0, Number(total) - Number(cashPaid));
  const creditApplied = Math.min(Math.max(0, Number(totalCredit) || 0), remainingDue);
  return {
    remainingDue,
    creditApplied,
    dueAfterCredit: Math.max(0, remainingDue - creditApplied),
  };
}

export async function applyCustomerCreditToInvoice(
  args: ApplyCustomerCreditArgs,
): Promise<ApplyCustomerCreditResult> {
  const ownerId = requireOwnerId(args.ownerId);
  const total = Number(args.total) || 0;
  const cashPaid = Math.max(0, Number(args.cashPaid) || 0);
  let remainingDue = Math.max(0, total - cashPaid);

  if (remainingDue <= EPS || !args.customerId) {
    return {
      creditApplied: 0,
      newPaidAmount: cashPaid,
      paymentStatus: paymentStatus(total, cashPaid),
    };
  }

  let creditApplied = 0;

  const { data: pays, error: payErr } = await (supabase.from("contact_payments") as any)
    .select("id, amount, allocated_amount, created_at")
    .eq("owner_id", ownerId)
    .eq("contact_id", args.customerId)
    .eq("contact_type", "customer")
    .eq("direction", "in")
    .order("created_at", { ascending: true });
  if (payErr) throw friendlyDbError(payErr);

  for (const p of (pays ?? []) as any[]) {
    if (remainingDue <= EPS) break;
    const surplus = Math.max(0, Number(p.amount ?? 0) - Number(p.allocated_amount ?? 0));
    if (surplus <= EPS) continue;
    const apply = Math.min(surplus, remainingDue);

    const { error: allocErr } = await (supabase.from("contact_payment_invoice_allocations") as any).insert({
      owner_id: ownerId,
      contact_payment_id: p.id,
      document_type: "invoice",
      document_id: args.invoiceId,
      allocated_amount: apply,
    });
    if (allocErr) throw friendlyDbError(allocErr);

    const nextAllocated = Number(p.allocated_amount ?? 0) + apply;
    const { error: updErr } = await (supabase.from("contact_payments") as any)
      .update({ allocated_amount: nextAllocated })
      .eq("id", p.id)
      .eq("owner_id", ownerId);
    if (updErr) throw friendlyDbError(updErr);

    creditApplied += apply;
    remainingDue -= apply;
  }

  if (remainingDue > EPS) {
    const { data: contact, error: cErr } = await (supabase.from("contacts") as any)
      .select("advance_balance")
      .eq("id", args.customerId)
      .maybeSingle();
    if (cErr) throw friendlyDbError(cErr);

    const advance = Math.max(0, Number((contact as any)?.advance_balance ?? 0));
    if (advance > EPS) {
      const apply = Math.min(advance, remainingDue);
      const refNo = `CR-${Date.now().toString(36).toUpperCase()}`;
      const { data: payRow, error: cpErr } = await (supabase.from("contact_payments") as any)
        .insert({
          owner_id: ownerId,
          contact_id: args.customerId,
          contact_type: "customer",
          direction: "in",
          amount: apply,
          allocated_amount: apply,
          payment_method: "account",
          treasury_account_id: null,
          ref_no: refNo,
          notes: `سداد من رصيد مسبق — فاتورة ${args.invoiceRef || ""}`.trim(),
          payment_date: new Date().toISOString().slice(0, 10),
          created_by: args.createdBy ?? null,
        })
        .select("id")
        .single();
      if (cpErr) throw friendlyDbError(cpErr);

      if (payRow?.id) {
        const { error: allocErr } = await (supabase.from("contact_payment_invoice_allocations") as any).insert({
          owner_id: ownerId,
          contact_payment_id: payRow.id,
          document_type: "invoice",
          document_id: args.invoiceId,
          allocated_amount: apply,
        });
        if (allocErr) throw friendlyDbError(allocErr);
      }

      const { error: advErr } = await (supabase.from("contacts") as any)
        .update({ advance_balance: advance - apply })
        .eq("id", args.customerId);
      if (advErr) throw friendlyDbError(advErr);

      creditApplied += apply;
      remainingDue -= apply;
    }
  }

  if (creditApplied <= EPS) {
    return {
      creditApplied: 0,
      newPaidAmount: cashPaid,
      paymentStatus: paymentStatus(total, cashPaid),
    };
  }

  const newPaidAmount = cashPaid + creditApplied;
  const status = paymentStatus(total, newPaidAmount);
  const { error: invErr } = await (supabase.from("invoices") as any)
    .update({ paid_amount: newPaidAmount, payment_status: status })
    .eq("id", args.invoiceId);
  if (invErr) throw friendlyDbError(invErr);

  return { creditApplied, newPaidAmount, paymentStatus: status };
}
