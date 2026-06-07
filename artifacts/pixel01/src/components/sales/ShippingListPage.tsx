import { useEffect, useMemo, useRef, useState } from "react";
import { Truck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { FilterBar, type FilterField } from "@/components/shared/FilterBar";
import { exportToCsv, exportToXls } from "@/lib/csv";
import { useContacts } from "@/hooks/use-contacts";
import { useInvoicesByType } from "@/hooks/use-invoices";
import { EditShippingModal } from "./EditShippingModal";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export function ShippingListPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151" };

  const SHIP_LABEL: Record<string, string> = { pending: t("sales.ship.pending"), delivered: t("sales.ship.delivered"), shipped: t("sales.ship.shipped"), returned: t("sales.ship.returned") };
  const PAY_LABEL: Record<string, string> = { paid: t("sales.status.paid"), unpaid: t("sales.status.unpaid"), partial: t("sales.status.partial") };

  const baseCols: ColumnDef[] = [
    { key: "opt", label: t("sales.cols.option"), visible: true },
    { key: "issue_date", label: t("sales.cols.date"), visible: true },
    { key: "invoice_number", label: t("sales.cols.invoice_no"), visible: true },
    { key: "customer", label: t("sales.cols.customer"), visible: true },
    { key: "phone", label: t("sales.cols.phone"), visible: true },
    { key: "delivery_person", label: t("sales.cols.delivery_person"), visible: true },
    { key: "shipping_status", label: t("sales.cols.shipping_status"), visible: true },
    { key: "payment_status", label: t("sales.cols.payment_status"), visible: true },
  ];

  const { data: rows = [] } = useInvoicesByType("sale");
  const { data: customers = [] } = useContacts("customer");

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(baseCols);
  const [filters, setFilters] = useState({ from: "", to: "", shipping_status: "" });
  const [editShipId, setEditShipId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const editInvoice = useMemo(() => (rows as any[]).find((r) => r.id === editShipId) || null, [rows, editShipId]);

  const custName = (id?: string | null) => {
    const c = (customers as any[]).find((x) => x.id === id);
    return c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || c.contact_id : t("sales.filters.cash_customer");
  };
  const custPhone = (id?: string | null) => {
    const c = (customers as any[]).find((x) => x.id === id);
    return c?.mobile || c?.phone || "";
  };

  const shippable = useMemo(
    () => (rows as any[]).filter((r) => r.shipping_status && r.shipping_status !== "pending" || r.delivery_person || r.shipping_address),
    [rows]
  );

  const filtered = useMemo(() => shippable.filter((r) => {
    const cn = custName(r.customer_id);
    if (search && ![r.invoice_number, cn, r.delivery_person].filter(Boolean).join(" ").includes(search)) return false;
    const d = (r.issue_date ?? "").slice(0, 10);
    const ff = (filters.from ?? "").slice(0, 10);
    const tt = (filters.to ?? "").slice(0, 10);
    if (ff && (!d || d < ff)) return false;
    if (tt && (!d || d > tt)) return false;
    if (filters.shipping_status && r.shipping_status !== filters.shipping_status) return false;
    return true;
  }), [shippable, search, customers, filters]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, filters]);

  const filterFields: FilterField[] = [
    { type: "date", key: "from", label: t("sales.filters.from"), value: filters.from },
    { type: "date", key: "to", label: t("sales.filters.to"), value: filters.to },
    { type: "select", key: "shipping_status", label: t("sales.filters.shipping_status"), value: filters.shipping_status, options: [
      { value: "pending", label: t("sales.ship.pending") }, { value: "shipped", label: t("sales.ship.shipped") },
      { value: "delivered", label: t("sales.ship.delivered") }, { value: "returned", label: t("sales.ship.returned") },
    ] },
  ];

  const pageSize = Number(perPage);
  const totalRows = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const cellFor = (r: any, key: string) => {
    if (key === "customer") return custName(r.customer_id);
    if (key === "phone") return custPhone(r.customer_id);
    if (key === "delivery_person") return r.delivery_person || "—";
    if (key === "shipping_status") return SHIP_LABEL[r.shipping_status] || "—";
    if (key === "payment_status") return PAY_LABEL[r.payment_status] || "—";
    return r[key] ?? "";
  };

  const exportHeaders = visible.filter((c) => c.key !== "opt").map((c) => c.label);
  const exportRows = sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => {
    const v = cellFor(r, c.key);
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  }));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("sales.titles.shipping")} />
      <DataCard className="border-gray-300">
        <FilterBar fields={filterFields}
          onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
          onReset={() => setFilters({ from: "", to: "", shipping_status: "" })} />
        <TableToolbar
          search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportToCsv("shipping.csv", exportHeaders, exportRows)}
          onExportExcel={() => exportToXls("shipping.xls", exportHeaders, exportRows)}
          printRef={printRef} printTitle={t("sales.titles.shipping")}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
        />
        <div className="overflow-x-auto rounded-md print-table-area" ref={printRef} style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r) => (
                <tr key={r.id}>
                  {visible.map((c) => c.key === "opt" ? (
                    <td key={c.key} style={cellStyle} data-print-hide="1">
                      <button onClick={() => setEditShipId(r.id)} className="h-8 px-3 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#3b82f6" }}>
                        <Truck className="h-3 w-3" /> {t("sales.actions.edit")}
                      </button>
                    </td>
                  ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableFooter from={from} to={to} total={totalRows} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      <EditShippingModal open={!!editInvoice} onOpenChange={(v) => !v && setEditShipId(null)} invoice={editInvoice} />
    </div>
  );
}
