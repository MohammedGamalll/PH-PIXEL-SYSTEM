import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, RotateCcw } from "lucide-react";
import { usePurchaseItemsOf, usePurchasePayments } from "@/hooks/use-purchases";
import { useAccounts } from "@/hooks/use-accounts";
import { PrintablePurchase } from "./PrintablePurchase";
import { ReversePaymentModal } from "@/components/contacts/ReversePaymentModal";
import { ReverseInvoiceModal } from "@/components/sales/ReverseInvoiceModal";

export function PurchaseDetailsModal({
  open, onOpenChange, purchase, supplierName,
}: { open: boolean; onOpenChange: (v: boolean) => void; purchase: any | null; supplierName?: string }) {
  const { data: items = [] } = usePurchaseItemsOf(purchase?.id);
  const { data: payments = [] } = usePurchasePayments(purchase?.id);
  const { data: accounts = [] } = useAccounts();
  const printRef = useRef<HTMLDivElement>(null);
  const [reverseTarget, setReverseTarget] = useState<any | null>(null);
  const [reverseDoc, setReverseDoc] = useState(false);
  const cashboxName = useMemo(() => {
    const id = purchase?.payment_account_id || purchase?.payment_account;
    if (!id) return "";
    const a = (accounts as any[]).find((x) => x.id === id);
    return a?.name || "";
  }, [accounts, purchase?.payment_account_id, purchase?.payment_account]);

  if (!purchase) {
    if (!open) return null;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>تفاصيل الشراء</DialogTitle></DialogHeader>
          <div className="py-6 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const fmt = (n: number) => `${Number(n || 0).toFixed(2)} ج.م`;
  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "right", fontSize: 13, whiteSpace: "nowrap" };
  const head: React.CSSProperties = { padding: "10px 12px", background: "#10b981", color: "white", textAlign: "right", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" };

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w || !printRef.current) return;
    w.document.write(`<html><head><title>طباعة</title><meta charset="utf-8"/></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-6xl max-h-[92vh] overflow-y-auto p-3 sm:p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل الشراء (الرقم المرجعي: #{purchase.ref_no || purchase.purchase_number})</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 text-sm">
            <div className="space-y-1">
              <div><b>الرقم المرجعي:</b> #{purchase.ref_no || purchase.purchase_number}</div>
              <div><b>تاريخ:</b> {purchase.purchase_date || purchase.issue_date}</div>
              <div><b>حالة الشراء:</b> {purchase.status}</div>
              <div><b>حالة الدفع:</b> {purchase.payment_status}</div>
            </div>
            <div><b>المشروع:</b> <div>{supplierName || "—"}</div></div>
            <div><b>المورد:</b> <div>{supplierName || "—"}</div></div>
            {cashboxName && <div><b>الخزينة:</b> <div>{cashboxName}</div></div>}
          </div>

          <div className="mt-4 overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full min-w-[720px]" style={{ borderCollapse: "collapse", border: "1px solid #d1d5db" }}>
              <thead>
                <tr>
                  <th style={head}>#</th>
                  <th style={head}>اسم الصنف أو الخدمة</th>
                  <th style={head}>كمية المشتريات</th>
                  <th style={head}>تاريخ الصلاحية</th>
                  <th style={head}>سعر الشراء</th>
                  <th style={head}>نسبة الخصم %</th>
                  <th style={head}>الإجمالي</th>
                  <th style={head}>المجموع</th>
                </tr>
              </thead>
              <tbody>
                {(items as any[]).map((it, i) => (
                  <tr key={it.id}>
                    <td style={cell}>{i + 1}</td>
                    <td style={cell}>{it.description}</td>
                    <td style={cell}>{Number(it.quantity).toFixed(2)} {it.unit_name || ""}</td>
                    <td style={cell}>{it.expiry_date ? String(it.expiry_date).slice(0, 10) : "—"}</td>
                    <td style={cell}>{fmt(it.unit_price)}</td>
                    <td style={cell}>{Number(it.discount_percent || 0).toFixed(2)}%</td>
                    <td style={cell}>{fmt(it.total)}</td>
                    <td style={cell}>{fmt(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4">
            <div>
              <div className="font-bold mb-2 text-sm">معلومات الدفع:</div>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full min-w-[640px]" style={{ borderCollapse: "collapse", border: "1px solid #d1d5db" }}>
                <thead>
                  <tr>
                    <th style={head}>#</th><th style={head}>تاريخ</th><th style={head}>الرقم المرجعي</th>
                    <th style={head}>المبلغ المدفوع</th><th style={head}>طريقة الدفع</th>
                    <th style={head}>الحالة</th><th style={head}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments as any[]).length === 0 ? (
                    <tr><td colSpan={7} style={{ ...cell, textAlign: "center" }}>لا توجد مدفوعات</td></tr>
                  ) : (payments as any[]).map((p: any, i: number) => {
                    const isRev = p.is_reversal === true;
                    const reversedAmt = Number(p.reversed_amount ?? 0);
                    const fullyReversed = !!p.reversed_by_transaction_id || !!p.reversed_by_payment_id || (Math.abs(Number(p.amount || 0)) > 0 && reversedAmt >= Math.abs(Number(p.amount || 0)) - 0.001);
                    const partiallyReversed = !fullyReversed && reversedAmt > 0;
                    const refLabel = p.ref_no || (p.description ? `TX-${String(p.id).slice(0, 6)}` : "—");
                    const dateLabel = p.created_at ? new Date(p.created_at).toLocaleString() : (p.transaction_date || "—");
                    return (
                      <tr key={`${p.source || "tx"}-${p.id}`}>
                        <td style={cell}>{i + 1}</td>
                        <td style={cell}>{dateLabel}</td>
                        <td style={cell}>{refLabel}</td>
                        <td style={cell}>{fmt(p.amount)}</td>
                        <td style={cell}>{p.payment_method === "cash" ? "نقدا" : (p.payment_method || "—")}</td>
                        <td style={cell}>
                          {fullyReversed ? <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>معكوسة</span>
                            : partiallyReversed ? <span style={{ background: "#fde68a", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>جزئية ({reversedAmt.toFixed(2)})</span>
                            : isRev ? <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>قيد عكسي</span>
                            : <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>مسجلة</span>}
                        </td>
                        <td style={cell}>
                          {!isRev && !fullyReversed ? (
                            <button onClick={() => setReverseTarget(p)} title="عكس الدفعة"
                              style={{ background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 4, padding: "4px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                              <RotateCcw className="h-3 w-3" /> عكس
                            </button>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
            <div>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1">الإجمالي:</td><td className="text-left py-1">{fmt(purchase.subtotal || purchase.total)}</td></tr>
                  <tr><td className="py-1">مبلغ خصم الشراء (-):</td><td className="text-left py-1">0.00</td></tr>
                  <tr><td className="py-1">ضريبة المشتريات (+):</td><td className="text-left py-1">{fmt(purchase.tax)}</td></tr>
                  <tr><td className="py-1">تكاليف الشحن الإضافية (+):</td><td className="text-left py-1">0.00</td></tr>
                  <tr style={{ borderTop: "1px solid #d1d5db", fontWeight: 700 }}>
                    <td className="py-1">إجمالي الشراء:</td><td className="text-left py-1">{fmt(purchase.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter
            className="flex-col-reverse sm:flex-row gap-2 flex-wrap"
            style={{ display: "flex", flexWrap: "wrap" }}
          >
            <Button variant="outline" onClick={() => onOpenChange(false)} style={{ margin: 4 }}>إغلاق</Button>
            <Button onClick={handlePrint} style={{ margin: 4, backgroundColor: "#6366f1", color: "#ffffff" }}>
              <Printer className="h-4 w-4 me-1" /> طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReverseInvoiceModal open={reverseDoc} onClose={() => setReverseDoc(false)} document={purchase} scope="purchase" />

      <ReversePaymentModal
        open={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        transaction={reverseTarget && reverseTarget.source !== "contact_payment" ? reverseTarget : null}
        payment={reverseTarget && reverseTarget.source === "contact_payment" ? reverseTarget : null}
        targetDocumentId={purchase?.id ?? null}
        targetDocumentLabel={`فاتورة الشراء #${purchase.purchase_number}`}
        contactId={purchase.supplier_id ?? null}
        contactScope="supplier"
      />

      {/* Hidden printable */}
      {typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: -10000, top: 0 }}>
          <div ref={printRef}>
            <PrintablePurchase purchase={purchase} items={items as any[]} supplierName={supplierName} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
