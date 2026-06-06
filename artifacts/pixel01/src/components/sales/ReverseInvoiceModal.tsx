import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { reverseInvoiceAmount } from "@/lib/contact-payments.functions";
import { resettleContactDebt } from "@/lib/debt-allocation.functions";
import { supabase } from "@/integrations/supabase/client";
import { useInvoicePayments } from "@/hooks/use-invoices";
import { usePurchasePayments } from "@/hooks/use-purchases";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onClose: () => void;
  document: any | null;
  scope: "sale" | "purchase";
};

export function ReverseInvoiceModal({ open, onClose, document: doc, scope }: Props) {
  const qc = useQueryClient();
  const reverseAmount = reverseInvoiceAmount;
  const resettle = resettleContactDebt;
  const { data: invPayments = [] } = useInvoicePayments(scope === "sale" ? doc?.id : undefined);
  const { data: purPayments = [] } = usePurchasePayments(scope === "purchase" ? doc?.id : undefined);
  const payments = (scope === "sale" ? invPayments : purPayments) as any[];

  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState<string>("");

  if (!doc) return null;

  const docNumber = doc.invoice_number || doc.purchase_number || "—";
  const total = Number(doc.total ?? 0);
  const paid = Number(doc.paid_amount ?? 0);
  const tableName = scope === "sale" ? "invoices" : "purchases";
  const contactId = scope === "sale" ? doc.customer_id : doc.supplier_id;

  const reversibleRows = payments.filter((p) => {
    if (p.is_reversal) return false;
    if (p.original_transaction_id) return false;
    const reversedAmt = Number(p.reversed_amount ?? 0);
    const amt = Math.abs(Number(p.amount ?? 0));
    return amt - reversedAmt > 0.001;
  });

  const totalReversible = paid;

  const handleClose = () => {
    if (saving) return;
    setReason("");
    setPartialAmount("");
    setMode("full");
    onClose();
  };

  const submit = async () => {
    if (!reason.trim()) { toast.error("السبب مطلوب"); return; }

    let targetAmount = totalReversible;
    if (mode === "partial") {
      const v = Number(partialAmount);
      if (!Number.isFinite(v) || v <= 0) { toast.error("ادخل مبلغ صحيح"); return; }
      if (v > totalReversible + 0.001) { toast.error("المبلغ أكبر من القابل للعكس"); return; }
      targetAmount = v;
    }

    if (mode === "partial" && targetAmount <= 0) {
      toast.error("لا يوجد مبلغ مدفوع للعكس");
      return;
    }

    setSaving(true);
    try {
      if (targetAmount > 0.001) {
        await reverseAmount({
          data: {
            doc_table: tableName as "invoices" | "purchases",
            doc_id: doc.id,
            amount: targetAmount,
            reason: reason.trim(),
          },
        });
      }

      if (mode === "full") {
        const { error } = await (supabase.from(tableName) as any)
          .update({ status: "cancelled", notes: ((doc.notes ?? "") + `\n[تم عكس الفاتورة] ${reason.trim()}`).trim() })
          .eq("id", doc.id);
        if (error) throw error;
      }

      if (contactId) {
        try {
          await resettle({ data: { contact_id: contactId, direction: scope === "sale" ? "in" : "out" } });
        } catch (e) {
          console.warn("post-reverse resettle failed", e);
        }
      }

      toast.success(mode === "full" ? "تم عكس الفاتورة بنجاح" : "تم عكس جزء من الفاتورة بنجاح");
      [
        "invoices", "purchases", "invoice_payments", "purchase_payments",
        "contact-balances", "contact-payments", "contact-view", "contacts",
        "contact-purchases", "contact-invoices", "contact-purchase-items",
        "contact-invoice-items", "contact-purchase-stock",
        "accounts", "account-balances", "dashboard", "ledger",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      handleClose();
    } catch (e: any) {
      toast.error(e?.message || "فشل عكس الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-[640px] w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0"
        onPointerDownOutside={(e) => { if (saving) e.preventDefault(); }}
        onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
      >
        {/* Header */}
        <DialogHeader className="px-5 py-4 bg-red-600 text-white rounded-t-lg space-y-0">
          <DialogTitle className="flex items-center gap-2 text-white text-base font-bold">
            <RotateCcw className="h-5 w-5" />
            عكس الفاتورة {docNumber}
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Warning */}
          <div className="flex gap-2 p-3 rounded-md bg-red-50 text-red-800 border border-red-200 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>
              {mode === "full"
                ? "هذه العملية ستلغي الفاتورة وتعكس كل الدفعات المرتبطة بها. لا يمكن التراجع."
                : "سيتم عكس المبلغ المحدد فقط، يقل من المدفوع ويزيد المستحق على الفاتورة."}
            </span>
          </div>

          {/* Mode toggle - large click targets */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("full")}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md border text-sm font-medium transition ${
                mode === "full"
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${mode === "full" ? "border-red-600" : "border-gray-400"}`}>
                {mode === "full" && <span className="h-2 w-2 rounded-full bg-red-600" />}
              </span>
              عكس كلي
            </button>
            <button
              type="button"
              onClick={() => setMode("partial")}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-md border text-sm font-medium transition ${
                mode === "partial"
                  ? "border-red-600 bg-red-50 text-red-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${mode === "partial" ? "border-red-600" : "border-gray-400"}`}>
                {mode === "partial" && <span className="h-2 w-2 rounded-full bg-red-600" />}
              </span>
              عكس جزئي
            </button>
          </div>

          {/* Partial amount */}
          {mode === "partial" && (
            <div className="space-y-1.5">
              <Label htmlFor="partial-amount" className="text-sm cursor-pointer">
                المبلغ المراد عكسه (الحد الأقصى: <span dir="ltr" className="font-mono">{totalReversible.toFixed(2)}</span>)
              </Label>
              <Input
                id="partial-amount"
                type="number"
                step="0.01"
                min={0}
                max={totalReversible}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="0.00"
                className="h-11 text-base"
              />
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-gray-50 rounded-md border border-gray-200 text-sm">
            <div><span className="text-gray-500">الإجمالي:</span> <strong dir="ltr" className="font-mono">{total.toFixed(2)}</strong></div>
            <div><span className="text-gray-500">المدفوع:</span> <strong dir="ltr" className="font-mono">{paid.toFixed(2)}</strong></div>
            <div><span className="text-gray-500">عدد الدفعات:</span> <strong>{reversibleRows.length}</strong></div>
          </div>

          {/* Payments list */}
          {reversibleRows.length > 0 && (
            <div className="border border-gray-200 rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-right font-medium">التاريخ</th>
                    <th className="p-2 text-right font-medium">المبلغ</th>
                    <th className="p-2 text-right font-medium">طريقة الدفع</th>
                  </tr>
                </thead>
                <tbody>
                  {reversibleRows.map((p) => {
                    const remaining = Math.abs(Number(p.amount ?? 0)) - Number(p.reversed_amount ?? 0);
                    return (
                      <tr key={p.id} className="border-t border-gray-200">
                        <td className="p-2">{formatDateTime(p.created_at ?? p.transaction_date)}</td>
                        <td className="p-2 font-mono" dir="ltr">{remaining.toFixed(2)}</td>
                        <td className="p-2">{p.payment_method || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Reason - generous click area */}
          <div className="space-y-1.5">
            <Label htmlFor="reverse-reason" className="text-sm cursor-pointer">
              السبب / ملاحظة <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="reverse-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="اكتب سبب عكس الفاتورة (مطلوب)"
              className="resize-y min-h-[88px] text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t border-gray-200 gap-2 sm:gap-2 flex-row-reverse sm:flex-row-reverse">
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {saving ? "جاري التنفيذ..." : "تأكيد عكس الفاتورة"}
          </Button>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
