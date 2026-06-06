import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import type { PayrollRecord } from "@/hooks/use-payroll";

type Props = {
  open: boolean;
  onClose: () => void;
  record: PayrollRecord | null;
  employeeName: string;
  companyName?: string;
};

function buildPayslipHtml(record: PayrollRecord, employeeName: string, companyName?: string) {
  const total = Number(record.basic_salary) + Number(record.bonuses);
  const deductionsTotal =
    Number(record.deductions) + Number(record.late_deductions) + Number(record.absence_deductions);
  const fmt = (n: number) => Number(n).toFixed(2);
  const paidAt = record.paid_at ? new Date(record.paid_at).toLocaleDateString("ar-EG") : "—";
  const printedAt = new Date().toLocaleDateString("ar-EG");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>إيصال صرف راتب - ${employeeName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
  .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 16px; }
  .header h1 { font-size: 22px; margin: 0; }
  .header h2 { font-size: 16px; margin: 6px 0 0; font-weight: 600; }
  .meta { font-size: 13px; color: #475569; margin-top: 4px; }
  .info { display: table; width: 100%; margin-bottom: 16px; font-size: 13px; }
  .info > div { display: table-cell; padding: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; }
  th { background: #f1f5f9; text-align: start; }
  .num { text-align: end; font-variant-numeric: tabular-nums; }
  .row-total { background: #f8fafc; font-weight: 600; }
  .row-plus { color: #047857; }
  .row-minus { color: #be123c; }
  .row-net td { background: #ecfdf5; border: 2px solid #047857; font-weight: 700; font-size: 15px; color: #065f46; padding: 12px; }
  .sigs { display: table; width: 100%; margin-top: 40px; font-size: 13px; }
  .sigs > div { display: table-cell; width: 50%; text-align: center; padding: 0 24px; }
  .sigs span { display: inline-block; border-top: 1px solid #334155; padding-top: 6px; min-width: 160px; }
  .footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 24px; }
  .notes { font-size: 13px; margin-bottom: 16px; }
</style>
</head>
<body>
  <div class="header">
    <h1>${companyName ?? "الشركة"}</h1>
    <h2>إيصال صرف راتب</h2>
    <div class="meta">شهر: ${record.month_year}</div>
  </div>

  <div class="info">
    <div><b>الموظف:</b> ${employeeName}</div>
    <div><b>الحالة:</b> ${record.status === "paid" ? "مدفوع" : "مسودة"}</div>
    <div><b>تاريخ الصرف:</b> ${paidAt}</div>
  </div>

  <table>
    <thead><tr><th>البند</th><th class="num">المبلغ</th></tr></thead>
    <tbody>
      <tr><td>الراتب الأساسي</td><td class="num">${fmt(record.basic_salary)}</td></tr>
      <tr><td class="row-plus">حوافز</td><td class="num row-plus">+ ${fmt(record.bonuses)}</td></tr>
      <tr class="row-total"><td>الإجمالي</td><td class="num">${fmt(total)}</td></tr>
      <tr><td class="row-minus">خصم تأخير</td><td class="num row-minus">- ${fmt(record.late_deductions)}</td></tr>
      <tr><td class="row-minus">خصم غياب</td><td class="num row-minus">- ${fmt(record.absence_deductions)}</td></tr>
      <tr><td class="row-minus">خصومات / سُلف</td><td class="num row-minus">- ${fmt(record.deductions)}</td></tr>
      <tr class="row-total"><td>إجمالي الخصومات</td><td class="num">${fmt(deductionsTotal)}</td></tr>
      <tr class="row-net"><td>صافي الراتب</td><td class="num">${fmt(record.net_salary)}</td></tr>
    </tbody>
  </table>

  ${record.notes ? `<div class="notes"><b>ملاحظات:</b> ${record.notes}</div>` : ""}

  <div class="sigs">
    <div><span>توقيع الموظف</span></div>
    <div><span>توقيع الإدارة</span></div>
  </div>

  <div class="footer">تاريخ الطباعة: ${printedAt}</div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body>
</html>`;
}

function printPayslip(record: PayrollRecord, employeeName: string, companyName?: string) {
  const html = buildPayslipHtml(record, employeeName, companyName);
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) {
    alert("تم منع النافذة المنبثقة. الرجاء السماح بالنوافذ المنبثقة للطباعة.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function PayslipPrintDialog({ open, onClose, record, employeeName, companyName }: Props) {
  if (!record) return null;
  const total = Number(record.basic_salary) + Number(record.bonuses);
  const deductionsTotal =
    Number(record.deductions) + Number(record.late_deductions) + Number(record.absence_deductions);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-2xl p-0 bg-white" aria-describedby={undefined}>
        <DialogTitle className="sr-only">إيصال صرف راتب</DialogTitle>
        <div className="p-8">
          <div className="text-center border-b-2 border-slate-700 pb-3 mb-4">
            <h1 className="text-2xl font-bold">{companyName ?? "الشركة"}</h1>
            <h2 className="text-lg font-semibold mt-1">إيصال صرف راتب</h2>
            <div className="text-sm text-slate-600 mt-1">شهر: {record.month_year}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
            <div><span className="font-semibold">الموظف:</span> {employeeName}</div>
            <div><span className="font-semibold">الحالة:</span> {record.status === "paid" ? "مدفوع" : "مسودة"}</div>
            <div><span className="font-semibold">تاريخ الصرف:</span> {record.paid_at ? new Date(record.paid_at).toLocaleDateString("ar-EG") : "—"}</div>
          </div>

          <table className="w-full text-sm border-collapse mb-5">
            <thead>
              <tr className="bg-slate-100">
                <th className="border p-2 text-start">البند</th>
                <th className="border p-2 text-end">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">الراتب الأساسي</td><td className="border p-2 text-end tabular-nums">{Number(record.basic_salary).toFixed(2)}</td></tr>
              <tr><td className="border p-2 text-emerald-700">حوافز</td><td className="border p-2 text-end tabular-nums text-emerald-700">+ {Number(record.bonuses).toFixed(2)}</td></tr>
              <tr className="bg-slate-50 font-semibold"><td className="border p-2">الإجمالي</td><td className="border p-2 text-end tabular-nums">{total.toFixed(2)}</td></tr>
              <tr><td className="border p-2 text-rose-700">خصم تأخير</td><td className="border p-2 text-end tabular-nums text-rose-700">- {Number(record.late_deductions).toFixed(2)}</td></tr>
              <tr><td className="border p-2 text-rose-700">خصم غياب</td><td className="border p-2 text-end tabular-nums text-rose-700">- {Number(record.absence_deductions).toFixed(2)}</td></tr>
              <tr><td className="border p-2 text-rose-700">خصومات / سُلف</td><td className="border p-2 text-end tabular-nums text-rose-700">- {Number(record.deductions).toFixed(2)}</td></tr>
              <tr className="bg-slate-50 font-semibold"><td className="border p-2">إجمالي الخصومات</td><td className="border p-2 text-end tabular-nums">{deductionsTotal.toFixed(2)}</td></tr>
              <tr className="bg-emerald-50 font-bold text-base">
                <td className="border-2 border-emerald-700 p-3">صافي الراتب</td>
                <td className="border-2 border-emerald-700 p-3 text-end tabular-nums text-emerald-800">{Number(record.net_salary).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          {record.notes && (
            <div className="mb-5 text-sm"><span className="font-semibold">ملاحظات:</span> {record.notes}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-3 border-t bg-slate-50">
          <Button variant="outline" onClick={onClose} className="gap-1"><X className="h-4 w-4" />إغلاق</Button>
          <Button onClick={() => printPayslip(record, employeeName, companyName)} className="bg-blue-600 hover:bg-blue-700 gap-1">
            <Printer className="h-4 w-4" />طباعة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
