import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useInvoiceItems, useInvoicePayments } from "@/hooks/use-invoices";
import { useAccounts } from "@/hooks/use-accounts";
import { useI18n } from "@/lib/i18n";
import type { PrintMode } from "./PrintableInvoice";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any | null;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  onPrint: (mode: PrintMode) => void;
};

export function InvoiceDetailsModal({ open, onOpenChange, invoice, customerName, customerPhone, customerAddress, onPrint }: Props) {
  const { t, dir } = useI18n();
  const { data: items = [] } = useInvoiceItems(invoice?.id);
  const { data: accounts = [] } = useAccounts();
  const { data: payments = [] } = useInvoicePayments(invoice?.id);
  const cashboxName = useMemo(() => {
    if (!invoice?.payment_account_id) return "";
    const a = (accounts as any[]).find((x) => x.id === invoice.payment_account_id);
    return a?.name || "";
  }, [accounts, invoice?.payment_account_id]);
  if (!invoice) return null;
  const due = Math.max(0, Number(invoice.total || 0) - Number(invoice.paid_amount || 0));
  const align: "right" | "left" = dir === "rtl" ? "right" : "left";
  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: align, fontSize: 13, whiteSpace: "nowrap" };
  const head: React.CSSProperties = { padding: "10px 12px", background: "#10b981", color: "white", textAlign: align, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" };
  const STATUS: Record<string, string> = { paid: t("sales.status.paid"), unpaid: t("sales.status.unpaid"), partial: t("sales.status.partial") };
  const endText = dir === "rtl" ? "text-left" : "text-right";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-6xl max-h-[92vh] overflow-y-auto p-3 sm:p-6" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t("sales.details.title").replace("{n}", String(invoice.invoice_number))}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 text-sm">
          <div className="space-y-1">
            <div>{t("sales.details.no")} <b>#{invoice.invoice_number}</b></div>
            <div>{t("sales.details.status")} <b>{t("sales.details.invoice")}</b></div>
            <div>{t("sales.details.pay_status")} <b>{STATUS[invoice.payment_status] || "—"}</b></div>
          </div>
          <div className="space-y-1">
            <div>{t("sales.details.date")} <b>{invoice.issue_date}</b></div>
            <div>{t("sales.details.customer")} <b>{customerName}</b></div>
            {customerPhone && <div>{t("sales.details.mobile")} <b>{customerPhone}</b></div>}
            {customerAddress && <div>{t("sales.details.address")} <b>{customerAddress}</b></div>}
            {cashboxName && <div>الخزينة: <b>{cashboxName}</b></div>}
          </div>
        </div>

        <div className="mt-4">
          <div className="font-bold mb-2 text-sm">{t("sales.details.items")}</div>
          <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full min-w-[720px]" style={{ borderCollapse: "collapse", border: "1px solid #d1d5db" }}>
            <thead>
              <tr>
                <th style={head}>#</th><th style={head}>{t("sales.items.col.item")}</th><th style={head}>{t("sales.items.col.qty")}</th>
                <th style={head}>تاريخ الصلاحية</th>
                <th style={head}>{t("sales.items.col.unit_price")}</th><th style={head}>{t("sales.details.discount")}</th><th style={head}>{t("sales.details.tax")}</th>
                <th style={head}>{t("sales.details.price_with_tax")}</th><th style={head}>{t("sales.items.col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {(items as any[]).map((it, i) => (
                <tr key={it.id}>
                  <td style={cell}>{i + 1}</td>
                  <td style={cell}>{it.description}</td>
                  <td style={cell}>{Number(it.quantity).toFixed(2)} {it.unit_name || ""}</td>
                  <td style={cell}>{it.expiry_date ? String(it.expiry_date).slice(0, 10) : "—"}</td>
                  <td style={cell}>{Number(it.unit_price).toFixed(2)} ج.م</td>
                  <td style={cell}>{Number(it.discount_amount || 0).toFixed(2)} ج.م</td>
                  <td style={cell}>0.00 ج.م</td>
                  <td style={cell}>{Number(it.total).toFixed(2)} ج.م</td>
                  <td style={cell}>{Number(it.total).toFixed(2)} ج.م</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4">
          <div>
            <div className="font-bold mb-2 text-sm">{t("sales.details.pay_info")}</div>
            <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full min-w-[640px]" style={{ borderCollapse: "collapse", border: "1px solid #d1d5db" }}>
              <thead>
                <tr>
                  <th style={head}>#</th><th style={head}>{t("sales.cols.date")}</th><th style={head}>الرقم المرجعي</th>
                  <th style={head}>{t("sales.details.paid_amount")}</th><th style={head}>{t("sales.cols.payment_method")}</th>
                  <th style={head}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(payments as any[]).length === 0 ? (
                  <tr><td colSpan={6} style={{ ...cell, textAlign: "center" }}>{t("sales.details.no_records")}</td></tr>
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
                      <td style={cell}>{Number(p.amount).toFixed(2)} ج.م</td>
                      <td style={cell}>{p.payment_method === "cash" ? t("sales.pay.cash") : (p.payment_method || "—")}</td>
                      <td style={cell}>
                        {fullyReversed ? <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>معكوسة</span>
                          : partiallyReversed ? <span style={{ background: "#fde68a", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>جزئية ({reversedAmt.toFixed(2)})</span>
                          : isRev ? <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>قيد عكسي</span>
                          : <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>مسجلة</span>}
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
                <tr><td className="py-1">{t("sales.details.subtotal")}</td><td className={`${endText} py-1`}>{Number(invoice.subtotal || 0).toFixed(2)} ج.م</td></tr>
                <tr><td className="py-1">{t("sales.details.discount_minus")}</td><td className={`${endText} py-1`}>{Number(invoice.discount || 0).toFixed(2)} ج.م</td></tr>
                <tr><td className="py-1">{t("sales.details.tax_plus")}</td><td className={`${endText} py-1`}>{Number(invoice.tax || 0).toFixed(2)} ج.م</td></tr>
                <tr><td className="py-1">{t("sales.details.shipping_plus")}</td><td className={`${endText} py-1`}>{Number(invoice.shipping_cost || 0).toFixed(2)} ج.م</td></tr>
                <tr style={{ borderTop: "1px solid #d1d5db", fontWeight: 700 }}><td className="py-1">{t("sales.details.balance")}</td><td className={`${endText} py-1`}>{Number(invoice.total || 0).toFixed(2)} ج.م</td></tr>
                <tr><td className="py-1">{t("sales.details.paid")}</td><td className={`${endText} py-1`}>{Number(invoice.paid_amount || 0).toFixed(2)} ج.م</td></tr>
                <tr><td className="py-1">{t("sales.details.remaining")}</td><td className={`${endText} py-1`}>{due.toFixed(2)} ج.م</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter
          className="flex-col-reverse sm:flex-row gap-2 flex-wrap"
          style={{ display: "flex", flexWrap: "wrap" }}
        >
          <Button variant="outline" onClick={() => onOpenChange(false)} style={{ margin: 4 }}>{t("sales.actions.close")}</Button>
          <Button onClick={() => onPrint("invoice")} className="bg-blue-400 hover:bg-blue-500" style={{ margin: 4, backgroundColor: "#60a5fa", color: "#ffffff" }}>{t("sales.actions.print_invoice")}</Button>
          <Button onClick={() => onPrint("packaging")} className="bg-green-500 hover:bg-green-600" style={{ margin: 4, backgroundColor: "#22c55e", color: "#ffffff" }}>{t("sales.actions.packaging")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
