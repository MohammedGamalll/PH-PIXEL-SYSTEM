import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { useSettings } from "@/contexts/SettingsContext";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Props = {
  invoice: any;
  items: any[];
  customerName?: string;
  payments?: { label: string; amount: number }[];
};

function formatDateTime(value: any): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(value);
  }
}

export function ReceiptPrintable({ invoice, items, customerName, payments }: Props) {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { settings } = useSettings();
  const [profile, setProfile] = useState<any>(null);
  useEffect(() => {
    if (!user || !ownerId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", ownerId).maybeSingle();
      setProfile(data);
    })();
  }, [user, ownerId]);


  const storeName = settings.business_name || profile?.company_name || profile?.full_name || "";
  const storePhone = profile?.phone || "";
  const storeAddress = [profile?.city, profile?.country].filter(Boolean).join(", ");

  const grossSubtotal = items.reduce(
    (s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);
  const promoDiscountTotal = items.reduce((s, it) => s + Number(it.discount_amount || 0), 0);
  const startSide = dir === "rtl" ? "right" : "left";
  const endSide = dir === "rtl" ? "left" : "right";

  const statusLabel =
    invoice?.payment_status === "paid" ? "مدفوعة"
    : invoice?.payment_status === "partial" ? "جزئية"
    : "غير مدفوعة";

  const dateTime = formatDateTime(invoice?.created_at || invoice?.issue_date);

  return (
    <div className="print-area print-area--receipt" dir={dir}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: "20pt", fontWeight: 800 }}>{storeName}</div>
        {storeAddress && (
          <div style={{ fontSize: "10pt", marginTop: 2 }}>{storeAddress}</div>
        )}
        {storePhone && (
          <div style={{ fontSize: "10pt", marginTop: 1 }}>الموبايل: {storePhone}</div>
        )}
        {settings.tax_number && (
          <div style={{ fontSize: "9pt", marginTop: 1 }}>{t("sales.receipt.tax_number", { value: settings.tax_number })}</div>
        )}
      </div>

      <div style={{ textAlign: "center", fontSize: "14pt", fontWeight: 700, margin: "8pt 0" }}>
        فاتورة | {statusLabel}
      </div>

      {/* Meta row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontSize: "10pt", marginBottom: 8, gap: 4 }}>
        <div>
          <div>رقم الفاتورة <b>{invoice.invoice_number}</b></div>
          <div>العميل</div>
          <div>{customerName || "—"}</div>
          <div>الموبايل:</div>
        </div>
        <div style={{ textAlign: endSide }}>
          <div>التاريخ {dateTime}</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #000", margin: "4pt 0" }} />

      {/* Items table */}
      <table style={{ width: "100%", fontSize: "10.5pt", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000" }}>
            <th style={{ textAlign: startSide, padding: "4pt 2pt" }}>الصنف</th>
            <th style={{ textAlign: "center", padding: "4pt 2pt" }}>الكمية</th>
            <th style={{ textAlign: "center", padding: "4pt 2pt" }}>السعر</th>
            <th style={{ textAlign: endSide, padding: "4pt 2pt" }}>المجموع</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const qty = Number(it.quantity || 0);
            const original = Number(it.unit_price || 0);
            const lineDisc = Number(it.discount_amount || 0);
            return (
              <tr key={idx} style={{ borderBottom: "1px dashed #ddd" }}>
                <td style={{ textAlign: startSide, padding: "4pt 2pt" }}>
                  <div>{it.description}{it.unit_name ? ` , ${it.unit_name}` : ""}{qty ? ` , ${qty}` : ""}</div>
                  {lineDisc > 0 && (
                    <div style={{ fontSize: "9pt", color: "#666" }}>خصم: {lineDisc.toFixed(2)}</div>
                  )}
                </td>
                <td style={{ textAlign: "center", padding: "4pt 2pt" }}>{qty.toFixed(2)} {it.unit_name || "وحدة"}</td>
                <td style={{ textAlign: "center", padding: "4pt 2pt" }}>{original.toFixed(2)}</td>
                <td style={{ textAlign: endSide, padding: "4pt 2pt" }}>{Number(it.total).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ borderTop: "1px solid #000", margin: "8pt 0 6pt" }} />

      {/* Totals + payments */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontSize: "11pt", gap: 4 }}>
        <div>
          {payments && payments.length > 0 ? (
            payments.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
                <span>{p.label}</span>
                <span>{formatCurrency(p.amount, settings)}</span>
              </div>
            ))
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
              <span>نقدا</span>
              <span>{formatCurrency(invoice.total, settings)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
            <span>تم الدفع</span>
            <span>{formatCurrency(invoice.paid_amount ?? invoice.total, settings)}</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
            <span>المجموع الفرعي:</span>
            <span>{grossSubtotal.toFixed(2)} {settings.currency_symbol || "ج.م"}</span>
          </div>
          {promoDiscountTotal > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
              <span>الخصم على الأصناف:</span>
              <span>(-) {promoDiscountTotal.toFixed(2)} {settings.currency_symbol || "ج.م"}</span>
            </div>
          )}
          {Number(invoice.discount) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
              <span>الخصم:</span>
              <span>(-) {Number(invoice.discount).toFixed(2)} {settings.currency_symbol || "ج.م"}</span>
            </div>
          )}
          {Number(invoice.tax) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
              <span>الضريبة:</span>
              <span>{Number(invoice.tax).toFixed(2)} {settings.currency_symbol || "ج.م"}</span>
            </div>
          )}
          {Number(invoice.shipping_cost) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "1pt 0" }}>
              <span>الشحن:</span>
              <span>{Number(invoice.shipping_cost).toFixed(2)} {settings.currency_symbol || "ج.م"}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4pt 0 1pt", marginTop: 4, borderTop: "1px solid #000", fontWeight: 800 }}>
            <span>المجموع:</span>
            <span>{formatCurrency(invoice.total, settings)}</span>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: "9pt", marginTop: 16, color: "#666" }}>{t("sales.receipt.thanks")}</div>
    </div>
  );
}
