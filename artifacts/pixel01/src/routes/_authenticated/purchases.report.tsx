import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";
import { exportSingleSheet } from "@/lib/excel-export";
import { usePurchases, usePurchaseItems } from "@/hooks/use-purchases";
import { useContacts } from "@/hooks/use-contacts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";

export const Route = createFileRoute("/_authenticated/purchases/report")({
  component: PurchasesReportPage,
});

function PurchasesReportPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };
  const inp: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, outline: "none", color: "#374151" };
  const lbl: React.CSSProperties = { fontSize: 12, color: "#374151", marginBottom: 4, display: "block" };

  const cols0: ColumnDef[] = useMemo(() => ([
    { key: "name", label: t("purchases.report.item"), visible: true },
    { key: "sku", label: t("purchases.report.sku"), visible: true },
    { key: "supplier", label: t("purchases.table.supplier"), visible: true },
    { key: "ref_no", label: t("purchases.table.ref"), visible: true },
    { key: "purchase_date", label: t("purchases.table.date"), visible: true },
    { key: "quantity", label: t("purchases.report.qty"), visible: true },
    { key: "damaged_total", label: t("purchases.report.damaged"), visible: true },
    { key: "unit_price", label: t("purchases.report.unit_price"), visible: true },
    { key: "total", label: t("purchases.table.total"), visible: true },
  ]), [t]);

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<ColumnDef[]>(cols0);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailsPurchase, setDetailsPurchase] = useState<any | null>(null);
  useEffect(() => { setCols((prev) => prev.map((c, i) => ({ ...c, label: cols0[i]?.label ?? c.label }))); }, [cols0]);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: items = [] } = usePurchaseItems();
  const { data: purchases = [] } = usePurchases();
  const { data: suppliers = [] } = useContacts("supplier");
  const { data: products = [] } = useQuery({
    queryKey: ["products_min_brand"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,sku,brand_id");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: brands = [] } = useQuery({
    queryKey: ["brands_min"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("brands").select("id,name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of purchases as any[]) m.set(p.id, p);
    return m;
  }, [purchases]);
  const supName = (id?: string | null) => {
    const s = (suppliers as any[]).find((x) => x.id === id);
    return s ? (s.business_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "") : "";
  };
  const prodById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of products as any[]) m.set(p.id, p);
    return m;
  }, [products]);

  const enriched = (items as any[]).map((it) => {
    const p = purchById.get(it.purchase_id);
    const prod = it.product_id ? prodById.get(it.product_id) : null;
    return {
      ...it,
      name: prod?.name || it.description,
      sku: prod?.sku || "",
      brand_id: prod?.brand_id || "",
      ref_no: p?.ref_no || p?.purchase_number || "",
      purchase_date: p?.purchase_date || p?.issue_date || "",
      purchase_date_raw: p?.purchase_date || p?.issue_date || "",
      supplier: supName(p?.supplier_id),
      supplier_id: p?.supplier_id || "",
      _purchase: p,
      damaged_total: 0,
    };
  });

  const filtered = useMemo(() => enriched.filter((r) => {
    if (search && ![r.name, r.sku, r.supplier, r.ref_no].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    if (supplierFilter && r.supplier_id !== supplierFilter) return false;
    if (brandFilter && r.brand_id !== brandFilter) return false;
    if (dateFrom && (!r.purchase_date_raw || r.purchase_date_raw < dateFrom)) return false;
    if (dateTo && (!r.purchase_date_raw || r.purchase_date_raw > dateTo)) return false;
    return true;
  }), [enriched, search, supplierFilter, brandFilter, dateFrom, dateTo]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, supplierFilter, brandFilter, dateFrom, dateTo]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);
  const totalSum = sorted.reduce((s, r) => s + Number(r.total || 0), 0);
  const cur = t("purchases.currency");

  const cellFor = (r: any, key: string) => {
    if (key === "ref_no") {
      const ref = r.ref_no;
      if (!ref) return "";
      return (
        <button
          type="button"
          onClick={() => setDetailsPurchase(r._purchase || null)}
          style={{ background: "none", border: "none", padding: 0, color: "#1d4ed8", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
        >
          {ref}
        </button>
      );
    }
    if (key === "unit_price" || key === "total") return Number(r[key] ?? 0).toFixed(2);
    if (key === "quantity" || key === "damaged_total") return Number(r[key] ?? 0).toFixed(2);
    if (key === "purchase_date") {
      const datePart = r.purchase_date_raw ? String(r.purchase_date_raw).slice(0, 10) : "";
      const created = r._purchase?.created_at;
      const timePart = created ? new Date(created).toLocaleTimeString(dir === "rtl" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
      return [datePart, timePart].filter(Boolean).join(" ");
    }
    return r[key] ?? "";
  };

  const exportCsv = (n: string) => {
    const headers = visible.map((c) => c.label);
    const rows = sorted.map((r) => visible.map((c) => {
      if (c.key === "ref_no") return r.ref_no ?? "";
      const v = cellFor(r, c.key);
      return typeof v === "string" || typeof v === "number" ? v : String(r[c.key] ?? "");
    }));
    if (n.endsWith(".xls") || n.endsWith(".xlsx")) {
      const objects = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
      exportSingleSheet(n.replace(/\.xls$/, ".xlsx"), objects, "Purchases");
    } else {
      exportToCsv(n, headers, rows as any);
    }
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("purchases.page.report_title")} />
      <div className="rounded-md p-3 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
        <div>
          <label style={lbl}>{t("purchases.table.supplier")}</label>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} style={inp}>
            <option value="">{t("users.filters.all")}</option>
            {(suppliers as any[]).map((s) => (
              <option key={s.id} value={s.id}>{s.business_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "—"}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>{t("products.brand") || "الماركة"}</label>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} style={inp}>
            <option value="">{t("users.filters.all")}</option>
            {(brands as any[]).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{t("purchases.table.date")}</label>
          <div className="flex gap-1">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inp} />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inp} />
          </div>
        </div>
      </div>

      <DataCard>
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("purchases-report.csv")} onExportExcel={() => exportCsv("purchases-report.xls")}
          printRef={printRef} printTitle="purchases-report"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any, i) => (
                <tr key={i}>{visible.map((c) => <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}</tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <td colSpan={Math.max(1, visible.length - 1)} style={{ ...cellStyle, fontWeight: 700 }}>{t("purchases.totals.label")}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{totalSum.toFixed(2)} {cur}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>
      <PurchaseDetailsModal
        open={!!detailsPurchase}
        onOpenChange={(v) => !v && setDetailsPurchase(null)}
        purchase={detailsPurchase}
        supplierName={detailsPurchase ? supName(detailsPurchase.supplier_id) : ""}
      />
    </div>
  );
}
