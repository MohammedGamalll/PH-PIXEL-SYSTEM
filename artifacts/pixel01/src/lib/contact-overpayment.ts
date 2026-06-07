import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resettleContactDebt } from "@/lib/debt-allocation.functions";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";

const OVERPAY_EPS = 0.0001;

export type OverpaymentArgs = {
  contactId: string;
  overPaid: number;
  ownerId: string | undefined;
  refNo?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  treasuryAccountId?: string | null;
  paymentDate?: string | null;
  contactType?: "supplier" | "customer";
};

async function resolveTreasuryAccountId(accountOrTreasuryId: string | null | undefined): Promise<string | null> {
  const id = String(accountOrTreasuryId || "").trim();
  if (!id) return null;
  const { data: treasuryRow } = await (supabase.from("treasuries") as any)
    .select("id, account_id")
    .eq("id", id)
    .maybeSingle();
  if ((treasuryRow as any)?.account_id) return (treasuryRow as any).account_id;
  return id;
}

/** Supplier overpayment: record surplus as payment out and reduce payable balance. */
export async function applyPurchaseOverpayment(args: OverpaymentArgs): Promise<boolean> {
  const overPaid = Number(args.overPaid) || 0;
  if (overPaid <= OVERPAY_EPS) return false;

  const ownerId = requireOwnerId(args.ownerId);
  const refNo = String(args.refNo || "").trim() || `PAY-${Date.now().toString(36).toUpperCase()}`;
  const treasuryAccountId = await resolveTreasuryAccountId(args.treasuryAccountId);
  const contactType = args.contactType ?? "supplier";

  const { error: ePay } = await (supabase.from("contact_payments") as any).insert({
    owner_id: ownerId,
    contact_id: args.contactId,
    contact_type: contactType,
    direction: "out",
    amount: overPaid,
    allocated_amount: 0,
    payment_method: args.paymentMethod ?? "cash",
    treasury_account_id: treasuryAccountId,
    ref_no: refNo,
    notes: args.note ?? `زيادة دفع على فاتورة شراء — ${overPaid.toFixed(2)}`,
    payment_date: args.paymentDate ?? new Date().toISOString().slice(0, 10),
  });
  if (ePay) throw friendlyDbError(ePay);

  try {
    await resettleContactDebt({ data: { contact_id: args.contactId, direction: "out" } });
  } catch (err) {
    console.warn("resettleContactDebt (purchase overpay) failed", err);
  }

  toast.success(`تم خصم زيادة الدفع (${overPaid.toFixed(2)}) من رصيد ${contactType === "supplier" ? "المورد" : "جهة الاتصال"}`);
  return true;
}

/** Customer overpayment: add surplus to advance_balance (credit for customer). */
export async function applySalesOverpayment(args: OverpaymentArgs): Promise<boolean> {
  const overPaid = Number(args.overPaid) || 0;
  if (overPaid <= OVERPAY_EPS) return false;

  requireOwnerId(args.ownerId);

  const { data: old, error: selErr } = await (supabase.from("contacts") as any)
    .select("advance_balance")
    .eq("id", args.contactId)
    .maybeSingle();
  if (selErr) throw friendlyDbError(selErr);

  const nextAdvance = Number(old?.advance_balance || 0) + overPaid;
  const { error: updErr } = await (supabase.from("contacts") as any)
    .update({ advance_balance: nextAdvance })
    .eq("id", args.contactId);
  if (updErr) throw friendlyDbError(updErr);

  toast.success(`تم إضافة زيادة الدفع (${overPaid.toFixed(2)}) كرصيد للعميل`);
  return true;
}

export function computeOverpayment(paid: number, total: number) {
  const paidNum = Number(paid) || 0;
  const totalNum = Number(total) || 0;
  return {
    appliedPaid: Math.min(paidNum, totalNum),
    overPaid: Math.max(0, paidNum - totalNum),
  };
}
