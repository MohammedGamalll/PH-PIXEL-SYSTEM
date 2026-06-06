import { Banknote } from "lucide-react";
import { AccountSelect } from "@/components/shared/AccountSelect";

export const PAYMENT_METHODS = ["نقدا", "تحويل بنكي", "انستا باي", "شيك بنكي"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentValue = {
  amount: number;
  method: PaymentMethod;
  date: string;
  account: string;
  note: string;
};

export function PaymentSection({
  value,
  onChange,
  total,
}: {
  value: PaymentValue;
  onChange: (v: PaymentValue) => void;
  total: number;
}) {
  const set = <K extends keyof PaymentValue>(k: K, v: PaymentValue[K]) =>
    onChange({ ...value, [k]: v });

  const inputStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
  };
  const labelStyle: React.CSSProperties = { color: "#374151", fontSize: 13, fontWeight: 600 };

  return (
    <div className="rounded-lg p-4 md:p-6" style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }} dir="rtl">
      <h3 className="text-base font-bold mb-4" style={{ color: "#111827" }}>إضافة الدفع</h3>

      <div className="rounded-md px-4 py-3 mb-4 flex items-center justify-between" style={{ backgroundColor: "#dcfce7", border: "1px solid #86efac" }}>
        <span className="text-sm font-bold" style={{ color: "#065f46" }}>الإجمالي:</span>
        <span className="text-sm font-bold" style={{ color: "#065f46" }}>{Number(total || 0).toFixed(2)} ج.م</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block mb-1.5" style={labelStyle}>المبلغ المدفوع:*</label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-r-md" style={{ border: "1px solid #d1d5db", borderLeft: 0, backgroundColor: "#f3f4f6" }}>
              <Banknote className="h-4 w-4" style={{ color: "#6b7280" }} />
            </span>
            <input
              type="number"
              step="0.01"
              value={value.amount === 0 ? "" : value.amount}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => set("amount", e.target.value === "" ? 0 : Number(e.target.value))}
              className="h-10 px-3 rounded-l-md text-sm w-full outline-none text-end"
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <label className="block mb-1.5" style={labelStyle}>المدفوعة على:*</label>
          <input type="datetime-local" value={value.date} onChange={(e) => set("date", e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block mb-1.5" style={labelStyle}>طريقة الدفع:*</label>
          <select value={value.method} onChange={(e) => set("method", e.target.value as PaymentMethod)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="md:col-start-1 md:col-span-1 md:col-end-2">
          <label className="block mb-1.5" style={labelStyle}>حساب:</label>
          <AccountSelect
            value={value.account}
            onChange={(v) => set("account", v)}
            className="h-10 px-3 rounded-md text-sm w-full outline-none"
            style={inputStyle}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block mb-1.5" style={labelStyle}>ملاحظة الدفع:</label>
        <textarea rows={3} value={value.note} onChange={(e) => set("note", e.target.value)} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} />
      </div>
    </div>
  );
}

export function defaultPayment(total = 0): PaymentValue {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return { amount: total, method: "نقدا", date: local, account: "", note: "" };
}
