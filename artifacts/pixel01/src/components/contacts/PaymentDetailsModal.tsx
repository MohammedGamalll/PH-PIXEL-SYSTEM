import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAccounts } from "@/hooks/use-accounts";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: any | null;
};

export function PaymentDetailsModal({ open, onOpenChange, payment }: Props) {
  const { dir } = useI18n();
  const { data: accounts = [] } = useAccounts();
  const cashboxName = useMemo(() => {
    if (!payment) return "—";
    const id = payment.treasury_account_id || payment.cashbox_id || payment.account_id;
    if (!id) return "—";
    const a = (accounts as any[]).find((x) => x.id === id);
    return a?.name || "—";
  }, [accounts, payment]);

  if (!payment) return null;

  const row: { label: string; value: any }[] = [
    { label: "تاريخ الدفع", value: payment.payment_date ? new Date(payment.payment_date).toLocaleString() : "—" },
    { label: "المبلغ", value: `${Number(payment.amount ?? 0).toFixed(2)} ج.م` },
    { label: "طريقة الدفع", value: payment.payment_method === "cash" ? "نقدا" : (payment.payment_method || "نقدا") },
    { label: "الخزينة", value: cashboxName },
    { label: "الرقم المرجعي", value: payment.ref_no || "—" },
    { label: "الاتجاه", value: payment.direction === "in" ? "وارد" : payment.direction === "out" ? "صادر" : (payment.direction || "—") },
    { label: "بواسطة", value: payment.created_by_name_snapshot || "—" },
    { label: "ملاحظات", value: payment.notes || "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir={dir}>
        <DialogHeader>
          <DialogTitle>تفاصيل الدفعة</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {row.map((r) => (
            <div key={r.label} className="flex justify-between gap-3 py-1.5 border-b border-gray-100">
              <span className="text-gray-500">{r.label}</span>
              <span className="font-medium text-gray-800 text-right break-all">{String(r.value)}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
