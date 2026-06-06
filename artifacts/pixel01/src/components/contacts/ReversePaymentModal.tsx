import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { reverseContactPayment, reverseInvoicePayment } from "@/lib/contact-payments.functions";
import { resettleContactDebt } from "@/lib/debt-allocation.functions";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onClose: () => void;
  payment?: any | null;
  transaction?: any | null;
  targetDocumentId?: string | null;
  targetDocumentLabel?: string | null;
  contactId?: string | null;
  contactScope?: "customer" | "supplier" | null;
};

export function ReversePaymentModal({
  open,
  onClose,
  payment,
  transaction,
  targetDocumentId,
  targetDocumentLabel,
  contactId,
  contactScope,
}: Props) {
  const qc = useQueryClient();
  const reverseContact = reverseContactPayment;
  const reverseInvoice = reverseInvoicePayment;
  const resettle = resettleContactDebt;

  const source: any = payment ?? transaction ?? null;
  const isTx = !!transaction;

  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && source) {
      const reversedSoFar = Math.abs(Number(source.reversed_amount ?? 0));
      const remaining = Math.max(0, Math.abs(Number(source.amount ?? 0)) - reversedSoFar);
      setAmount(String(remaining));
      setReason("");
    }
  }, [open, source]);

  if (!source) return null;

  const reversedSoFar = Math.abs(Number(source.reversed_amount ?? 0));
  const max = Math.max(0, Math.abs(Number(source.amount ?? 0)) - reversedSoFar);
  const origAmount = Math.abs(Number(source.amount ?? 0));
  const refLabel =
    source.ref_no ||
    source.payment_number ||
    source.number ||
    (isTx ? source.description : null) ||
    "—";

  const handleClose = () => {
    if (saving) return;
    setAmount("");
    setReason("");
    onClose();
  };

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("المبلغ مطلوب"); return; }
    if (amt > max + 0.001) { toast.error("المبلغ أكبر من قيمة الدفعة الأصلية"); return; }
    if (!reason.trim()) { toast.error("السبب مطلوب"); return; }
    setSaving(true);
    try {
      if (isTx) {
        await reverseInvoice({ data: { transaction_id: source.id, amount: amt, reason: reason.trim() } });
      } else {
        await reverseContact({
          data: {
            payment_id: source.id,
            amount: amt,
            reason: reason.trim(),
            target_document_id: targetDocumentId ?? null,
          },
        });
      }
      try {
        if (contactId && contactScope) {
          await resettle({
            data: { contact_id: contactId, direction: contactScope === "customer" ? "in" : "out" },
          });
        }
      } catch (err) {
        console.warn("post-reversal resettle failed", err);
      }
      toast.success("تم إنشاء قيد عكس الدفعة");
      [
        "contact-balances", "contact-payments", "contact-view", "contacts",
        "invoices", "purchases", "invoice_payments", "purchase_payments",
        "accounts", "account-balances", "dashboard", "ledger",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      handleClose();
    } catch (e: any) {
      toast.error(e?.message || "فشل تنفيذ العملية");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-[480px] w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0"
        onPointerDownOutside={(e) => { if (saving) e.preventDefault(); }}
        onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
      >
        <DialogHeader className="px-5 py-4 bg-red-600 text-white rounded-t-lg space-y-0">
          <DialogTitle className="flex items-center gap-2 text-white text-base font-bold">
            <RotateCcw className="h-5 w-5" />
            عكس دفعة
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          <div className="flex gap-2 p-3 rounded-md bg-red-50 text-red-800 border border-red-200 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>
              هذه العملية تنشئ قيدًا تصحيحيًا في دفتر الأستاذ ولا يمكن التراجع عنها.
              {targetDocumentLabel ? ` سيتم خصم المبلغ من ${targetDocumentLabel}.` : ""}
            </span>
          </div>

          {/* Summary */}
          <div className="p-3 bg-gray-50 rounded-md border border-gray-200 text-sm space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">الدفعة الأصلية:</span>
              <strong className="text-gray-800 truncate" style={{ unicodeBidi: "isolate" }}>{refLabel}</strong>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">القيمة الأصلية:</span>
              <strong dir="ltr" className="font-mono">{origAmount.toFixed(2)}</strong>
            </div>
            {reversedSoFar > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">تم عكسه سابقاً:</span>
                <strong dir="ltr" className="font-mono text-amber-700">{reversedSoFar.toFixed(2)}</strong>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">المتاح للعكس الآن:</span>
              <strong dir="ltr" className="font-mono text-emerald-700">{max.toFixed(2)}</strong>
            </div>
            {targetDocumentLabel && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">الفاتورة:</span>
                <strong>{targetDocumentLabel}</strong>
              </div>
            )}
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <Label htmlFor="rev-amount" className="text-sm cursor-pointer">
              المبلغ المراد عكسه <span className="text-red-600">*</span>
            </Label>
            <Input
              id="rev-amount"
              type="number"
              min={0}
              max={max}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 text-base"
            />
          </div>

          {/* Reason input */}
          <div className="space-y-1.5">
            <Label htmlFor="rev-reason" className="text-sm cursor-pointer">
              السبب / ملاحظة <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="rev-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="اكتب سبب عكس الدفعة (مطلوب)"
              className="resize-y min-h-[88px] text-sm"
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-gray-200 gap-2 flex-row-reverse sm:flex-row-reverse">
          <Button onClick={submit} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? "جاري التنفيذ..." : "تأكيد عكس الدفعة"}
          </Button>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
