import { useSettings } from "@/contexts/SettingsContext";

type Item = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  total: number;
  product_id?: string | null;
  sku?: string;
};

type Props = {
  purchase: any;
  items: Item[];
  supplierName?: string;
};

export function PrintablePurchase({ purchase, items, supplierName }: Props) {
  const { settings } = useSettings();
  const fmt = (n: number) => `${Number(n || 0).toFixed(2)} ${settings.currency_symbol || "ج.م"}`;
  const statusAr = (s?: string) =>
    s === "received" ? "استلم" : s === "pending" ? "قيد الانتظار" : s === "ordered" ? "تم الطلب" : s || "";
  const payStatusAr = (s?: string) =>
    s === "paid" ? "مدفوع" : s === "partial" ? "جزئي" : s === "pending" ? "مستحق الدفع" : s || "";
  const cell: React.CSSProperties = { padding: "6pt 8pt", borderBottom: "1px solid #d1d5db", fontSize: "10pt", textAlign: "right" };
  const head: React.CSSProperties = { ...cell, background: "#10b981", color: "white", fontWeight: 700, borderBottom: "1px solid #047857" };

  const subtotal = items.reduce((s, it) => s + Number(it.total || 0), 0);

  return (
    <div className="print-area" style={{ padding: 16, fontFamily: "Tahoma, sans-serif", direction: "rtl" }}>
      <div style={{ textAlign: "right", marginBottom: 12 }}>
        <h1 style={{ fontSize: "14pt", fontWeight: 700 }}>تفاصيل الشراء (الرقم المرجعي: #{purchase.ref_no || purchase.purchase_number})</h1>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 12, fontSize: "10pt" }}>
        <div>
          <div><b>الرقم المرجعي:</b> #{purchase.ref_no || purchase.purchase_number}</div>
          <div><b>تاريخ:</b> {purchase.purchase_date || purchase.issue_date}</div>
          <div><b>حالة الشراء:</b> {statusAr(purchase.status)}</div>
          <div><b>حالة الدفع:</b> {payStatusAr(purchase.payment_status)}</div>
        </div>
        <div>
          <div><b>المشروع:</b></div>
          <div>{settings.business_name}</div>
        </div>
        <div>
          <div><b>المورد:</b></div>
          <div>{supplierName || "—"}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={head}>#</th>
            <th style={head}>اسم الصنف أو الخدمة</th>
            <th style={head}>SKU/الباركود</th>
            <th style={head}>كمية المشتريات</th>
            <th style={head}>سعر الشراء</th>
            <th style={head}>نسبة الخصم %</th>
            <th style={head}>الإجمالي (قبل الضريبة)</th>
            <th style={head}>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id ?? i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{it.description}</td>
              <td style={cell}>{it.sku || "—"}</td>
              <td style={cell}>{Number(it.quantity).toFixed(2)}</td>
              <td style={cell}>{fmt(it.unit_price)}</td>
              <td style={cell}>{Number(it.discount_percent || 0).toFixed(2)}%</td>
              <td style={cell}>{fmt(it.total)}</td>
              <td style={cell}>{fmt(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginBottom: 8, fontWeight: 700 }}>معلومات الدفع:</div>
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={head}>#</th>
            <th style={head}>تاريخ</th>
            <th style={head}>الرقم المرجعي</th>
            <th style={head}>المبلغ المدفوع</th>
            <th style={head}>طريقة الدفع</th>
            <th style={head}>ملاحظة الدفع</th>
          </tr>
        </thead>
        <tbody>
          {Number(purchase.paid_amount || 0) > 0 ? (
            <tr>
              <td style={cell}>1</td>
              <td style={cell}>{purchase.purchase_date || purchase.issue_date}</td>
              <td style={cell}>PP{purchase.purchase_number}</td>
              <td style={cell}>{fmt(purchase.paid_amount)}</td>
              <td style={cell}>{purchase.payment_method === "cash" ? "نقدا" : purchase.payment_method || "—"}</td>
              <td style={cell}>{purchase.payment_note || "—"}</td>
            </tr>
          ) : (
            <tr><td colSpan={6} style={{ ...cell, textAlign: "center" }}>لا توجد مدفوعات</td></tr>
          )}
        </tbody>
      </table>

      <table style={{ width: "100%", fontSize: "10pt" }}>
        <tbody>
          <tr><td>الإجمالي:</td><td style={{ textAlign: "left" }}>{fmt(subtotal)}</td></tr>
          <tr><td>مبلغ خصم الشراء:</td><td style={{ textAlign: "left" }}>(-) 0.00</td></tr>
          <tr><td>ضريبة المشتريات:</td><td style={{ textAlign: "left" }}>(+) {fmt(purchase.tax)}</td></tr>
          <tr><td>تكاليف الشحن الإضافية:</td><td style={{ textAlign: "left" }}>(+) 0.00</td></tr>
          <tr style={{ fontWeight: 700, borderTop: "1px solid #d1d5db" }}>
            <td style={{ paddingTop: 6 }}>إجمالي الشراء:</td>
            <td style={{ textAlign: "left", paddingTop: 6 }}>{fmt(purchase.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PrintablePaymentReceipt({ purchase, supplierName }: { purchase: any; supplierName?: string }) {
  const { settings } = useSettings();
  const fmt = (n: number) => `${Number(n || 0).toFixed(2)} ${settings.currency_symbol || "ج.م"}`;
  const cell: React.CSSProperties = { padding: "6pt 8pt", borderBottom: "1px solid #d1d5db", fontSize: "10pt", textAlign: "right" };
  const head: React.CSSProperties = { ...cell, fontWeight: 700, background: "#f3f4f6" };

  return (
    <div className="print-area" style={{ padding: 16, fontFamily: "Tahoma, sans-serif", direction: "rtl" }}>
      <h1 style={{ fontSize: "14pt", fontWeight: 700, marginBottom: 12 }}>الرقم المرجعي: {purchase.purchase_number}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 12, fontSize: "10pt" }}>
        <div>
          <div><b>الرقم المرجعي:</b> #{purchase.ref_no || purchase.purchase_number}</div>
          <div><b>تاريخ:</b> {purchase.purchase_date || purchase.issue_date}</div>
          <div><b>حالة الشراء:</b> {purchase.status}</div>
          <div><b>حالة الدفع:</b> {purchase.payment_status}</div>
        </div>
        <div><b>المشروع:</b><div>{settings.business_name}</div></div>
        <div><b>المورد:</b><div>{supplierName || "—"}</div></div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db" }}>
        <thead>
          <tr>
            <th style={head}>تاريخ</th>
            <th style={head}>الرقم المرجعي</th>
            <th style={head}>القيمة</th>
            <th style={head}>طريقة الدفع</th>
            <th style={head}>ملاحظة</th>
            <th style={head}>حساب</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell}>{purchase.purchase_date || purchase.issue_date}</td>
            <td style={cell}>PP{purchase.purchase_number}</td>
            <td style={cell}>{fmt(purchase.paid_amount)}</td>
            <td style={cell}>{purchase.payment_method === "cash" ? "نقدا" : purchase.payment_method || "—"}</td>
            <td style={cell}>{purchase.payment_note || "—"}</td>
            <td style={cell}>{purchase.payment_account || "حساب البنك"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
