import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { ReportTable } from "@/components/reports/ReportTable";
import { ReceiptDetailsModal } from "@/components/reports/ReceiptDetailsModal";
import { InvoiceDetailsModal } from "@/components/sales/InvoiceDetailsModal";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { useContacts } from "@/hooks/use-contacts";
import { useCustomerGroups } from "@/hooks/use-customer-groups";
import { useI18n } from "@/lib/i18n";


export const Route = createFileRoute("/_authenticated/reports/receipts")({
  component: ReceiptsReportPage,
});

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  borderRadius: 6,
  height: 36,
  padding: "0 8px",
  width: "100%",
  fontSize: 13,
  outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#374151",
  marginBottom: 4,
  display: "block",
};

const PAYMENT_METHODS = ["نقدي", "بطاقة", "تحويل", "آجل", "على الحساب"];

function ReceiptsReportPage() {
  const { t, dir, lang } = useI18n();
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const { user } = useAuth();
  const { data: customers = [] } = useContacts("customer");
  const { data: groups = [] } = useCustomerGroups();
  const [inspect, setInspect] = useState<any | null>(null);
  const [openInvoice, setOpenInvoice] = useState<any | null>(null);

  // Filters
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Keyboard navigation
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const tableRef = useRef<HTMLDivElement>(null);

  const cols: ColumnDef[] = [
    { key: "ref", label: t("reports.col.ref"), visible: true },
    { key: "paid_on", label: t("reports.col.paid_on"), visible: true },
    { key: "paid_amount", label: t("reports.col.paid_amount"), visible: true },
    { key: "customer", label: t("reports.col.customer"), visible: true },
    { key: "group", label: t("reports.col.group"), visible: true },
    { key: "method", label: t("reports.col.method"), visible: true },
    { key: "sale_no", label: t("reports.col.sale_no"), visible: true },
    { key: "option", label: t("reports.col.option"), visible: true },
  ];

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices_all"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const custMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of customers as any[]) m.set(c.id, c);
    return m;
  }, [customers]);

  const groupMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups as any[]) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const allRows = useMemo(
    () =>
      (invoices as any[]).map((i) => {
        const c = i.customer_id ? custMap.get(i.customer_id) : null;
        const customerName = c
          ? (c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || i.customer_name_snapshot || "عميل نقدي")
          : (i.customer_name_snapshot || "عميل نقدي");
        return {
          id: i.id,
          ref: i.invoice_number || t("reports.dash"),
          paid_on: i.issue_date ? new Date(i.issue_date).toLocaleDateString(locale) : t("reports.dash"),
          _date: i.issue_date ? String(i.issue_date).slice(0, 10) : "",
          paid_amount: Number(i.paid_amount || i.total || 0),
          customer: customerName,
          customer_id: i.customer_id || "",
          customerName,
          customerPhone: c?.mobile || c?.phone || "",
          customerAddress: c?.address || "",
          group: c?.customer_group_id ? groupMap.get(c.customer_group_id) || t("reports.dash") : t("reports.dash"),
          group_id: c?.customer_group_id || "",
          method: i.payment_method || t("reports.dash"),
          sale_no: i.invoice_number || t("reports.dash"),
          _raw: i,
        };
      }),
    [invoices, custMap, groupMap, locale, t],
  );

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (filterCustomer && r.customer_id !== filterCustomer) return false;
      if (filterMethod && r.method !== filterMethod) return false;
      if (filterGroup && r.group_id !== filterGroup) return false;
      if (filterFrom && r._date && r._date < filterFrom) return false;
      if (filterTo && r._date && r._date > filterTo) return false;
      return true;
    });
  }, [allRows, filterCustomer, filterMethod, filterGroup, filterFrom, filterTo]);

  useEffect(() => { setActiveIdx(-1); }, [rows]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
  }, [rows.length]);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.receipts.title")} />

      {/* Filters */}
      <div className="rounded-md mb-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
        <button
          type="button"
          onClick={() => setFiltersOpen((s) => !s)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm"
          style={{ color: "#1d4ed8" }}
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {t("users.filters.title")}
          </span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {filtersOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
          </svg>
        </button>
        {filtersOpen && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <label style={labelStyle}>العميل:</label>
              <select style={inputStyle} value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
                <option value="">الكل</option>
                {(customers as any[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>طريقة الدفع:</label>
              <select style={inputStyle} value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}>
                <option value="">الكل</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>مجموعة العملاء:</label>
              <select style={inputStyle} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
                <option value="">الكل</option>
                {(groups as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>من تاريخ:</label>
              <input type="date" style={inputStyle} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>إلى تاريخ:</label>
              <input type="date" style={inputStyle} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setFilterCustomer(""); setFilterMethod(""); setFilterGroup(""); setFilterFrom(""); setFilterTo(""); }}
                style={{ height: 36, padding: "0 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer", fontSize: 13, color: "#374151" }}
              >
                إعادة تعيين
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={tableRef} onKeyDown={handleKeyDown} tabIndex={0} style={{ outline: "none" }}>
        <ReportTable
          rows={rows}
          initialCols={cols}
          rowKey={(r) => r.id}
          searchFields={(r) => `${r.ref} ${r.customer} ${r.sale_no}`}
          cellFor={(r, k) => {
            if (k === "option") {
              return (
                <button
                  type="button"
                  onClick={() => setInspect(r)}
                  title={t("common.inspect") || "Inspect"}
                  style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#374151", display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              );
            }
            if (k === "sale_no") {
              const v = (r as any).sale_no;
              return (
                <button
                  type="button"
                  onClick={() => setOpenInvoice(r)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#2563eb", textDecoration: "underline", font: "inherit" }}
                >
                  {v}
                </button>
              );
            }
            const v = (r as any)[k];
            if (typeof v === "number") return v.toFixed(2);
            return v;
          }}
          numericKeys={["paid_amount"]}
          exportName="receipts-report"
          printTitle="receipts-report"
          activeIdx={activeIdx}
          onRowClick={(r, i) => setActiveIdx(i)}
        />
      </div>
      <ReceiptDetailsModal open={!!inspect} onOpenChange={(v) => !v && setInspect(null)} receipt={inspect} />
      <InvoiceDetailsModal
        open={!!openInvoice}
        onOpenChange={(v) => !v && setOpenInvoice(null)}
        invoice={openInvoice?._raw ?? null}
        customerName={openInvoice?.customerName ?? ""}
        customerPhone={openInvoice?.customerPhone ?? ""}
        customerAddress={openInvoice?.customerAddress ?? ""}
        onPrint={() => {}}
      />
    </div>
  );
}
