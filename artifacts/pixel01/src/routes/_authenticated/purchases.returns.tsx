import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";
import { usePurchaseReturns, usePurchases } from "@/hooks/use-purchases";
import { useContacts } from "@/hooks/use-contacts";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { PurchaseReturnModal } from "@/components/purchases/PurchaseReturnModal";
import { PurchaseReturnLookupModal } from "@/components/purchases/PurchaseReturnLookupModal";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases/returns")({
  component: PurchaseReturnsPage,
});

function PurchaseReturnsPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };

  const cols0: ColumnDef[] = useMemo(() => ([
    { key: "opt", label: t("purchases.table.opt"), visible: true },
    { key: "return_date", label: t("purchases.table.date"), visible: true },
    { key: "ref_no", label: t("purchases.table.ref"), visible: true },
    { key: "purchase_ref", label: t("purchases.table.original_ref"), visible: true },
    { key: "supplier", label: t("purchases.table.supplier"), visible: true },
    { key: "total_amount", label: t("purchases.table.total"), visible: true },
    { key: "added_by", label: "أنشئ بواسطة", visible: true },
  ]), [t]);

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<ColumnDef[]>(cols0);
  useEffect(() => { setCols((prev) => prev.map((c, i) => ({ ...c, label: cols0[i]?.label ?? c.label }))); }, [cols0]);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: rows = [] } = usePurchaseReturns();
  const { data: purchases = [] } = usePurchases();
  const { data: suppliers = [] } = useContacts("supplier");
  const { data: empMap = {} } = useEmployeesMap();
  const [editing, setEditing] = useState<any | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [newPurchase, setNewPurchase] = useState<any | null>(null);
  const editingPurchase = useMemo(() => editing ? (purchases as any[]).find((p) => p.id === editing.purchase_id) ?? null : null, [editing, purchases]);
  const editingSupplierName = useMemo(() => {
    if (!editingPurchase) return "";
    const s = (suppliers as any[]).find((x) => x.id === editingPurchase.supplier_id);
    return s ? [s.first_name, s.last_name].filter(Boolean).join(" ") || s.business_name || "" : "";
  }, [editingPurchase, suppliers]);

  const findP = (id?: string | null) => (purchases as any[]).find((p) => p.id === id);
  const supName = (id?: string | null, snapshot?: string | null) => {
    const s = (suppliers as any[]).find((x) => x.id === id);
    if (s) return [s.first_name, s.last_name].filter(Boolean).join(" ") || s.business_name || "";
    return snapshot || "";
  };

  const filtered = useMemo(() => (rows as any[]).filter((r) => !search || [r.ref_no].filter(Boolean).join(" ").includes(search)), [rows, search]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);
  const totalSum = sorted.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const cur = t("purchases.currency");

  const cellFor = (r: any, key: string) => {
    if (key === "purchase_ref") return findP(r.purchase_id)?.purchase_number ?? "";
    if (key === "branch_id") return findP(r.purchase_id)?.branch_id ?? "";
    if (key === "supplier") { const p = findP(r.purchase_id); return supName(p?.supplier_id, p?.supplier_name_snapshot); }
    if (key === "total_amount") return `${Number(r.total_amount ?? 0).toFixed(2)} ${cur}`;
    if (key === "added_by") return r.created_by ? (empMap[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—");
    if (key === "return_date") return formatDateTime(r.created_at || r.return_date);
    return r[key] ?? "";
  };

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.filter((c) => c.key !== "opt").map((c) => c.label),
      sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => cellFor(r, c.key))));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("purchases.page.returns_title")} actions={
        <button onClick={() => setLookupOpen(true)} className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#10b981" }}>
          <Plus className="h-4 w-4" /> إضافة مرتجع
        </button>
      } />
      <DataCard>
        <h3 className="text-sm font-bold mb-3" style={{ color: "#374151" }}>{t("purchases.page.returns_section")}</h3>
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("purchase-returns.csv")} onExportExcel={() => exportCsv("purchase-returns.xls")}
          printRef={printRef} printTitle="purchase-returns"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
                <tr key={r.id}>
                  {visible.map((c) => c.key === "opt" ? (
                    <td key={c.key} style={cellStyle}>
                      <button onClick={() => setEditing(r)} className="h-8 px-2 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#10b981" }}>
                        <Pencil className="h-3 w-3" /> تعديل
                      </button>
                    </td>
                  ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                </tr>
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
      <PurchaseReturnLookupModal
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onFound={(p) => { setLookupOpen(false); setNewPurchase(p); }}
      />
      {newPurchase && (
        <PurchaseReturnModal
          open={!!newPurchase}
          onOpenChange={(v) => !v && setNewPurchase(null)}
          purchase={newPurchase}
          supplierName={supName(newPurchase.supplier_id)}
        />
      )}
      {editing && editingPurchase && (
        <PurchaseReturnModal
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          purchase={editingPurchase}
          supplierName={editingSupplierName}
          existingReturn={editing}
        />
      )}
    </div>
  );
}
