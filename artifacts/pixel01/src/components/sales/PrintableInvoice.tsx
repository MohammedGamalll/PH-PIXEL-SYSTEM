import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { useSettings } from "@/contexts/SettingsContext";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format";

export type PrintMode = "invoice" | "packaging" | "delivery";

type Props = {
  mode: PrintMode;
  invoice: any;
  items: any[];
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
};

export function PrintableInvoice({ mode, invoice, items, customerName, customerPhone, customerAddress }: Props) {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { settings } = useSettings();
  const { t, dir } = useI18n();
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
  const endAlign: "left" | "right" = dir === "rtl" ? "left" : "right";
  const STATUS: Record<string, string> = {
    paid: t("sales.print.status_paid"),
    unpaid: t("sales.print.status_unpaid"),
    partial: t("sales.print.status_partial"),
  };

  const header = (
    <div className="sales-print-header" dir={dir}>
      <div>
        <div style={{ fontSize: "10pt" }}>{t("sales.print.invoice_no")} <b>{invoice.invoice_number}</b></div>
        <div style={{ fontSize: "10pt" }}>{t("sales.print.date")} <b>{invoice.issue_date}</b></div>
        {customerName && <div style={{ fontSize: "10pt" }}>{t("sales.print.customer")} <b>{customerName}</b></div>}
        {customerPhone && <div style={{ fontSize: "10pt" }}>{t("sales.print.mobile")} <b>{customerPhone}</b></div>}
        {mode !== "invoice" && customerAddress && <div style={{ fontSize: "10pt" }}>{t("sales.print.address")} <b>{customerAddress}</b></div>}
      </div>
      <div style={{ textAlign: endAlign }}>
        <div style={{ fontSize: "16pt", fontWeight: 800 }}>{storeName}</div>
        {settings.tax_number && <div style={{ fontSize: "10pt" }}>{t("sales.print.tax_no")} {settings.tax_number}</div>}
        {storePhone && <div style={{ fontSize: "10pt" }}>{t("sales.print.mobile")} {storePhone}</div>}
      </div>
    </div>
  );

  if (mode === "invoice") {
    const due = Math.max(0, Number(invoice.total || 0) - Number(invoice.paid_amount || 0));
    const grossSubtotal = items.reduce((s, it) =>
      s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);
    const promoDiscountTotal = items.reduce((s, it) => s + Number(it.discount_amount || 0), 0);
    return (
      <div className="print-area print-area--invoice border border-gray-300" style={{ padding: 12 }} dir={dir}>
        {header}
        <div className="sales-print-title" style={{ textAlign: "center", borderTop: "2px solid #000", borderBottom: "2px solid #000", padding: "6pt 0" }}>
          {t("sales.print.invoice_title").replace("{s}", STATUS[invoice.payment_status] || "")}
        </div>
        <table className="sales-print-table">
          <thead>
            <tr>
              <th>#</th><th>{t("sales.print.item")}</th><th>{t("sales.print.qty")}</th>
              <th>{t("sales.print.original_price")}</th><th>{t("sales.print.discount")}</th><th>{t("sales.print.final_price")}</th>
              <th>{t("sales.print.total")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const qty = Number(it.quantity || 0);
              const original = Number(it.unit_price || 0);
              const lineDiscount = Number(it.discount_amount || 0);
              const perUnitDisc = qty > 0 ? lineDiscount / qty : 0;
              const finalPrice = Number(it.sold_price_at_time ?? (original - perUnitDisc));
              return (
                <tr key={it.id ?? i}>
                  <td>{i + 1}</td>
                  <td>{it.description}</td>
                  <td>{qty.toFixed(2)} {it.unit_name || ""}</td>
                  <td>{original.toFixed(2)}</td>
                  <td>{perUnitDisc.toFixed(2)}</td>
                  <td>{finalPrice.toFixed(2)}</td>
                  <td>{Number(it.total).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sales-print-totals">
          <div>{t("sales.print.gross")}</div><div style={{ textAlign: endAlign }}>{formatCurrency(grossSubtotal, settings)}</div>
          <div>{t("sales.print.promo_disc")}</div><div style={{ textAlign: endAlign }}>- {formatCurrency(promoDiscountTotal, settings)}</div>
          <div>{t("sales.print.subtotal")}</div><div style={{ textAlign: endAlign }}>{formatCurrency(invoice.subtotal, settings)}</div>
          <div>{t("sales.print.discount")}:</div><div style={{ textAlign: endAlign }}>{formatCurrency(invoice.discount, settings)}</div>
          <div>{t("sales.print.tax")}</div><div style={{ textAlign: endAlign }}>{formatCurrency(invoice.tax, settings)}</div>
          <div>{t("sales.print.shipping")}</div><div style={{ textAlign: endAlign }}>{formatCurrency(invoice.shipping_cost, settings)}</div>
          <div style={{ fontWeight: 700, borderTop: "1px solid #333", paddingTop: 4 }}>{t("sales.print.grand")}</div>
          <div style={{ fontWeight: 700, textAlign: endAlign, borderTop: "1px solid #333", paddingTop: 4 }}>{formatCurrency(invoice.total, settings)}</div>
          <div>{t("sales.print.paid")}</div><div style={{ textAlign: endAlign }}>{formatCurrency(invoice.paid_amount, settings)}</div>
          <div>{t("sales.print.remaining")}</div><div style={{ textAlign: endAlign }}>{formatCurrency(due, settings)}</div>
        </div>
      </div>
    );
  }

  if (mode === "packaging") {
    return (
      <div className="print-area print-area--packaging border border-gray-300" style={{ padding: 12 }} dir={dir}>
        <div className="sales-print-title">{t("sales.print.packaging")}</div>
        {header}
        <table className="sales-print-table">
          <thead><tr><th>#</th><th>{t("sales.print.item")}</th><th>{t("sales.print.qty")}</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.description}</td>
                <td>{Number(it.quantity).toFixed(2)} {it.unit_name || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sales-print-footer">
          <div>{t("sales.print.signature")}</div>
          <div>____________________</div>
        </div>
      </div>
    );
  }

  return (
    <div className="print-area print-area--delivery border border-gray-300" style={{ padding: 12 }} dir={dir}>
      <div className="sales-print-title">{t("sales.print.delivery_title")}</div>
      {header}
      <table className="sales-print-table">
        <thead><tr><th>#</th><th>{t("sales.print.item")}</th><th>{t("sales.print.qty")}</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              <td>{i + 1}</td>
              <td>{it.description}</td>
              <td>{Number(it.quantity).toFixed(2)} {it.unit_name || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 24, fontSize: "11pt" }}>{t("sales.print.received_ok")}</div>
      <div style={{ marginTop: 18, fontSize: "10pt" }}>{t("sales.print.received_by")}</div>
      <div style={{ marginTop: 10, fontSize: "10pt" }}>{t("sales.print.date_blank")}</div>
      <div style={{ marginTop: 24, fontSize: "10pt", textAlign: endAlign }}>{t("sales.print.signature_blank")}</div>
    </div>
  );
}
