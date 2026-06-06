import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAccounts } from "@/hooks/use-accounts";
import { useContacts } from "@/hooks/use-contacts";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { useRef } from "react";
import { Eye, Printer, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  expense: any | null;
};

const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151", textAlign: "center" };
const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", padding: "10px 12px", color: "#374151", fontWeight: 600, textAlign: "center", fontSize: 13, borderBottom: "1px solid #e5e7eb" };

const PAY_METHOD: Record<string, string> = {
  cash: "نقدا", card: "بطاقة", bank: "تحويل بنكي", cheque: "شيك", other: "أخرى",
};
const STATUS_LABEL: Record<string, string> = { paid: "مدفوع", partial: "جزئي", pending: "غير مدفوع", due: "متأخر" };

export function ExpensePaymentsModal({ open, onClose, expense }: Props) {
  const { data: accounts = [] } = useAccounts();
  const { data: contacts = [] } = useContacts("both");
  const { data: empMap = {} } = useEmployeesMap();
  const printRef = useRef<HTMLDivElement>(null);
  if (!expense) return null;

  const accName = (id?: string | null) =>
    id ? ((accounts as any[]).find((a) => a.id === id)?.name ?? "—") : "—";

  const spentToContact = (contacts as any[]).find((c) => c.id === expense.spent_to);
  const spentToName = spentToContact
    ? [spentToContact.first_name, spentToContact.last_name].filter(Boolean).join(" ") || spentToContact.business_name || ""
    : "زبون نقدي";
  const spentByName = expense.created_by ? (empMap[expense.created_by] ?? expense.created_by_name_snapshot ?? "—") : (expense.created_by_name_snapshot ?? "—");

  const paid = Number(expense.paid_amount ?? 0);
  const ref = expense.ref_no || "—";

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><title>طباعة المدفوعات</title>
      <style>body{font-family:Tahoma,sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;text-align:center;}th{background:#f3f4f6}</style>
    </head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 [&>button]:hidden" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "#e5e7eb" }}>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-bold" style={{ color: "#111827" }}>
            عرض المدفوعات ( الرقم المرجعي: {ref} )
          </h2>
        </div>

        <div ref={printRef} className="p-5">
          {/* Info section */}
          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <div className="font-semibold mb-1" style={{ color: "#111827" }}>صرف بواسطة:</div>
              <div style={{ color: "#374151" }}>{spentByName}</div>
            </div>
            <div>
              <div className="font-semibold mb-1" style={{ color: "#111827" }}>صرف إلى:</div>
              <div style={{ color: "#374151" }}>{spentToName}</div>
              {spentToContact?.mobile && <div style={{ color: "#6b7280", fontSize: 12 }}>الموبايل: {spentToContact.mobile}</div>}
              {spentToContact?.address && <div style={{ color: "#6b7280", fontSize: 12 }}>{spentToContact.address}</div>}
            </div>
            <div>
              <div style={{ color: "#374151" }}>الرقم المرجعي: <span className="font-semibold">#{ref}</span></div>
              <div style={{ color: "#374151" }}>تاريخ: <span className="font-semibold">{expense.expense_date}</span></div>
              <div style={{ color: "#374151" }}>حالة الدفع: <span className="font-semibold">{STATUS_LABEL[expense.payment_status] || expense.payment_status}</span></div>
            </div>
          </div>

          {/* Payments table */}
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", border: "1px solid #e5e7eb" }}>
            <thead>
              <tr>
                <th style={headStyle}>تاريخ</th>
                <th style={headStyle}>الرقم المرجعي</th>
                <th style={headStyle}>القيمة</th>
                <th style={headStyle}>طريقة الدفع</th>
                <th style={headStyle}>ملاحظة</th>
                <th style={headStyle}>حساب</th>
                <th style={headStyle}>خيارات</th>
              </tr>
            </thead>
            <tbody>
              {paid > 0 ? (
                <tr>
                  <td style={cellStyle}>{expense.expense_date}</td>
                  <td style={cellStyle}>{ref}</td>
                  <td style={cellStyle}>{paid.toFixed(2)} ج.م</td>
                  <td style={cellStyle}>{PAY_METHOD[expense.payment_method] || expense.payment_method || "—"}</td>
                  <td style={cellStyle}>{expense.payment_note || "—"}</td>
                  <td style={cellStyle}>{accName(expense.payment_account_id)}</td>
                  <td style={cellStyle}>
                    <button className="h-8 w-8 inline-flex items-center justify-center rounded text-blue-600 hover:bg-blue-50">
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ) : (
                <tr><td colSpan={7} style={{ ...cellStyle, color: "#6b7280" }}>لا توجد مدفوعات</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "#e5e7eb" }}>
          <button onClick={handlePrint} className="h-9 px-4 rounded text-white text-sm inline-flex items-center gap-2" style={{ backgroundColor: "#60a5fa" }}>
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button onClick={onClose} className="h-9 px-5 rounded text-white text-sm" style={{ backgroundColor: "#1f2937" }}>
            إغلاق
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
