import { supabase } from "@/integrations/supabase/client";

function mapErr(error: any): never {
  const msg = (error?.message || "").toUpperCase();
  if (msg.includes("PAYMENT_NOT_FOUND")) throw new Error("الدفعة غير موجودة");
  if (msg.includes("ALREADY_REVERSAL")) throw new Error("هذا السجل قيد عكسي بالفعل");
  if (msg.includes("ALREADY_REVERSED")) throw new Error("الدفعة مردودة بالفعل");
  if (msg.includes("AMOUNT_EXCEEDS_ORIGINAL")) throw new Error("المبلغ أكبر من قيمة الدفعة الأصلية");
  if (msg.includes("INVALID_AMOUNT")) throw new Error("المبلغ غير صالح");
  if (msg.includes("REASON_REQUIRED")) throw new Error("السبب مطلوب");
  if (msg.includes("TARGET_NOT_FOUND")) throw new Error("الفاتورة المرتبطة غير موجودة");
  if (msg.includes("TARGET_HAS_NO_PAID_AMOUNT")) throw new Error("لا يوجد مبلغ مدفوع لهذه الفاتورة");
  if (msg.includes("NO_LINKED_DOCUMENT")) throw new Error("الدفعة غير مرتبطة بفاتورة");
  if (msg.includes("INVALID_DOCUMENT_REFERENCE")) throw new Error("مرجع الفاتورة غير صالح");
  throw new Error(error?.message || "فشل تنفيذ العملية");
}

export const reverseContactPayment = async ({ data }: { data: { payment_id: string; amount: number; reason: string; target_document_id?: string | null } }) => {
  const { data: result, error } = await (supabase as any).rpc("reverse_contact_payment", {
    _payment_id: data.payment_id,
    _amount: data.amount,
    _reason: data.reason,
    _target_document_id: data.target_document_id ?? null,
  });
  if (error) mapErr(error);
  return result as { reversal_id: string; applied: number; amount: number };
};

export const reverseInvoicePayment = async ({ data }: { data: { transaction_id: string; amount: number; reason: string } }) => {
  const { data: result, error } = await (supabase as any).rpc("reverse_invoice_payment", {
    _tx_id: data.transaction_id,
    _amount: data.amount,
    _reason: data.reason,
  });
  if (error) mapErr(error);
  return result as { reversal_id: string; applied: number; amount: number };
};

export const reverseInvoiceAmount = async ({ data }: { data: { doc_table: "invoices" | "purchases"; doc_id: string; amount: number; reason: string } }) => {
  const { data: result, error } = await (supabase as any).rpc("reverse_invoice_amount", {
    _doc_table: data.doc_table,
    _doc_id: data.doc_id,
    _amount: data.amount,
    _reason: data.reason,
  });
  if (error) mapErr(error);
  return result as { applied: number; new_paid: number; new_status: string };
};
