import { useRef } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { PrintablePaymentReceipt } from "./PrintablePurchase";
import { usePurchasePayments } from "@/hooks/use-purchases";

export function PurchasePaymentsModal({
  open, onOpenChange, purchase, supplierName,
}: { open: boolean; onOpenChange: (v: boolean) => void; purchase: any | null; supplierName?: string }) {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: payments = [] } = usePurchasePayments(purchase?.id);
  if (!purchase) return null;

  const fmt = (n: number) => `${Number(n || 0).toFixed(2)} ج.م`;
  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "right", fontSize: 13, whiteSpace: "nowrap" };
  const head: React.CSSProperties = { padding: "10px 12px", background: "#f3f4f6", color: "#374151", textAlign: "right", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" };

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w || !printRef.current) return;
    w.document.write(`<html><head><title>طباعة المدفوعات</title><meta charset="utf-8"/></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-4xl max-h-[92vh] overflow-y-auto p-3 sm:p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle>عرض المدفوعات (الرقم المرجعي: {purchase.purchase_number})</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <div><b>المورد:</b></div>
              <div>{supplierName || "—"}</div>
            </div>
            <div>
              <div><b>الإجمالي:</b> {fmt(purchase.total)}</div>
              <div><b>المدفوع:</b> {fmt(purchase.paid_amount)}</div>
              <div><b>المتبقي:</b> {fmt(Number(purchase.total || 0) - Number(purchase.paid_amount || 0))}</div>
            </div>
            <div>
              <div><b>الرقم المرجعي:</b> #{purchase.ref_no || purchase.purchase_number}</div>
              <div><b>تاريخ:</b> {purchase.purchase_date || purchase.issue_date}</div>
              <div><b>حالة الشراء:</b> {purchase.status}</div>
              <div><b>حالة الدفع:</b> {purchase.payment_status}</div>
            </div>
          </div>

          <div className="overflow-x-auto -mx-3 sm:mx-0 mt-3"><table className="w-full min-w-[640px]" style={{ borderCollapse: "collapse", border: "1px solid #e5e7eb" }}>
            <thead>
              <tr>
                <th style={head}>تاريخ</th>
                <th style={head}>القيمة</th>
                <th style={head}>طريقة الدفع</th>
                <th style={head}>ملاحظة</th>
                <th style={head}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={5} style={{ ...cell, textAlign: "center" }}>لا توجد مدفوعات</td></tr>
              ) : payments.map((p: any) => {
                const isRev = p.is_reversal === true;
                const reversedAmt = Number(p.reversed_amount ?? 0);
                const fullyReversed = !!p.reversed_by_transaction_id || !!p.reversed_by_payment_id || reversedAmt >= Number(p.amount ?? 0) - 0.001;
                const partiallyReversed = !fullyReversed && reversedAmt > 0;
                const origRef = p.original_ref_no || "—";
                return (
                  <tr key={p.id}>
                    <td style={cell}>{p.created_at ? new Date(p.created_at).toLocaleString() : p.transaction_date}</td>
                    <td style={cell}>{fmt(p.amount)}</td>
                    <td style={cell}>{p.payment_method || "—"}</td>
                    <td style={cell}>{p.description || p.ref_no || "—"}</td>
                    <td style={cell}>
                      {fullyReversed ? (
                        <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>معكوسة</span>
                      ) : partiallyReversed ? (
                        <span style={{ background: "#fde68a", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>معكوسة جزئياً ({reversedAmt.toFixed(2)})</span>
                      ) : isRev ? (
                        <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>قيد عكسي {origRef}</span>
                      ) : (
                        <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>مسجلة</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
            <Button onClick={handlePrint} style={{ backgroundColor: "#6366f1", color: "#ffffff" }}>
              <Printer className="h-4 w-4 me-1" /> طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: -10000, top: 0 }}>
          <div ref={printRef}>
            <PrintablePaymentReceipt purchase={purchase} supplierName={supplierName} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
