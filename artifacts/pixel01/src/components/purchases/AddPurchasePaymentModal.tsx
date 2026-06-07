import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTreasuries } from "@/hooks/use-invoices";
import { useAddPurchasePayment } from "@/hooks/use-purchases";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  purchase: any | null;
  supplierName?: string;
};

export function AddPurchasePaymentModal({ open, onOpenChange, purchase, supplierName }: Props) {
  const { dir } = useI18n();
  const { data: treasuries = [] } = useTreasuries();
  const add = useAddPurchasePayment();

  const total = Number(purchase?.total || 0);
  const paid = Number(purchase?.paid_amount || 0);
  const remaining = Math.max(0, total - paid);

  const [amount, setAmount] = useState<string>("");
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [note, setNote] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  if (!purchase) return null;

  const submit = () => {
    const n = Number(amount);
    if (!n || n <= 0 || !treasuryId) return;
    add.mutate(
      {
        purchase,
        amount: n,
        treasury_id: treasuryId,
        payment_method: method,
        note: note || null,
        transaction_date: date,
      },
      {
        onSuccess: () => {
          setAmount("");
          setNote("");
          onOpenChange(false);
        },
      },
    );
  };

  const fmt = (n: number) => `${n.toFixed(2)} ج.م`;
  const amountNum = Number(amount) || 0;
  const overPaid = Math.max(0, amountNum - remaining);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إضافة دفعة لفاتورة الشراء #{purchase.purchase_number || purchase.ref_no}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-sm bg-gray-50 border border-gray-300 rounded p-3">
          <div><span className="text-gray-500">المورد:</span> <strong>{supplierName || "—"}</strong></div>
          <div><span className="text-gray-500">الإجمالي:</span> <strong>{fmt(total)}</strong></div>
          <div><span className="text-gray-500">المدفوع:</span> <strong>{fmt(paid)}</strong></div>
          <div className="col-span-3">
            <span className="text-gray-500">المتبقي:</span>{" "}
            <strong className={remaining > 0 ? "text-red-700" : "text-green-700"}>{fmt(remaining)}</strong>
          </div>
        </div>

        {remaining <= 0 ? (
          <div className="text-sm text-amber-700 font-medium p-3 bg-amber-50 border border-amber-200 rounded">
            هذه الفاتورة مدفوعة بالكامل. أي مبلغ تدفعه الآن سيتم توزيعه على فواتير المورد الأخرى المستحقة.
          </div>
        ) : null}
        <div className="border-t border-gray-300 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>المبلغ {remaining > 0 ? `(متبقي هذه الفاتورة: ${fmt(remaining)})` : ""}</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={0}
                step="0.01"
              />
            </div>
            <div>
              <Label>التاريخ</Label>
              <DateInput value={date} onChange={setDate} />
            </div>
            <div>
              <Label>الخزينة</Label>
              <Select value={treasuryId} onValueChange={setTreasuryId}>
                <SelectTrigger><SelectValue placeholder="اختر الخزينة" /></SelectTrigger>
                <SelectContent>
                  {(treasuries as any[]).map((tr: any) => (
                    <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدًا</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="transfer">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>ملاحظة</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {overPaid > 0.0001 && remaining > 0 && (
              <div className="col-span-2 text-sm text-cyan-800 font-medium p-2 bg-cyan-50 border border-cyan-200 rounded">
                زيادة الدفع: {fmt(overPaid)} (سيُسجَّل كرصيد في حساب المورد)
              </div>
            )}
          </div>
          {Number(amount) > remaining && remaining > 0 && (
            <div className="text-xs text-blue-700 mt-2">
              المبلغ يتجاوز متبقي هذه الفاتورة بـ {fmt(Number(amount) - remaining)} — سيتم توزيع الفائض على فواتير المورد الأخرى المستحقة (الأقدم أولاً).
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button
            onClick={submit}
            disabled={
              !amount ||
              Number(amount) <= 0 ||
              !treasuryId ||
              add.isPending
            }
          >
            تسجيل الدفعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
