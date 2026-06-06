import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { Win7Modal } from "./Win7Modal";
import { th, td } from "./win7";
import { useI18n } from "@/lib/i18n";
import { useContacts } from "@/hooks/use-contacts";
import { useConvertSaleToCredit, useInvoiceItems } from "@/hooks/use-invoices";
import { ReceiptPrintable } from "./ReceiptPrintable";
import { Printer, ArrowRightLeft, Pencil } from "lucide-react";

type Props = {
  sessionId: string;
  onClose: () => void;
};

export function RecentTransactionsModal({ sessionId, onClose }: Props) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [tab, setTab] = useState<"all" | "sale" | "sale_return" | "quotation" | "draft" | "payment" | "standalone_return">("all");

  const { data: customers = [] } = useContacts("customer");
  const { data: suppliers = [] } = useContacts("supplier");
  const convert = useConvertSaleToCredit();
  const { data: printItems = [] } = useInvoiceItems(printingId || undefined);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: cps }, { data: stdRets }] = await Promise.all([
        (supabase.from("invoices") as any)
          .select("id, invoice_number, created_at, total, paid_amount, payment_method, type, payment_status, customer_id, issue_date, subtotal, tax, discount, shipping_cost")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase.from("contact_payments") as any)
          .select("id, amount, direction, contact_type, contact_id, payment_method, ref_no, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase.from("standalone_returns" as any) as any)
          .select("id, reference_no, return_type, total_amount, reason, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const cpRows = (cps ?? []).map((p: any) => ({
        id: p.id,
        invoice_number: p.ref_no || (p.direction === "in" ? "دفعة عميل" : "دفعة مورد"),
        created_at: p.created_at,
        total: Number(p.amount || 0),
        payment_method: p.payment_method || "cash",
        type: p.direction === "in" ? "customer_payment" : "supplier_payment",
        payment_status: "paid",
        customer_id: p.contact_type === "customer" ? p.contact_id : null,
        contact_id: p.contact_id,
        contact_type: p.contact_type,
        __isPayment: true,
      }));
      const stdRetRows = (stdRets ?? []).map((r: any) => ({
        id: r.id,
        invoice_number: r.reference_no || "مرتجع حر",
        created_at: r.created_at,
        total: Number(r.total_amount || 0),
        payment_method: "cash",
        type: "standalone_return",
        payment_status: "paid",
        customer_id: null,
        return_type: r.return_type,
        reason: r.reason,
        __isStandaloneReturn: true,
      }));
      const merged = [...(data ?? []), ...cpRows, ...stdRetRows].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setRows(merged);
    })();
  }, [sessionId, reloadTick]);

  // Trigger window.print when items have loaded for the chosen invoice
  useEffect(() => {
    if (!printingId) return;
    if (!printItems || (printItems as any[]).length === 0) return;
    const tmr = setTimeout(() => window.print(), 100);
    const onAfter = () => setPrintingId(null);
    window.addEventListener("afterprint", onAfter);
    return () => {
      clearTimeout(tmr);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [printingId, printItems]);

  const methodLabel = (m: string | null) =>
    m === "cash" ? t("sales.cashier.recent.method.cash")
    : m === "card" ? t("sales.cashier.recent.method.card")
    : m === "credit" ? t("sales.cashier.recent.method.credit")
    : m === "multi" ? t("sales.cashier.recent.method.multi")
    : m || "—";

  const typeLabel = (ty: string) =>
    ty === "sale" ? t("sales.recent.type_sale")
    : ty === "quotation" ? t("sales.recent.type_quote")
    : ty === "sale_return" ? t("sales.session.return")
    : ty === "customer_payment" ? "دفعة عميل"
    : ty === "supplier_payment" ? "دفعة مورد"
    : ty === "standalone_return" ? "مرتجع حر"
    : t("sales.recent.type_draft");

  const locale = lang === "ar" ? "ar-EG" : "en-US";

  const printingRow = rows?.find((r) => r.id === printingId) || null;
  const convertingRow = rows?.find((r) => r.id === convertingId) || null;

  const custName = (id?: string | null, snapshot?: string | null) => {
    if (!id) return snapshot || "زبون نقدي";
    const c: any = (customers as any[]).find((x) => x.id === id);
    if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || "—";
    return snapshot || "—";
  };
  const contactName = (id?: string | null, type?: string | null, snapshot?: string | null) => {
    if (!id) return snapshot || "—";
    const list = type === "supplier" ? (suppliers as any[]) : (customers as any[]);
    const c: any = list.find((x) => x.id === id);
    if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || "—";
    return snapshot || "—";
  };

  const handleConvert = async () => {
    if (!convertingRow) return;
    const cid = convertingRow.customer_id || selectedCustomerId;
    if (!cid) return;
    await convert.mutateAsync({ invoiceId: convertingRow.id, customerId: cid });
    setConvertingId(null);
    setSelectedCustomerId("");
    setReloadTick((x) => x + 1);
  };

  const filteredRows = (rows ?? []).filter((r: any) => {
    if (tab === "all") return true;
    if (tab === "payment") return r.__isPayment === true;
    if (tab === "standalone_return") return r.__isStandaloneReturn === true;
    return r.type === tab;
  });

  const tabBtn = (key: typeof tab, label: string, count: number): React.CSSProperties => ({
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    background: tab === key ? "#2563eb" : "#fff",
    color: tab === key ? "#fff" : "#1f2937",
    border: "1px solid " + (tab === key ? "#1d4ed8" : "#9aa0a6"),
    borderRadius: 3,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });
  const counts = {
    all: (rows ?? []).length,
    sale: (rows ?? []).filter((r: any) => r.type === "sale").length,
    sale_return: (rows ?? []).filter((r: any) => r.type === "sale_return").length,
    quotation: (rows ?? []).filter((r: any) => r.type === "quotation").length,
    draft: (rows ?? []).filter((r: any) => r.type === "draft").length,
    payment: (rows ?? []).filter((r: any) => r.__isPayment === true).length,
    standalone_return: (rows ?? []).filter((r: any) => r.__isStandaloneReturn === true).length,
  };

  return (
    <>
      <Win7Modal title={t("sales.recent.title")} onClose={onClose} width={760}>
        {!rows ? (
          <div style={{ padding: 20, textAlign: "center" }}>{t("sales.cashier.loading")}</div>
        ) : (
          <>
          <div style={{ display: "flex", gap: 6, padding: 8, flexWrap: "wrap", borderBottom: "1px solid #d4d4d4" }}>
            <button type="button" style={tabBtn("all", "الكل", counts.all)} onClick={() => setTab("all")}>الكل ({counts.all})</button>
            <button type="button" style={tabBtn("sale", "الفواتير", counts.sale)} onClick={() => setTab("sale")}>الفواتير ({counts.sale})</button>
            <button type="button" style={tabBtn("sale_return", "المرتجعات", counts.sale_return)} onClick={() => setTab("sale_return")}>مرتجعات فواتير ({counts.sale_return})</button>
            <button type="button" style={tabBtn("standalone_return", "مرتجع حر", counts.standalone_return)} onClick={() => setTab("standalone_return")}>مرتجع حر ({counts.standalone_return})</button>
            <button type="button" style={tabBtn("quotation", "عروض الأسعار", counts.quotation)} onClick={() => setTab("quotation")}>عروض الأسعار ({counts.quotation})</button>
            <button type="button" style={tabBtn("draft", "مسودات", counts.draft)} onClick={() => setTab("draft")}>مسودات ({counts.draft})</button>
            <button type="button" style={tabBtn("payment", "الدفعات", counts.payment)} onClick={() => setTab("payment")}>الدفعات ({counts.payment})</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#d4d4d4" }}>
              <tr>
                <th style={th}>{t("sales.recent.no")}</th>
                <th style={th}>العميل</th>
                <th style={th}>{t("sales.recent.time")}</th>
                <th style={th}>{t("sales.recent.type")}</th>
                <th style={th}>{t("sales.recent.pay")}</th>
                <th style={th}>{t("sales.recent.total")}</th>
                <th style={th}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r: any) => {
                const canConvert =
                  r.type === "sale" &&
                  r.payment_status === "paid" &&
                  r.payment_method !== "credit";
                const isReturn = r.type === "sale_return" || r.__isStandaloneReturn;
                const returnTypeLabel = r.__isStandaloneReturn
                  ? (r.return_type === "sales" ? "مرتجع مبيعات حر" : "مرتجع مشتريات حر")
                  : null;
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #e5e7eb", background: isReturn ? "#fef2f2" : undefined }}>
                    <td style={td}>{r.invoice_number}</td>
                    <td style={td}>
                      {r.__isStandaloneReturn
                        ? (returnTypeLabel + (r.reason ? ` — ${r.reason}` : ""))
                        : r.__isPayment
                          ? contactName(r.contact_id, r.contact_type, r.contact_name_snapshot)
                          : custName(r.customer_id, r.customer_name_snapshot)}
                    </td>
                    <td style={td}>{new Date(r.created_at).toLocaleTimeString(locale)}</td>
                    <td style={{ ...td, color: isReturn ? "#dc2626" : undefined, fontWeight: isReturn ? 700 : undefined }}>{typeLabel(r.type)}</td>
                    <td style={td}>{r.__isStandaloneReturn ? "—" : methodLabel(r.payment_method)}</td>
                    <td style={{ ...td, fontWeight: 700, color: isReturn ? "#dc2626" : undefined }}>
                      {r.__isStandaloneReturn ? `-${Number(r.total).toFixed(2)}` : Number(r.total).toFixed(2)}
                    </td>
                    <td style={td}>
                      <div style={{ display: "inline-flex", gap: 4 }}>
                        {!r.__isPayment && !r.__isStandaloneReturn && (
                          <button
                            type="button"
                            onClick={() => setPrintingId(r.id)}
                            title="طباعة"
                            style={iconBtn("#1d4ed8")}
                          >
                            <Printer size={14} />
                            طباعة
                          </button>
                        )}
                        {canConvert && (
                          <button
                            type="button"
                            onClick={() => {
                              setConvertingId(r.id);
                              setSelectedCustomerId(r.customer_id || "");
                            }}
                            title="تحويل لآجل"
                            style={iconBtn("#b45309")}
                          >
                            <ArrowRightLeft size={14} />
                            تحويل لآجل
                          </button>
                        )}
                        {r.type === "sale" && (
                          <button
                            type="button"
                            onClick={() => { navigate({ to: '/sales/edit/$id', params: { id: r.id } }); onClose(); }}
                            title="تعديل الفاتورة"
                            style={iconBtn("#d97706")}
                          >
                            <Pencil size={14} />
                            تعديل
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>{t("sales.recent.no_data")}</td></tr>
              )}
            </tbody>
          </table>
          </>
        )}
      </Win7Modal>


      {convertingRow && (
        <Win7Modal title="تحويل الفاتورة إلى آجل" onClose={() => { setConvertingId(null); setSelectedCustomerId(""); }} width={420}>
          <div style={{ padding: 12, fontSize: 13, display: "grid", gap: 10 }}>
            <div>
              فاتورة <b>{convertingRow.invoice_number}</b> بإجمالي{" "}
              <b>{Number(convertingRow.total).toFixed(2)}</b>
            </div>
            {convertingRow.customer_id ? (
              <div>سيتم تسجيلها كمديونية على: <b>{custName(convertingRow.customer_id)}</b></div>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                <label style={{ fontWeight: 700 }}>اختر العميل:</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  style={{ padding: 6, border: "1px solid #9aa0a6", background: "#fff" }}
                >
                  <option value="">— اختر —</option>
                  {(customers as any[]).map((c) => (
                    <option key={c.id} value={c.id}>{custName(c.id)}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              سيتم خصم المبلغ من النقدية وإضافته إلى ذمم العميل تلقائياً، ولن يتأثر المخزون.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button
                type="button"
                onClick={() => { setConvertingId(null); setSelectedCustomerId(""); }}
                style={{ padding: "6px 14px", border: "1px solid #9aa0a6", background: "#e5e7eb", cursor: "pointer", borderRadius: 2 }}
              >إلغاء</button>
              <button
                type="button"
                disabled={convert.isPending || (!convertingRow.customer_id && !selectedCustomerId)}
                onClick={handleConvert}
                style={{ padding: "6px 14px", border: "1px solid #9aa0a6", background: "#b45309", color: "#fff", cursor: "pointer", borderRadius: 2, opacity: convert.isPending ? 0.6 : 1 }}
              >تأكيد التحويل</button>
            </div>
          </div>
        </Win7Modal>
      )}

      {/* Hidden print area — global @media print CSS will show only .print-area */}
      {printingRow && (printItems as any[]).length > 0 && (
        <ReceiptPrintable
          invoice={printingRow}
          items={printItems as any[]}
          customerName={custName(printingRow.customer_id)}
        />
      )}
    </>
  );
}

function iconBtn(bg: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    fontSize: 11,
    background: bg,
    color: "#fff",
    border: "1px solid #9aa0a6",
    borderRadius: 2,
    cursor: "pointer",
  };
}
