import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Printer, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReturnFormModal } from "./ReturnFormModal";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { FilterBar, type FilterField } from "@/components/shared/FilterBar";
import { exportToCsv, exportToXls } from "@/lib/csv";
import { useContacts } from "@/hooks/use-contacts";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { useInvoicesByType, useInvoiceItems, useCashierSessions } from "@/hooks/use-invoices";
import { InvoiceDetailsModal } from "./InvoiceDetailsModal";
import { PrintableInvoice, type PrintMode } from "./PrintableInvoice";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export function SalesReturnsPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151" };

  const baseCols: ColumnDef[] = [
    { key: "opt", label: t("sales.cols.option"), visible: true },
    { key: "issue_date", label: t("sales.cols.date"), visible: true },
    { key: "invoice_number", label: t("sales.cols.invoice_no"), visible: true },
    { key: "original", label: t("sales.cols.original_sale"), visible: true },
    { key: "customer", label: t("sales.cols.customer"), visible: true },
    { key: "total", label: t("sales.cols.amount"), visible: true },
    { key: "added_by", label: "أنشئ بواسطة", visible: true },
  ];

  const { data: rows = [] } = useInvoicesByType("sale_return");
  const { data: customers = [] } = useContacts("customer");
  const { data: empMap = {} } = useEmployeesMap();
  const { data: sessions = [] } = useCashierSessions();
  const activeSession = sessions.find((s: any) => s.status === 'open');

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(baseCols);
  const [filters, setFilters] = useState({ from: "", to: "", customer_id: "" });
  const printRef = useRef<HTMLDivElement>(null);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printMode] = useState<PrintMode>("invoice");
  const [editingReturn, setEditingReturn] = useState<any | null>(null);
  const [editOriginal, setEditOriginal] = useState<any | null>(null);

  const openEdit = async (ret: any) => {
    if (!ret?.is_returned_from_id) {
      const { toast } = await import("sonner");
      toast.error("لا يمكن تحديد الفاتورة الأصلية لهذا المرتجع");
      return;
    }
    const { data: orig, error } = await supabase
      .from("invoices").select("*").eq("id", ret.is_returned_from_id).maybeSingle();
    if (error || !orig) {
      const { toast } = await import("sonner");
      toast.error("تعذر جلب الفاتورة الأصلية");
      return;
    }
    setEditOriginal(orig);
    setEditingReturn(ret);
  };

  const viewingInvoice = useMemo(() => (rows as any[]).find((r) => r.id === viewingId) || null, [rows, viewingId]);
  const printingInvoice = useMemo(() => (rows as any[]).find((r) => r.id === printingId) || null, [rows, printingId]);
  const { data: printItems = [] } = useInvoiceItems(printingId || undefined);

  useEffect(() => {
    const h = () => setPrintingId(null);
    window.addEventListener("afterprint", h);
    return () => window.removeEventListener("afterprint", h);
  }, []);

  const triggerPrint = (id: string) => {
    setPrintingId(id);
    requestAnimationFrame(() => setTimeout(() => window.print(), 150));
  };

  const custName = (id?: string | null, snapshot?: string | null) => {
    const c = (customers as any[]).find((x) => x.id === id);
    if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || c.contact_id;
    if (snapshot) return snapshot;
    return t("sales.filters.cash_customer");
  };

  const returns = rows as any[];

  const filtered = useMemo(() => returns.filter((r) => {
    const cn = custName(r.customer_id, r.customer_name_snapshot);
    if (search && ![r.invoice_number, cn].filter(Boolean).join(" ").includes(search)) return false;
    const d = (r.issue_date ?? "").slice(0, 10);
    const ff = (filters.from ?? "").slice(0, 10);
    const tt = (filters.to ?? "").slice(0, 10);
    if (ff && (!d || d < ff)) return false;
    if (tt && (!d || d > tt)) return false;
    if (filters.customer_id && r.customer_id !== filters.customer_id) return false;
    return true;
  }), [returns, search, customers, filters]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, filters]);

  const filterFields: FilterField[] = [
    { type: "date", key: "from", label: t("sales.filters.from"), value: filters.from },
    { type: "date", key: "to", label: t("sales.filters.to"), value: filters.to },
    { type: "select", key: "customer_id", label: t("sales.filters.customer"), value: filters.customer_id, options: (customers as any[]).map((c) => ({ value: c.id, label: custName(c.id) })) },
  ];

  const pageSize = Number(perPage);
  const totalRows = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);
  const totalSum = sorted.reduce((s, r) => s + Number(r.total || 0), 0);

  const cellFor = (r: any, key: string) => {
    if (key === "issue_date") {
      const datePart = r.issue_date ? String(r.issue_date).slice(0, 10) : "";
      const timePart = r.created_at ? new Date(r.created_at).toLocaleTimeString(dir === "rtl" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";
      return [datePart, timePart].filter(Boolean).join(" ");
    }
    if (key === "customer") return custName(r.customer_id, r.customer_name_snapshot);
    if (key === "original") return r.notes || "—";
    if (key === "total") return `${Number(r.total || 0).toFixed(2)} ج.م`;
    if (key === "added_by") return r.created_by ? (empMap[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—");
    return r[key] ?? "";
  };

  const exportHeaders = visible.filter((c) => c.key !== "opt").map((c) => c.label);
  const exportRows = sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => {
    const v = cellFor(r, c.key);
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  }));




  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("sales.titles.return_page")} />
      <DataCard className="border-gray-300">
        <FilterBar fields={filterFields}
          onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
          onReset={() => setFilters({ from: "", to: "", customer_id: "" })} />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: "#374151" }}>{t("sales.titles.return_section")}</h3>
        </div>
        <TableToolbar
          search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportToCsv("sales-returns.csv", exportHeaders, exportRows)}
          onExportExcel={() => exportToXls("sales-returns.xls", exportHeaders, exportRows)}
          printRef={printRef} printTitle={t("sales.titles.return_section")}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
        />
        <div className="overflow-x-auto rounded-md print-table-area" ref={printRef} style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r) => (
                <tr key={r.id}>
                  {visible.map((c) => c.key === "opt" ? (
                    <td key={c.key} style={cellStyle}>
                      <div className="flex gap-1">
                        <button onClick={() => setViewingId(r.id)} className="h-8 px-2 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#3b82f6" }}>
                          <Eye className="h-3 w-3" /> {t("sales.actions.view")}
                        </button>
                        <button onClick={() => openEdit(r)} className="h-8 px-2 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#10b981" }}>
                          <Pencil className="h-3 w-3" /> تعديل
                        </button>
                        <button onClick={() => triggerPrint(r.id)} className="h-8 px-2 inline-flex items-center gap-1 text-xs rounded" style={{ backgroundColor: "#fff", border: "1px solid #d1d5db", color: "#374151" }}>
                          <Printer className="h-3 w-3" /> {t("sales.actions.print")}
                        </button>
                      </div>
                    </td>
                  ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                </tr>
              ))}
            </tbody>
            {pageRows.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: "#f3f4f6" }}>
                  <td colSpan={Math.max(1, visible.length - 1)} style={{ ...cellStyle, fontWeight: 700 }}>{t("sales.report.total_label")}</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{totalSum.toFixed(2)} ج.م</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TableFooter from={from} to={to} total={totalRows} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      <InvoiceDetailsModal
        open={!!viewingInvoice}
        onOpenChange={(v) => !v && setViewingId(null)}
        invoice={viewingInvoice}
        customerName={viewingInvoice ? custName(viewingInvoice.customer_id, viewingInvoice.customer_name_snapshot) : ""}
        customerPhone={""}
        onPrint={() => {
          const id = viewingInvoice?.id;
          if (!id) return;
          setViewingId(null);
          setTimeout(() => triggerPrint(id), 200);
        }}
      />

      <ReturnFormModal
        open={!!editingReturn}
        onOpenChange={(v) => { if (!v) { setEditingReturn(null); setEditOriginal(null); } }}
        original={editOriginal}
        returnInvoice={editingReturn}
        sessionId={activeSession?.id}
      />




      {printingInvoice && (
        <PrintableInvoice mode={printMode} invoice={printingInvoice} items={printItems as any[]}
          customerName={custName(printingInvoice.customer_id, printingInvoice.customer_name_snapshot)} customerPhone="" />
      )}
    </div>
  );
}
