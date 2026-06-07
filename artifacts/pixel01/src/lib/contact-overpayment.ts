import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resettleContactDebt } from "@/lib/debt-allocation.functions";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";
import { resolveTreasuryAccountId } from "@/lib/treasury-account";

const OVERPAY_EPS = 0.0001;

export type RecordContactDocumentPaymentArgs = {
  contactId: string;
  contactType: "supplier" | "customer";
  direction: "in" | "out";
  paidAmount: number;
  appliedPaid: number;
  documentType: "purchase" | "invoice";
  documentId: string;
  ownerId: string | undefined;
  refNo?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  treasuryAccountId?: string | null;
  paymentDate?: string | null;
};

/**
 * Record one contact_payment for the full amount paid on a new invoice/purchase.
 * Allocates up to the document total; surplus stays as credit via resettleContactDebt.
 */
export async function recordContactDocumentPayment(args: RecordContactDocumentPaymentArgs): Promise<boolean> {
  const paidAmount = Number(args.paidAmount) || 0;
  const appliedPaid = Math.max(0, Number(args.appliedPaid) || 0);
  if (paidAmount <= OVERPAY_EPS) return false;

  const ownerId = requireOwnerId(args.ownerId);
  const payRef = `PAY-${Date.now().toString(36).toUpperCase()}`;
  const treasuryAccountId = args.treasuryAccountId
    ? await resolveTreasuryAccountId(args.treasuryAccountId, { required: true })
    : null;
  const surplus = Math.max(0, paidAmount - appliedPaid);

  const { data: payRow, error: ePay } = await (supabase.from("contact_payments") as any)
    .insert({
      owner_id: ownerId,
      contact_id: args.contactId,
      contact_type: args.contactType,
      direction: args.direction,
      amount: paidAmount,
      allocated_amount: appliedPaid,
      payment_method: args.paymentMethod ?? "cash",
      treasury_account_id: treasuryAccountId,
      ref_no: payRef,
      notes: args.note ?? `دفعة ${args.refNo || ""}`.trim(),
      payment_date: args.paymentDate ?? new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (ePay) throw friendlyDbError(ePay);

  if (appliedPaid > OVERPAY_EPS && payRow?.id) {
    const { error: allocErr } = await (supabase.from("contact_payment_invoice_allocations") as any).insert({
      owner_id: ownerId,
      contact_payment_id: payRow.id,
      document_type: args.documentType,
      document_id: args.documentId,
      allocated_amount: appliedPaid,
    });
    if (allocErr) throw friendlyDbError(allocErr);
  }

  try {
    await resettleContactDebt({ data: { contact_id: args.contactId, direction: args.direction } });
  } catch (err) {
    console.warn("resettleContactDebt failed", err);
  }

  const contactLabel = args.contactType === "supplier" ? "المورد" : "العميل";
  if (surplus > OVERPAY_EPS) {
    toast.success(
      `تم تسجيل الدفعة (${paidAmount.toFixed(2)}) في حساب ${contactLabel} — الفائض ${surplus.toFixed(2)} رصيد`,
    );
  } else {
    toast.success(`تم تسجيل الدفعة (${paidAmount.toFixed(2)}) في حساب ${contactLabel}`);
  }
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
