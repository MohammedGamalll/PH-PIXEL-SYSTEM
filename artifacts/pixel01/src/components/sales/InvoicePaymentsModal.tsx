import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTreasuries, useInvoicePayments, useAddInvoicePayment } from "@/hooks/use-invoices";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any | null;
};

export function InvoicePaymentsModal({ open, onOpenChange, invoice }: Props) {
  const { t, dir } = useI18n();
  const { data: treasuries = [] } = useTreasuries();
  const { data: payments = [] } = useInvoicePayments(invoice?.id);
  const add = useAddInvoicePayment();

  const due = invoice ? Math.max(0, Number(invoice.total || 0) - Number(invoice.paid_amount || 0)) : 0;
  const amountNum = Number(amount) || 0;
  const overPaid = Math.max(0, amountNum - due);
  const [amount, setAmount] = useState<string>("");
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [note, setNote] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));


  if (!invoice) return null;

  const submit = () => {
    const n = Number(amount);
    if (!n || !treasuryId) return;
    add.mutate({
      invoice,
      amount: n,
      treasury_id: treasuryId,
      payment_method: method,
      note: note || null,
      transaction_date: date,
    }, {
      onSuccess: () => {
        setAmount(""); setNote("");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-3xl max-h-[92vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader><DialogTitle>{t("sales.payments.title").replace("{n}", String(invoice.invoice_number))}</DialogTitle></DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm bg-gray-50 border border-gray-300 rounded p-3">
          <div><span className="text-gray-500">{t("sales.payments.total")}</span> <strong>{Number(invoice.total).toFixed(2)} ج.م</strong></div>
          <div><span className="text-gray-500">{t("sales.payments.paid")}</span> <strong>{Number(invoice.paid_amount).toFixed(2)} ج.م</strong></div>
          <div><span className="text-gray-500">{t("sales.payments.remaining")}</span> <strong className="text-red-700">{due.toFixed(2)} ج.م</strong></div>
        </div>

        {due <= 0 ? (
          <div className="text-sm text-amber-700 font-medium p-3 bg-amber-50 border border-amber-200 rounded">
            هذه الفاتورة مدفوعة بالكامل. أي مبلغ تدفعه الآن سيُوزَّع على فواتير العميل الأخرى أو يُسجَّل كرصيد.
          </div>
        ) : null}

        <div className="mt-2">
          <h4 className="text-sm font-bold mb-1">{t("sales.payments.history")}</h4>
          <div className="border border-gray-300 rounded max-h-60 overflow-auto">
            <table className="w-full min-w-[720px] text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-start">{t("sales.payments.date")}</th>
                  <th className="p-2 text-start">الرقم المرجعي</th>
                  <th className="p-2 text-start">{t("sales.payments.amount")}</th>
                  <th className="p-2 text-start">طريقة الدفع</th>
                  <th className="p-2 text-start">{t("sales.payments.desc")}</th>
                  <th className="p-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={6} className="p-3 text-center text-gray-500">{t("sales.payments.no_history")}</td></tr>
                ) : (payments as any[]).map((p: any) => {
                  const isCp = p.source === "contact_payment";
                  const isRev = p.is_reversal === true;
                  const reversedAmt = Number(p.reversed_amount ?? 0);
                  const fullyReversed = !!p.reversed_by_transaction_id || !!p.reversed_by_payment_id || (Math.abs(Number(p.amount || 0)) > 0 && reversedAmt >= Math.abs(Number(p.amount || 0)) - 0.001);
                  const partiallyReversed = !fullyReversed && reversedAmt > 0;
                  const origRef = p.original_ref_no || "—";
                  const refLabel = p.ref_no || (isCp ? "—" : (p.description ? `TX-${String(p.id).slice(0, 6)}` : "—"));
                  const dateLabel = p.created_at ? new Date(p.created_at).toLocaleString() : (p.transaction_date || "—");
                  return (
                    <tr key={`${p.source || "tx"}-${p.id}`} className="border-t border-gray-200">
                      <td className="p-2">{dateLabel}</td>
                      <td className="p-2">{refLabel}</td>
                      <td className="p-2">{Number(p.amount).toFixed(2)} ج.م</td>
                      <td className="p-2">{p.payment_method === "cash" ? t("sales.pay.cash") : (p.payment_method || "—")}</td>
                      <td className="p-2">{p.description || p.notes || "—"}</td>
                      <td className="p-2">
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
            </table>
          </div>
        </div>


        <div className="mt-3 border-t border-gray-300 pt-3">
          <h4 className="text-sm font-bold mb-2">{t("sales.payments.add")}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><Label>{t("sales.payments.amount")}</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>{t("sales.payments.date")}</Label><DateInput value={date} onChange={setDate} /></div>
            <div>
              <Label>{t("sales.payments.treasury")}</Label>
              <Select value={treasuryId} onValueChange={setTreasuryId}>
                <SelectTrigger><SelectValue placeholder={t("sales.payments.select")} /></SelectTrigger>
                <SelectContent>
                  {(treasuries as any[]).map((tr: any) => <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("sales.payments.method")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("sales.pay.cash")}</SelectItem>
                  <SelectItem value="card">{t("sales.pay.card")}</SelectItem>
                  <SelectItem value="transfer">{t("sales.pay.bank")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>{t("sales.payments.notes")}</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
            {overPaid > 0.0001 && due > 0 && (
              <div className="sm:col-span-2 text-sm text-cyan-800 font-medium p-2 bg-cyan-50 border border-cyan-200 rounded">
                زيادة الدفع: {overPaid.toFixed(2)} ج.م (سيُسجَّل كرصيد في حساب العميل)
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("sales.actions.close")}</Button>
          <Button onClick={submit} disabled={!amount || !treasuryId || add.isPending}>{t("sales.payments.register")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

