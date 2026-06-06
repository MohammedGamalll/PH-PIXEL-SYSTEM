import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { PageHeader } from "@/components/products/PageHeader";
import { ReportTable } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { usePurchases } from "@/hooks/use-purchases";
import { useContacts } from "@/hooks/use-contacts";
import { useI18n } from "@/lib/i18n";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reports/payments")({
  component: PaymentsReportPage,
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

/** Simple payment-details dialog (mirrors ReceiptDetailsModal for supplier payments) */
function PaymentDetailsModal({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: any | null;
}) {
  const { t, dir } = useI18n();
  if (!payment) return null;
  const row: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
    color: "#374151",
  };
  const lbl: React.CSSProperties = { color: "#6b7280", fontWeight: 600 };
  const fields: Array<[string, any]> = [
    [t("reports.col.ref"), payment.ref],
    [t("reports.col.paid_on"), payment.paid_on],
    [t("reports.col.paid_amount"), `${Number(payment.paid_amount || 0).toFixed(2)}`],
    [t("reports.col.supplier"), payment.supplier],
    [t("reports.col.method"), payment.method],
    [t("reports.col.purchase_no"), payment.purchase_no],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t("reports.col.ref")} #{payment.ref}</DialogTitle>
        </DialogHeader>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}>
          {fields.map(([k, v]) => (
            <div key={k} style={row}>
              <span style={lbl}>{k}</span>
              <span>{v ?? "—"}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close") || "إغلاق"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsReportPage() {
  const { t, dir, lang } = useI18n();
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const { data: purchases = [] } = usePurchases();
  const { data: suppliers = [] } = useContacts("supplier");

  // Filters
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Modal state
  const [inspect, setInspect] = useState<any | null>(null);
  const [openPurchase, setOpenPurchase] = useState<any | null>(null);

  // Keyboard navigation
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const tableRef = useRef<HTMLDivElement>(null);

  const cols: ColumnDef[] = [
    { key: "ref", label: t("reports.col.ref"), visible: true },
    { key: "paid_on", label: t("reports.col.paid_on"), visible: true },
    { key: "paid_amount", label: t("reports.col.paid_amount"), visible: true },
    { key: "supplier", label: t("reports.col.supplier"), visible: true },
    { key: "method", label: t("reports.col.method"), visible: true },
    { key: "purchase_no", label: t("reports.col.purchase_no"), visible: true },
    { key: "option", label: t("reports.col.option"), visible: true },
  ];

  const supMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers as any[]) {
      m.set(s.id, s.business_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || t("reports.dash"));
    }
    return m;
  }, [suppliers, t]);

  const allRows = useMemo(
    () =>
      (purchases as any[])
        .filter((p) => Number(p.paid_amount || 0) > 0)
        .map((p) => ({
          id: p.id,
          _raw: p,
          ref: p.ref_no || p.purchase_number || t("reports.dash"),
          paid_on: p.purchase_date ? new Date(p.purchase_date).toLocaleDateString(locale) : t("reports.dash"),
          _date: p.purchase_date ? String(p.purchase_date).slice(0, 10) : "",
          paid_amount: Number(p.paid_amount || 0),
          supplier: p.supplier_id ? supMap.get(p.supplier_id) || t("reports.dash") : t("reports.dash"),
          supplier_id: p.supplier_id || "",
          method: p.payment_method || t("reports.dash"),
          purchase_no: p.purchase_number || t("reports.dash"),
          option: "",
        })),
    [purchases, supMap, locale, t],
  );

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (filterSupplier && r.supplier_id !== filterSupplier) return false;
      if (filterFrom && r._date && r._date < filterFrom) return false;
      if (filterTo && r._date && r._date > filterTo) return false;
      return true;
    });
  }, [allRows, filterSupplier, filterFrom, filterTo]);

  // Reset active index when rows change
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

  const supplierName = useMemo(() => {
    if (!openPurchase) return "";
    return openPurchase._raw?.supplier_id ? supMap.get(openPurchase._raw.supplier_id) || "" : "";
  }, [openPurchase, supMap]);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.payments.title")} />

      {/* Filters */}
      <div className="rounded-md mb-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
        <button
          type="button"
          onClick={() => setFiltersOpen((s) => !s)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm"
          style={{ color: "#1d4ed8" }}
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
            {t("users.filters.title")}
          </span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {filtersOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
          </svg>
        </button>
        {filtersOpen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <label style={labelStyle}>المورد:</label>
              <select style={inputStyle} value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
                <option value="">الكل</option>
                {(suppliers as any[]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.business_name || [s.first_name, s.last_name].filter(Boolean).join(" ")}
                  </option>
                ))}
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
                onClick={() => { setFilterSupplier(""); setFilterFrom(""); setFilterTo(""); }}
                style={{ height: 36, padding: "0 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer", fontSize: 13, color: "#374151" }}
              >
                إعادة تعيين
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table with keyboard navigation */}
      <div ref={tableRef} onKeyDown={handleKeyDown} tabIndex={0} style={{ outline: "none" }}>
        <ReportTable
          rows={rows}
          initialCols={cols}
          rowKey={(r) => r.id}
          searchFields={(r) => `${r.ref} ${r.supplier} ${r.purchase_no}`}
          cellFor={(r, k) => {
            const idx = rows.indexOf(r as any);
            if (k === "option") {
              return (
                <button
                  type="button"
                  onClick={() => setInspect(r)}
                  title="تفاصيل"
                  style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#374151", display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              );
            }
            if (k === "purchase_no") {
              const v = (r as any).purchase_no;
              return (
                <button
                  type="button"
                  onClick={() => setOpenPurchase(r)}
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
          exportName="payments-report"
          printTitle="payments-report"
          activeIdx={activeIdx}
          onRowClick={(r, i) => setActiveIdx(i)}
        />
      </div>

      <PaymentDetailsModal open={!!inspect} onOpenChange={(v) => !v && setInspect(null)} payment={inspect} />
      <PurchaseDetailsModal
        open={!!openPurchase}
        onOpenChange={(v) => !v && setOpenPurchase(null)}
        purchase={openPurchase?._raw ?? null}
        supplierName={supplierName}
      />
    </div>
  );
}
